import { contextBridge, ipcRenderer } from 'electron'
import { electronAPI } from '@electron-toolkit/preload'

const api = {}

if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', {
      ...electronAPI,
      ipcRenderer: {
        ...electronAPI.ipcRenderer,
        invoke: (channel: string, ...args: any[]) => ipcRenderer.invoke(channel, ...args),
        on: (channel: string, listener: (...args: any[]) => void) => {
          const sub = (_event: any, ...args: any[]) => listener(...args)
          ipcRenderer.on(channel, sub)
          return () => {
            ipcRenderer.removeListener(channel, sub)
          }
        }
      }
    })
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {}
} else {
  // @ts-ignore (define in dts)
  window.electron = {
    ...electronAPI,
    ipcRenderer: {
      ...electronAPI.ipcRenderer,
      invoke: ipcRenderer.invoke.bind(ipcRenderer),
      on: (channel: string, listener: (...args: any[]) => void) => {
        const sub = (_event: any, ...args: any[]) => listener(...args)
        ipcRenderer.on(channel, sub)
        return () => {
          ipcRenderer.removeListener(channel, sub)
        }
      }
    }
  }
  // @ts-ignore (define in dts)
  window.api = api
}