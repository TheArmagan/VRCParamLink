import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS, type ParamValue } from '../../../shared/src/index.ts'
import { applySelfAvatarChange, getAppState, isInputSendEnabled, isInputReceiveEnabled, isTrackingSendEnabled, isTrackingReceiveEnabled, passesFilter, setAppVersion, setInputSendEnabled, setInputReceiveEnabled, setParamSyncEnabled, setLocalPlaybackEnabled, setTrackingSendEnabled, setTrackingReceiveEnabled, updateDisplayName } from './lib/app-state.ts'
import { BackendClient } from './lib/backend-client.ts'
import { OscSyncService } from './lib/osc-sync.ts'
import { TrackerBridge } from './lib/tracker-bridge.ts'
import { TrackerPipeClient } from './lib/tracker-pipe-client.ts'
import { ensureVirtualHmdForReceive, disableVirtualHmd, recoverVirtualHmdIfNeeded } from './lib/virtual-hmd.ts'
import { ensureDriverRegistered } from './lib/driver-manager.ts'
import { checkForUpdates } from './lib/auto-updater.ts'

const pipeClient = new TrackerPipeClient()

const trackerBridge = new TrackerBridge({
  onBatch: (batch) => {
    if (!isTrackingSendEnabled()) return
    backendClient.sendTrackingBatch(batch)
    console.log('[tracker-bridge] sent tracking batch with', batch.trackers)
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
    pipeClient.sendTrackers(payload.trackers)
  },
  onRoomSnapshot: (snapshot) => {
    oscSync.applySnapshot(snapshot)
  }
})

/**
 * Get the local HMD pose via the tracker bridge and send it to the
 * SteamVR driver as the WorldFromDriver origin so that incoming
 * HMD-relative tracking data is correctly placed at the receiver's
 * head position.
 */
async function calibrateReceiveOrigin(): Promise<void> {
  const wasRunning = trackerBridge.isRunning
  if (!wasRunning) {
    trackerBridge.spawn()
  }

  const pose = await trackerBridge.getHmdPose()
  if (pose) {
    pipeClient.sendOrigin(pose.position, pose.rotation)
    console.log('[tracking-receive] Origin calibrated:', pose.position, pose.rotation)
  } else {
    console.warn('[tracking-receive] Could not get HMD pose for origin calibration')
  }

  // If we spawned the bridge only for this query and tracking send is not enabled, stop it
  if (!wasRunning && !isTrackingSendEnabled()) {
    trackerBridge.destroy()
  }
}

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
      trackerBridge.startTracking()
    } else {
      trackerBridge.stopTracking()
    }
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleTrackingReceive, async (_event, enabled: boolean) => {
    setTrackingReceiveEnabled(enabled)
    if (enabled) {
      const hmdResult = ensureVirtualHmdForReceive()
      if (hmdResult.error) {
        console.error('[virtual-hmd]', hmdResult.error)
      }
      // Connect to our SteamVR driver's pipe (with retries while SteamVR starts)
      pipeClient.connectWithRetry().then(async (ok) => {
        if (!ok) {
          console.error('[tracker-pipe] Could not connect to driver')
          return
        }
        // Calibrate receive origin: get local HMD pose and send to driver
        await calibrateReceiveOrigin()
      })
    } else {
      pipeClient.disconnect()
      disableVirtualHmd()
    }
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.recalibrateTrackingReceive, async () => {
    if (isTrackingReceiveEnabled() && pipeClient.isConnected) {
      await calibrateReceiveOrigin()
    }
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

  recoverVirtualHmdIfNeeded()
  ensureDriverRegistered()

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
  pipeClient.disconnect()
  disableVirtualHmd()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
