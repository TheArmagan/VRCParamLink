import { execSync, spawn as cpSpawn } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs'
import { join } from 'path'
import { tmpdir } from 'os'

const BACKUP_PATH = join(tmpdir(), 'vrcpl-driver-null-backup.json')

let cachedSteamPath: string | null = null
let didWeEnableVirtualHmd = false

function findSteamPath(): string | null {
  if (cachedSteamPath) return cachedSteamPath

  const registryKeys = [
    'HKLM\\SOFTWARE\\Valve\\Steam',
    'HKLM\\SOFTWARE\\WOW6432Node\\Valve\\Steam',
    'HKCU\\SOFTWARE\\Valve\\Steam'
  ]

  for (const key of registryKeys) {
    try {
      const output = execSync(`reg query "${key}" /v InstallPath`, {
        encoding: 'utf-8',
        windowsHide: true
      })
      const match = output.match(/InstallPath\s+REG_SZ\s+(.+)/)
      if (match) {
        const path = match[1].trim()
        if (existsSync(path)) {
          cachedSteamPath = path
          return path
        }
      }
    } catch {
      // try next key
    }
  }

  return null
}

function getVRSettingsPath(): string | null {
  const steam = findSteamPath()
  if (!steam) return null
  return join(steam, 'config', 'steamvr.vrsettings')
}

export function isVRServerRunning(): boolean {
  try {
    const output = execSync('tasklist /FI "IMAGENAME eq vrserver.exe" /NH', {
      encoding: 'utf-8',
      windowsHide: true
    })
    return output.toLowerCase().includes('vrserver.exe')
  } catch {
    return false
  }
}

/**
 * Enable SteamVR's null driver to create a virtual HMD.
 * This modifies steamvr.vrsettings — the original value is backed up to disk and restored on disable.
 */
export function enableVirtualHmd(): { ok: boolean; error?: string } {
  const settingsPath = getVRSettingsPath()
  if (!settingsPath) {
    return { ok: false, error: 'Steam installation not found' }
  }

  try {
    let config: Record<string, unknown> = {}

    if (existsSync(settingsPath)) {
      const content = readFileSync(settingsPath, 'utf-8')
      config = JSON.parse(content)
    } else {
      const dir = join(findSteamPath()!, 'config')
      if (!existsSync(dir)) mkdirSync(dir, { recursive: true })
    }

    // Persist original driver_null to disk so we can recover after a crash
    if (!existsSync(BACKUP_PATH)) {
      const backup = config['driver_null'] ?? null
      writeFileSync(BACKUP_PATH, JSON.stringify(backup))
    }

    config['driver_null'] = {
      enable: true,
      serialNumber: 'VRCPL Virtual HMD',
      modelNumber: 'VRCPL Null HMD',
      windowX: 0,
      windowY: 0,
      windowWidth: 1920,
      windowHeight: 1080,
      renderWidth: 1344,
      renderHeight: 1512,
      secondsFromVsyncToPhotons: 0.011,
      displayFrequency: 90
    }

    writeFileSync(settingsPath, JSON.stringify(config, null, '\t'))
    didWeEnableVirtualHmd = true
    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Failed to modify vrsettings: ${err}` }
  }
}

/**
 * Restore original steamvr.vrsettings driver_null section from disk backup.
 */
export function disableVirtualHmd(): void {
  if (!didWeEnableVirtualHmd && !existsSync(BACKUP_PATH)) return

  const settingsPath = getVRSettingsPath()
  if (!settingsPath || !existsSync(settingsPath)) {
    removeBackup()
    return
  }

  try {
    const content = readFileSync(settingsPath, 'utf-8')
    const config = JSON.parse(content) as Record<string, unknown>

    // Read backup from disk
    if (existsSync(BACKUP_PATH)) {
      const backupRaw = readFileSync(BACKUP_PATH, 'utf-8')
      const originalDriverNull = JSON.parse(backupRaw)

      if (originalDriverNull === null) {
        delete config['driver_null']
      } else {
        config['driver_null'] = originalDriverNull
      }
    } else {
      // No backup file — just disable the driver
      const dn = config['driver_null'] as Record<string, unknown> | undefined
      if (dn) dn['enable'] = false
    }

    writeFileSync(settingsPath, JSON.stringify(config, null, '\t'))
    didWeEnableVirtualHmd = false
    removeBackup()
    console.log('[virtual-hmd] Restored original driver_null settings')
  } catch (err) {
    console.error('[virtual-hmd] Failed to restore vrsettings:', err)
  }
}

function removeBackup(): void {
  try {
    if (existsSync(BACKUP_PATH)) unlinkSync(BACKUP_PATH)
  } catch {
    // ignore
  }
}

/**
 * Recover from a previous crash: if a backup file exists on disk,
 * the app previously modified vrsettings but never cleaned up.
 * Call this once at startup.
 */
export function recoverVirtualHmdIfNeeded(): void {
  if (!existsSync(BACKUP_PATH)) return
  console.log('[virtual-hmd] Found leftover backup — restoring original vrsettings...')
  disableVirtualHmd()
}

/**
 * Launch SteamVR via the steam:// protocol.
 */
export function startSteamVR(): void {
  try {
    cpSpawn('cmd', ['/c', 'start', 'steam://rungameid/250820'], {
      windowsHide: true,
      detached: true,
      stdio: 'ignore'
    }).unref()
  } catch (err) {
    console.warn('[virtual-hmd] steam:// protocol failed, trying vrstartup.exe:', err)
    const steam = findSteamPath()
    if (steam) {
      const vrstartup = join(steam, 'steamapps', 'common', 'SteamVR', 'bin', 'win64', 'vrstartup.exe')
      if (existsSync(vrstartup)) {
        try {
          cpSpawn(vrstartup, [], { windowsHide: true, detached: true, stdio: 'ignore' }).unref()
        } catch (err2) {
          console.error('[virtual-hmd] vrstartup.exe fallback also failed:', err2)
        }
      } else {
        console.error('[virtual-hmd] vrstartup.exe not found at', vrstartup)
      }
    } else {
      console.error('[virtual-hmd] Cannot launch SteamVR — Steam path not found')
    }
  }
}

/**
 * Full flow: if SteamVR is not running, enable null driver and start SteamVR.
 * Returns true if virtual HMD was activated (SteamVR was not already running).
 */
export function ensureVirtualHmdForReceive(): { activated: boolean; error?: string } {
  if (isVRServerRunning()) {
    // SteamVR already running — user is probably in VR, no virtual HMD needed
    return { activated: false }
  }

  const result = enableVirtualHmd()
  if (!result.ok) {
    return { activated: false, error: result.error }
  }

  startSteamVR()
  console.log('[virtual-hmd] Null driver enabled, SteamVR starting...')
  return { activated: true }
}
