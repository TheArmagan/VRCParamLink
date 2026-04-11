import { app, shell, BrowserWindow, ipcMain } from 'electron'
import { join } from 'path'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
import icon from '../../resources/icon.png?asset'
import { IPC_CHANNELS } from '../../../shared/src/index.ts'
import { getAppState, updateDisplayName } from './lib/app-state.ts'
import { BackendClient } from './lib/backend-client.ts'
import { OscSyncService } from './lib/osc-sync.ts'

const oscSync = new OscSyncService({
  onLocalParamBatch: async (params, batchSeq) => {
    const state = getAppState()
    const isOwner = Boolean(state.selfSessionId && state.selfSessionId === state.ownerSessionId)

    if (!state.roomCode || (!isOwner && !state.autoOwnerEnabled)) {
      return
    }

    const result = await backendClient.sendParamBatch(batchSeq, params)
    if (!result.ok) {
      broadcastAppState()
    }
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
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {
  // Set app user model id for windows
  electronApp.setAppUserModelId('rest.armagan.vrcparamlink')

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  oscSync.start()
  registerIpcHandlers()
  createWindow()

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  oscSync.stop()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
