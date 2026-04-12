import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS, type ParamValue } from '../../../shared/src/index.ts'
import { applySelfAvatarChange, getAppState, isInputSendEnabled, isInputReceiveEnabled, isTrackingSendEnabled, isTrackingReceiveEnabled, passesFilter, setAppVersion, setInputSendEnabled, setInputReceiveEnabled, setParamSyncEnabled, setLocalPlaybackEnabled, setTrackingSendEnabled, setTrackingReceiveEnabled, updateDisplayName } from './lib/app-state.ts'
import { BackendClient } from './lib/backend-client.ts'
import { OscSyncService } from './lib/osc-sync.ts'
import { TrackerBridge } from './lib/tracker-bridge.ts'
import { checkForUpdates } from './lib/auto-updater.ts'

const trackerBridge = new TrackerBridge({
  onBatch: (batch) => {
    if (!isTrackingSendEnabled()) return
    backendClient.sendTrackingBatch(batch)
  },
  onError: (error) => {
    console.error('[tracker-bridge]', error)
  },
  onExit: (code) => {
    console.log('[tracker-bridge] exited with code', code)
  }
})

const oscSync = new OscSyncService({
  onLocalParamBatch: async (params, batchSeq) => {
    const state = getAppState()

    if (!state.roomCode) {
      return
    }

    const filtered = params.filter((p) => passesFilter(p.path))
    if (filtered.length === 0) {
      return
    }

    const result = await backendClient.sendParamBatch(batchSeq, filtered)
    if (!result.ok) {
      broadcastAppState()
    }
  },
  onLocalInputBatch: async (params) => {
    const state = getAppState()
    if (!state.roomCode) {
      return
    }
    const result = await backendClient.sendParamBatch(0, params)
    if (!result.ok) {
      broadcastAppState()
    }
  },
  isInputSendEnabled: () => isInputSendEnabled(),
  isInputReceiveEnabled: () => isInputReceiveEnabled(),
  onAvatarChange: (avatarId) => {
    applySelfAvatarChange(avatarId)
    backendClient.sendAvatarChange(avatarId)
    broadcastAppState()
  },
  onVRTrackingDetected: () => {
    if (!isTrackingSendEnabled()) return
    if (!trackerBridge.isRunning) {
      trackerBridge.spawn()
    }
    trackerBridge.startTracking()
  },
  onVRTrackingLost: () => {
    trackerBridge.stopTracking()
  },
  onError: (error) => {
    console.error('[osc] sync error', error)
  }
})

const backendClient = new BackendClient({
  notifyStateChanged: () => {
    broadcastAppState()
  },
  onRemoteParamBatch: (payload) => {
    oscSync.applyRemoteBatch(payload)
  },
  onRemoteParamEdit: (payload) => {
    const state = getAppState()
    if (payload.targetSessionId === state.selfSessionId) {
      for (const param of payload.params) {
        oscSync.sendSingleParam(param)
      }
    }
  },
  onRemoteTrackingBatch: (payload) => {
    if (!isTrackingReceiveEnabled()) return
    oscSync.sendTrackingToVRChat(payload.trackers)
  },
  onRoomSnapshot: (snapshot) => {
    oscSync.applySnapshot(snapshot)
  }
})

function createWindow(): void {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 600,
    autoHideMenuBar: true,
    resizable: false,
    frame: false,
    backgroundColor: '#00000000',
    backgroundMaterial: 'acrylic',
    center: true,
    darkTheme: true,
    show: false,
    ...(process.platform === 'linux' ? { icon } : {}),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false
    }
  })

  mainWindow.on('ready-to-show', () => {
    mainWindow.show()
  })

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // HMR for renderer base on electron-vite cli.
  // Load the remote URL for development or the local html file for production.
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

function broadcastAppState(): void {
  const nextState = getAppState()

  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send(IPC_CHANNELS.stateChanged, nextState)
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle(IPC_CHANNELS.getState, () => {
    return getAppState()
  })

  ipcMain.handle(IPC_CHANNELS.updateDisplayName, (_event, displayName: string) => {
    if (getAppState().roomCode) {
      return backendClient.updateDisplayName(displayName)
    }

    const result = updateDisplayName(displayName)

    if (result.ok) {
      broadcastAppState()
    }

    return result
  })

  ipcMain.handle(IPC_CHANNELS.closeWindow, async () => {
    app.quit()
  })

  ipcMain.handle(IPC_CHANNELS.createRoom, async () => {
    return backendClient.createRoom()
  })

  ipcMain.handle(IPC_CHANNELS.joinRoom, async (_event, roomCode: string) => {
    return backendClient.joinRoom(roomCode)
  })

  ipcMain.handle(IPC_CHANNELS.leaveRoom, async () => {
    return backendClient.leaveRoom()
  })

  ipcMain.handle(IPC_CHANNELS.takeOwner, async () => {
    return backendClient.takeOwner()
  })

  ipcMain.handle(IPC_CHANNELS.updateRoomSettings, async (_event, settings) => {
    return backendClient.updateRoomSettings(settings)
  })

  ipcMain.handle(IPC_CHANNELS.toggleParamSync, async (_event, path: string, enabled: boolean) => {
    setParamSyncEnabled(path, enabled)
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleLocalPlayback, async (_event, enabled: boolean) => {
    setLocalPlaybackEnabled(enabled)
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleInputSend, async (_event, enabled: boolean) => {
    setInputSendEnabled(enabled)
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleInputReceive, async (_event, enabled: boolean) => {
    setInputReceiveEnabled(enabled)
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleTrackingSend, async (_event, enabled: boolean) => {
    setTrackingSendEnabled(enabled)
    if (enabled) {
      if (!trackerBridge.isRunning) {
        trackerBridge.spawn()
      }
    } else {
      trackerBridge.stopTracking()
    }
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleTrackingReceive, async (_event, enabled: boolean) => {
    setTrackingReceiveEnabled(enabled)
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.editParam, async (_event, targetSessionId: string, param: ParamValue) => {
    const state = getAppState()
    if (targetSessionId === state.selfSessionId && state.localPlaybackEnabled) {
      oscSync.sendSingleParam(param)
    }
    await backendClient.sendRemoteParamEdit(targetSessionId, [param])
  })

  ipcMain.handle(IPC_CHANNELS.sendRemoteParamEdit, async (_event, targetSessionId: string, params: ParamValue[]) => {
    const state = getAppState()
    if (targetSessionId === state.selfSessionId && state.localPlaybackEnabled) {
      for (const param of params) {
        oscSync.sendSingleParam(param)
      }
    }
    await backendClient.sendRemoteParamEdit(targetSessionId, params)
  })

  ipcMain.handle(IPC_CHANNELS.sendAllParams, async () => {
    const state = getAppState()
    if (!state.roomCode || state.parameterList.length === 0) {
      return
    }
    const params: ParamValue[] = state.parameterList
      .filter((entry) => passesFilter(entry.path))
      .map((entry) => ({
        path: entry.path,
        valueType: entry.valueType,
        value: entry.value
      }))
    if (params.length === 0) {
      return
    }
    await backendClient.sendParamBatch(0, params)
  })
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('rest.armagan.vrcparamlink')

  setAppVersion(app.getVersion())

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  oscSync.start()
  registerIpcHandlers()
  createWindow()

  checkForUpdates()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  oscSync.stop()
  trackerBridge.destroy()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
