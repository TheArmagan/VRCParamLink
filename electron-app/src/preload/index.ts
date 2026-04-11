import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'
import {
  IPC_CHANNELS,
  type AppActionResult,
  type DesktopApi,
  type ParamValue,
  type RendererAppState,
  type RoomSettings,
  type UpdateDisplayNameResult
} from '../../../shared/src/index.ts'

// Custom APIs for renderer
const api: DesktopApi = {
  closeWindow: async () => {
    await ipcRenderer.invoke(IPC_CHANNELS.closeWindow)
  },
  getAppState: async () => {
    return (await ipcRenderer.invoke(IPC_CHANNELS.getState)) as RendererAppState
  },
  updateDisplayName: async (displayName) => {
    return (await ipcRenderer.invoke(IPC_CHANNELS.updateDisplayName, displayName)) as UpdateDisplayNameResult
  },
  createRoom: async () => {
    return (await ipcRenderer.invoke(IPC_CHANNELS.createRoom)) as AppActionResult
  },
  joinRoom: async (roomCode) => {
    return (await ipcRenderer.invoke(IPC_CHANNELS.joinRoom, roomCode)) as AppActionResult
  },
  leaveRoom: async () => {
    return (await ipcRenderer.invoke(IPC_CHANNELS.leaveRoom)) as AppActionResult
  },
  takeOwner: async () => {
    return (await ipcRenderer.invoke(IPC_CHANNELS.takeOwner)) as AppActionResult
  },
  updateRoomSettings: async (settings: Partial<RoomSettings>) => {
    return (await ipcRenderer.invoke(IPC_CHANNELS.updateRoomSettings, settings)) as AppActionResult
  },
  toggleParamSync: async (path: string, enabled: boolean) => {
    await ipcRenderer.invoke(IPC_CHANNELS.toggleParamSync, path, enabled)
  },
  editParam: async (param: ParamValue) => {
    await ipcRenderer.invoke(IPC_CHANNELS.editParam, param)
  },
  onStateChanged: (listener) => {
    const subscription = (_event: Electron.IpcRendererEvent, state: RendererAppState) => {
      listener(state)
    }

    ipcRenderer.on(IPC_CHANNELS.stateChanged, subscription)

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.stateChanged, subscription)
    }
  }
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI)
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI
  // @ts-ignore (define in dts)
  window.api = api
}
