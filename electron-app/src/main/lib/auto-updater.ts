import { app, dialog } from 'electron'
import { createWriteStream } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'
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

    await downloadFile(asset.browser_download_url, tempPath)

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

async function downloadFile(url: string, dest: string): Promise<void> {
  const response = await fetch(url, {
    headers: { 'User-Agent': `vrcpl-app/${app.getVersion()}` },
    redirect: 'follow'
  })

  if (!response.ok || !response.body) {
    throw new Error(`Download failed: ${response.status}`)
  }

  const fileStream = createWriteStream(dest)
  // @ts-ignore - ReadableStream to NodeJS.ReadableStream compatibility
  await pipeline(response.body, fileStream)
}
