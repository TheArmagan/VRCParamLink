import { readFileSync, writeFileSync, existsSync } from 'fs'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

/**
 * Returns the absolute path to the `vrcpl/` driver folder (the one containing
 * `driver.vrdrivermanifest`).
 */
function getDriverFolder(): string {
  if (is.dev) {
    return join(__dirname, '../../../../native-windows/driver-vrcpl/vrcpl')
  }
  return join(process.resourcesPath, 'vrcpl-driver')
}

/**
 * Returns the path to `openvrpaths.vrpath` (%LOCALAPPDATA%/openvr/).
 */
function getOpenVRPathsFile(): string | null {
  const localAppData = process.env.LOCALAPPDATA
  if (!localAppData) return null
  const vrpath = join(localAppData, 'openvr', 'openvrpaths.vrpath')
  return existsSync(vrpath) ? vrpath : null
}

/** Normalise to forward slashes for comparison. */
function norm(p: string): string {
  return p.replace(/\\/g, '/')
}

/** Check whether our driver folder is already in `external_drivers`. */
export function isDriverRegistered(): boolean {
  const vrpath = getOpenVRPathsFile()
  if (!vrpath) return false

  try {
    const data = JSON.parse(readFileSync(vrpath, 'utf-8'))
    const drivers: string[] = data.external_drivers ?? []
    const target = norm(getDriverFolder())
    return drivers.some((d) => norm(d) === target)
  } catch {
    return false
  }
}

/** Add our driver folder to `openvrpaths.vrpath` → `external_drivers`. */
export function registerDriver(): { ok: boolean; error?: string } {
  const driverFolder = getDriverFolder()

  // Verify manifest exists
  if (!existsSync(join(driverFolder, 'driver.vrdrivermanifest'))) {
    return { ok: false, error: `Driver manifest not found in ${driverFolder}` }
  }

  const vrpath = getOpenVRPathsFile()
  if (!vrpath) {
    return { ok: false, error: 'openvrpaths.vrpath not found – is SteamVR installed?' }
  }

  try {
    const data = JSON.parse(readFileSync(vrpath, 'utf-8'))
    if (!Array.isArray(data.external_drivers)) {
      data.external_drivers = []
    }

    const target = norm(driverFolder)
    if (!data.external_drivers.some((d: string) => norm(d) === target)) {
      data.external_drivers.push(driverFolder)
      writeFileSync(vrpath, JSON.stringify(data, null, '\t'))
      console.log('[driver-manager] Registered driver at', driverFolder)
    }

    return { ok: true }
  } catch (err) {
    return { ok: false, error: `Failed to register driver: ${err}` }
  }
}

/** Remove our driver from `external_drivers`. */
export function unregisterDriver(): void {
  const vrpath = getOpenVRPathsFile()
  if (!vrpath) return

  try {
    const data = JSON.parse(readFileSync(vrpath, 'utf-8'))
    if (!Array.isArray(data.external_drivers)) return

    const target = norm(getDriverFolder())
    const before = data.external_drivers.length
    data.external_drivers = data.external_drivers.filter(
      (d: string) => norm(d) !== target
    )

    if (data.external_drivers.length < before) {
      writeFileSync(vrpath, JSON.stringify(data, null, '\t'))
      console.log('[driver-manager] Unregistered driver')
    }
  } catch (err) {
    console.error('[driver-manager] Failed to unregister driver:', err)
  }
}

/**
 * Ensure our SteamVR driver is registered.
 * Call once at app startup.
 */
export function ensureDriverRegistered(): void {
  if (isDriverRegistered()) return
  const result = registerDriver()
  if (!result.ok) {
    console.error('[driver-manager]', result.error)
  }
}
