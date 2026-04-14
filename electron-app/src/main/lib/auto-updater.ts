import { app, dialog, BrowserWindow } from 'electron'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
import { Readable } from 'stream'
import { pipeline } from 'stream/promises'
import { spawn } from 'child_process'
import { net } from 'electron'

const GITHUB_REPO = 'TheArmagan/VRCParamLink'

interface GitHubRelease {
  tag_name: string
  assets: { name: string; browser_download_url: string }[]
}

function parseVersion(tag: string): string {
  return tag.replace(/^v/, '')
}

export async function checkForUpdates(): Promise<void> {
  try {
    const currentVersion = app.getVersion()

    const release = await fetchLatestRelease()
    if (!release) return

    const latestVersion = parseVersion(release.tag_name)

    if (latestVersion === currentVersion) return

    const exeName = `vrcpl-app-${latestVersion}-setup.exe`
    const asset = release.assets.find((a) => a.name === exeName)
    if (!asset) {
      console.warn(`[updater] Setup exe not found in release assets: ${exeName}`)
      return
    }

    const { response } = await dialog.showMessageBox({
      type: 'info',
      title: 'Update Available',
      message: `A new version (v${latestVersion}) is available. You are currently on v${currentVersion}.\nWould you like to update now?`,
      buttons: ['Update', 'Later'],
      defaultId: 0,
      cancelId: 1
    })

    if (response !== 0) return

    const tempPath = join(tmpdir(), exeName)

    // Show progress window
    const progressWin = new BrowserWindow({
      width: 350,
      height: 120,
      resizable: false,
      minimizable: false,
      maximizable: false,
      closable: false,
      frame: false,
      alwaysOnTop: true,
      webPreferences: { nodeIntegration: false, contextIsolation: true }
    })
    progressWin.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(`<!DOCTYPE html>
<html><head><style>
  body{margin:0;padding:16px;font-family:system-ui;background:#1e1e2e;color:#cdd6f4;display:flex;flex-direction:column;justify-content:center;-webkit-app-region:drag}
  .bar-bg{width:100%;height:18px;background:#313244;border-radius:9px;overflow:hidden}
  .bar{height:100%;background:#89b4fa;border-radius:9px;transition:width .2s;width:0%}
  .label{font-size:12px;margin-top:8px;text-align:center;color:#a6adc8}
</style></head><body>
  <div style="font-size:14px;margin-bottom:10px;text-align:center">Downloading update...</div>
  <div class="bar-bg"><div class="bar" id="bar"></div></div>
  <div class="label" id="label">0%</div>
</body></html>`)}`)

    try {
      await downloadFile(asset.browser_download_url, tempPath, (percent) => {
        if (!progressWin.isDestroyed()) {
          progressWin.webContents.executeJavaScript(
            `document.getElementById('bar').style.width='${percent}%';document.getElementById('label').textContent='${percent}%'`
          ).catch(() => { })
        }
      })
    } finally {
      if (!progressWin.isDestroyed()) progressWin.close()
    }

    spawn(tempPath, [], { detached: true, stdio: 'ignore' }).unref()

    app.quit()
  } catch (error) {
    console.error('[updater] Failed to check for updates:', error)
  }
}

async function fetchLatestRelease(): Promise<GitHubRelease | null> {
  const url = `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`

  return new Promise((resolve) => {
    const request = net.request(url)
    request.setHeader('User-Agent', `vrcpl-app/${app.getVersion()}`)
    request.setHeader('Accept', 'application/vnd.github+json')

    let data = ''

    request.on('response', (response) => {
      if (response.statusCode !== 200) {
        console.warn(`[updater] GitHub API returned ${response.statusCode}`)
        resolve(null)
        return
      }

      response.on('data', (chunk) => {
        data += chunk.toString()
      })

      response.on('end', () => {
        try {
          resolve(JSON.parse(data) as GitHubRelease)
        } catch {
          console.warn('[updater] Failed to parse GitHub response')
          resolve(null)
        }
      })
    })

    request.on('error', (err) => {
      console.warn('[updater] Network error:', err)
      resolve(null)
    })

    request.end()
  })
}

async function downloadFile(url: string, dest: string, onProgress?: (percent: number) => void): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': `vrcpl-app/${app.getVersion()}` },
    redirect: 'follow'
  })

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status}`)
  }

  const totalBytes = parseInt(response.headers.get('content-length') || '0', 10)
  let receivedBytes = 0

  const reader = response.body.getReader()
  const nodeStream = new Readable({
    async read() {
      const { done, value } = await reader.read()
      if (done) {
        this.push(null)
        return
      }
      receivedBytes += value.byteLength
      if (totalBytes > 0 && onProgress) {
        onProgress(Math.round((receivedBytes / totalBytes) * 100))
      }
      this.push(Buffer.from(value))
    }
  })

  const fileStream = createWriteStream(dest)
  await pipeline(nodeStream, fileStream)
}
