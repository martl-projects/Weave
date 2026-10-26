import { contextBridge, ipcRenderer } from 'electron';
import type { FeedItem } from '@weave/node/client';

/** The only bridge between the sandboxed renderer and the main process. */
contextBridge.exposeInMainWorld('weave', {
  state: () => ipcRenderer.invoke('weave:state'),
  init: (name: string) => ipcRenderer.invoke('weave:init', name),
  restore: (words: string) => ipcRenderer.invoke('weave:restore', words),
  enroll: (link: string) => ipcRenderer.invoke('weave:enroll', link),
  openApp: (url: string, title: string) => ipcRenderer.invoke('weave:open-app', url, title),
  pickFolder: (title: string) => ipcRenderer.invoke('weave:pick-folder', title),
  show: () => ipcRenderer.invoke('weave:show'),
  mentions: (action: 'show' | 'hide') => ipcRenderer.invoke('weave:mentions', action),
  route: (hash: string) => ipcRenderer.invoke('weave:route', hash),
  workOn: (post: string) => ipcRenderer.invoke('weave:work-on', post),
  showSession: (host: string) => ipcRenderer.invoke('weave:show-session', host),
  pick: (text: string) => ipcRenderer.invoke('weave:pick', text),
  closePicker: () => ipcRenderer.invoke('weave:picker'),
  onPickerOpen: (listener: () => void) => {
    ipcRenderer.on('weave:picker-open', () => listener());
  },
  onPanelSession: (listener: (session: string) => void) => {
    ipcRenderer.on('weave:panel-session', (_event, session: string) => listener(session));
  },
  onRoute: (listener: (hash: string) => void) => {
    ipcRenderer.on('weave:route', (_event, hash: string) => listener(hash));
  },
  platform: process.platform,
  windowControl: (action: string) => ipcRenderer.invoke('weave:window', action),
  onWindowState: (listener: (state: { maximized: boolean; focused: boolean }) => void) => {
    ipcRenderer.on('weave:window-state', (_event, state) => listener(state));
  },
  attention: () => ipcRenderer.invoke('weave:attention'),
  lensBase: (release: string) => `weave-lens://lens/${encodeURIComponent(release)}/`,
  call: (method: string, ...args: unknown[]) => ipcRenderer.invoke('weave:call', method, args),
  onEvent: (listener: (item: FeedItem) => void) => {
    ipcRenderer.on('weave:event', (_event, item: FeedItem) => listener(item));
  },
  onLink: (listener: (link: string) => void) => {
    ipcRenderer.on('weave:link', (_event, link: string) => listener(link));
  },
});
