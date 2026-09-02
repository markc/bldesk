import { contextBridge, ipcRenderer } from 'electron'
import { IpcApi, UpdaterState } from '../shared/ipc-types'

const api: IpcApi = {
  // Vault & Auth
  getProfiles: () => ipcRenderer.invoke('vault:getProfiles'),
  getActiveProfile: () => ipcRenderer.invoke('vault:getActiveProfile'),
  saveProfile: (profile) => ipcRenderer.invoke('vault:saveProfile', profile),
  deleteProfile: (profileId) => ipcRenderer.invoke('vault:deleteProfile', profileId),
  setActiveProfile: (profileId) => ipcRenderer.invoke('vault:setActiveProfile', profileId),

  // Terminal & Console
  launchNativeTerminal: (options) => ipcRenderer.invoke('terminal:launchNative', options),
  openRescueConsole: (options) => ipcRenderer.invoke('console:openRescue', options),

  // SSH Keys
  getLocalSshKeys: () => ipcRenderer.invoke('vault:getLocalSshKeys'),

  // System Notifications
  sendNotification: (options) => ipcRenderer.invoke('system:sendNotification', options),

  // Window Controls
  minimizeWindow: () => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: () => ipcRenderer.invoke('window:maximize'),
  closeWindow: () => ipcRenderer.invoke('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),

  // External Links
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),

  // Auto-update
  getUpdaterState: () => ipcRenderer.invoke('updater:getState'),
  checkForUpdates: () => ipcRenderer.invoke('updater:check'),
  installUpdate: () => ipcRenderer.invoke('updater:install'),
  setUpdateChannel: (channel) => ipcRenderer.invoke('updater:setChannel', channel),
  onUpdaterState: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, state: UpdaterState) => listener(state)
    ipcRenderer.on('updater:state', handler)
    return () => ipcRenderer.removeListener('updater:state', handler)
  },

  // Deep links (bldesk://)
  getPendingDeepLink: () => ipcRenderer.invoke('deeplink:getPending'),
  deepLinkReady: () => ipcRenderer.invoke('deeplink:ready'),
  onDeepLink: (listener) => {
    const handler = (_: Electron.IpcRendererEvent, url: string) => listener(url)
    ipcRenderer.on('deeplink:open', handler)
    return () => ipcRenderer.removeListener('deeplink:open', handler)
  }
}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('bldeskApi', api)
  } catch (error) {
    console.error('Failed to expose bldeskApi in main world:', error)
  }
} else {
  // @ts-ignore (define in window)
  window.bldeskApi = api
}
