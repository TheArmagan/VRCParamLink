import { ElectronAPI } from '@electron-toolkit/preload'
import type { DesktopApi } from '../../../shared/src/index.ts'

declare global {
  interface Window {
    electron: ElectronAPI
    api: DesktopApi
  }
}
