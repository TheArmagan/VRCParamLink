import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS, type ParamValue } from '../../../shared/src/index.ts'
import { applySelfAvatarChange, getAppState, isInputSendEnabled, isInputReceiveEnabled, isTrackingSendEnabled, isTrackingReceiveEnabled, isTposeActive, setTposeActive, passesFilter, setAppVersion, setInputSendEnabled, setInputReceiveEnabled, setParamSyncEnabled, setLocalPlaybackEnabled, setTrackingSendEnabled, setTrackingReceiveEnabled, updateDisplayName, updateTrackingSendSlots, updateTrackingReceiveSlots, toggleTrackingSendSlot, toggleTrackingReceiveSlot, getDisabledSendSlotAddresses, getDisabledReceiveSlotAddresses } from './lib/app-state.ts'
import { BackendClient } from './lib/backend-client.ts'
import { OscSyncService } from './lib/osc-sync.ts'
import { TrackerBridge } from './lib/tracker-bridge.ts'
import { TrackerPipeClient } from './lib/tracker-pipe-client.ts'
import { ensureVirtualHmdForReceive, disableVirtualHmd, recoverVirtualHmdIfNeeded } from './lib/virtual-hmd.ts'
import { ensureDriverRegistered } from './lib/driver-manager.ts'
import { checkForUpdates } from './lib/auto-updater.ts'

const pipeClient = new TrackerPipeClient()

// Store the latest sender HMD pose for offset calibration
let lastSenderHmdPose: { position: [number, number, number]; quaternion: [number, number, number, number] } | null = null

// Receiver's live HMD pose, updated every frame from the local tracker bridge
let lastLocalHmdPose: { position: [number, number, number]; quaternion: [number, number, number, number] } | null = null

// Persistent calibration state for dynamic per-frame origin updates
let calibratedSenderYawConj: [number, number, number, number] | null = null

const trackerBridge = new TrackerBridge({
  onBatch: (batch) => {
    // Always capture local HMD pose for receiver dynamic origin
    const localHead = batch.trackers.find((t) => t.address.includes('/head'))
    if (localHead) {
      lastLocalHmdPose = { position: localHead.position, quaternion: localHead.quaternion }
    }
    if (!isTrackingSendEnabled()) return
    // Update active send slots from discovered trackers
    const addresses = batch.trackers.map((t) => t.address)
    updateTrackingSendSlots(addresses)
    // Filter out disabled send slots
    const disabled = getDisabledSendSlotAddresses()
    const filtered = batch.trackers.filter((t) => !disabled.has(t.address))
    if (filtered.length === 0) return
    const payload: { ts: number; trackers: typeof filtered; tpose?: boolean } = { ts: batch.ts, trackers: filtered }
    if (isTposeActive()) payload.tpose = true
    backendClient.sendTrackingBatch(payload)
    broadcastAppState()
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
  onRemoteTposeSync: (payload) => {
    setTposeActive(payload.active)
    if (!payload.active && isTrackingReceiveEnabled() && lastSenderHmdPose) {
      calibrateReceiveOrigin().then(() => {
        broadcastAppState()
        console.log('[tracking-receive] T-Pose remote deactivation – calibrated')
      })
    }
    broadcastAppState()
  },
  onRemoteTrackingBatch: (payload) => {
    if (!isTrackingReceiveEnabled()) return
    // Capture sender's HMD pose for offset calibration
    const headTracker = payload.trackers.find((t) => t.address.includes('/head'))
    if (headTracker) {
      lastSenderHmdPose = { position: headTracker.position, quaternion: headTracker.quaternion }
    }
    // Dynamically update WorldFromDriverOffset every frame so body trackers
    // follow the receiver's real-time HMD position as the sender moves
    if (calibratedSenderYawConj && lastSenderHmdPose && lastLocalHmdPose) {
      const rYaw = quatYawOnly(lastLocalHmdPose.quaternion)
      const dynamicOffsetQ = quatMul(rYaw, calibratedSenderYawConj)
      const sP = lastSenderHmdPose.position
      const rP = lastLocalHmdPose.position
      const rotated = quatRotateVec3(dynamicOffsetQ, sP)
      const dynamicP: [number, number, number] = [
        rP[0] - rotated[0],
        rP[1] - rotated[1],
        rP[2] - rotated[2]
      ]
      pipeClient.sendDynamicOrigin(dynamicP, dynamicOffsetQ)
    }
    // Update active receive slots from all sender trackers
    const addresses = payload.trackers.map((t) => t.address)
    updateTrackingReceiveSlots(addresses)
    // Filter out disabled receive slots (user can toggle head/hands off from UI)
    const disabled = getDisabledReceiveSlotAddresses()
    const filtered = payload.trackers.filter((t) => !disabled.has(t.address))
    if (filtered.length > 0) {
      pipeClient.sendTrackers(filtered)
    }
    broadcastAppState()
  },
  onRoomSnapshot: (snapshot) => {
    oscSync.applySnapshot(snapshot)
  }
})

/**
 * Quaternion math helpers for offset computation.
 * Quaternion format: [w, x, y, z]
 */
function quatConjugate(q: [number, number, number, number]): [number, number, number, number] {
  return [q[0], -q[1], -q[2], -q[3]]
}

function quatMul(a: [number, number, number, number], b: [number, number, number, number]): [number, number, number, number] {
  return [
    a[0] * b[0] - a[1] * b[1] - a[2] * b[2] - a[3] * b[3],
    a[0] * b[1] + a[1] * b[0] + a[2] * b[3] - a[3] * b[2],
    a[0] * b[2] - a[1] * b[3] + a[2] * b[0] + a[3] * b[1],
    a[0] * b[3] + a[1] * b[2] - a[2] * b[1] + a[3] * b[0]
  ]
}

function quatRotateVec3(q: [number, number, number, number], v: [number, number, number]): [number, number, number] {
  const qv: [number, number, number, number] = [0, v[0], v[1], v[2]]
  const result = quatMul(quatMul(q, qv), quatConjugate(q))
  return [result[1], result[2], result[3]]
}

/** Extract yaw-only (Y-axis rotation) from a quaternion, discarding pitch/roll. */
function quatYawOnly(q: [number, number, number, number]): [number, number, number, number] {
  // Yaw angle from quaternion: atan2(2(wy + xz), 1 - 2(y² + x²))
  // But simpler: just keep the Y component and re-normalize
  const [w, _x, y, _z] = q
  const len = Math.sqrt(w * w + y * y)
  if (len < 1e-8) return [1, 0, 0, 0]
  return [w / len, 0, y / len, 0]
}

/**
 * Compute the WorldFromDriver offset transform that maps the sender's
 * world-space tracking data into the receiver's world space.
 *
 * Only the yaw (Y-axis) component of each HMD's rotation is used so
 * the body stays upright — pitch/roll from looking up/down doesn't
 * tilt the entire body.
 *
 * yaw_offset = yaw(receiver_q) * conjugate(yaw(sender_q))
 * offset_pos = receiver_pos - rotate(yaw_offset, sender_pos)
 */
async function calibrateReceiveOrigin(): Promise<void> {
  if (!lastSenderHmdPose) {
    console.warn('[tracking-receive] No sender HMD pose available yet — cannot calibrate')
    return
  }

  const wasRunning = trackerBridge.isRunning
  if (!wasRunning) {
    trackerBridge.spawn()
  }

  const receiverPose = await trackerBridge.getHmdPose()
  if (!receiverPose) {
    console.warn('[tracking-receive] Could not get local HMD pose for origin calibration')
    if (!wasRunning && !isTrackingSendEnabled()) {
      trackerBridge.destroy()
    }
    return
  }

  const sYaw = quatYawOnly(lastSenderHmdPose.quaternion)
  const rYaw = quatYawOnly(receiverPose.quaternion)
  const sP = lastSenderHmdPose.position
  const rP = receiverPose.position

  // Store sender's calibration yaw conjugate for per-frame dynamic updates
  calibratedSenderYawConj = quatConjugate(sYaw)

  // yaw_offset = receiver_yaw * conjugate(sender_yaw)
  const offsetQ = quatMul(rYaw, calibratedSenderYawConj)
  // offset_pos = receiver_pos - rotate(yaw_offset, sender_pos)
  const rotatedSenderPos = quatRotateVec3(offsetQ, sP)
  const offsetP: [number, number, number] = [
    rP[0] - rotatedSenderPos[0],
    rP[1] - rotatedSenderPos[1],
    rP[2] - rotatedSenderPos[2]
  ]

  pipeClient.sendOrigin(offsetP, offsetQ)
  console.log('[tracking-receive] Origin calibrated (yaw-only): pos', offsetP, 'quat', offsetQ)

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
      // Ensure bridge is running so we get live local HMD pose
      if (!trackerBridge.isRunning) {
        trackerBridge.spawn()
      }
      trackerBridge.startTracking()
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
      calibratedSenderYawConj = null
      // Stop bridge if tracking send is also disabled
      if (!isTrackingSendEnabled() && trackerBridge.isRunning) {
        trackerBridge.stopTracking()
      }
    }
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.recalibrateTrackingReceive, async () => {
    if (isTrackingReceiveEnabled() && pipeClient.isConnected) {
      await calibrateReceiveOrigin()
    }
  })

  ipcMain.handle(IPC_CHANNELS.toggleTrackingSendSlot, async (_event, address: string, enabled: boolean) => {
    toggleTrackingSendSlot(address, enabled)
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleTrackingReceiveSlot, async (_event, address: string, enabled: boolean) => {
    toggleTrackingReceiveSlot(address, enabled)
    broadcastAppState()
  })

  ipcMain.handle(IPC_CHANNELS.toggleTposeMode, async (_event, enabled: boolean) => {
    setTposeActive(enabled)
    backendClient.sendTposeSync(enabled)
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
