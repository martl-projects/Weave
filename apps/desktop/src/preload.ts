import { contextBridge, ipcRenderer } from 'electron';
import type { FeedItem } from '@weave/node/client';

/** The only bridge between the sandboxed renderer and the main process. */
contextBridge.exposeInMainWorld('weave', {
  state: () => ipcRenderer.invoke('weave:state'),
  init: (name: string) => ipcRenderer.invoke('weave:init', name),
  restore: (words: string) => ipcRenderer.invoke('weave:restore', words),
  openApp: (url: string, title: string) => ipcRenderer.invoke('weave:open-app', url, title),
  pickFolder: (title: string) => ipcRenderer.invoke('weave:pick-folder', title),
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('weave:call', method, args),
  onEvent: (listener: (item: FeedItem) => void) => {
    ipcRenderer.on('weave:event', (_event, item: FeedItem) => listener(item));
  },
});
