import type { FeedItem } from '@weave/node/client';
import type { RendererMethod } from '../methods.ts';

export interface AppState {
  home: string;
  hasIdentity: boolean;
  connected: boolean;
}

interface Bridge {
  state(): Promise<AppState>;
  /** Create the identity; resolves to the recovery words, shown once. */
  init(name: string): Promise<string | undefined>;
  restore(words: string): Promise<void>;
  /** Open a room's shared app in its own window. */
  openApp(url: string, title: string): Promise<void>;
  /** Let the person pick a folder on this computer; undefined if they cancel. */
  pickFolder(title: string): Promise<string | undefined>;
  /** Bring the app's window to the front (a notification was clicked). */
  show(): Promise<void>;
  /** Flash the taskbar button until the person looks. */
  attention(): Promise<void>;
  call(method: RendererMethod, ...args: unknown[]): Promise<unknown>;
  onEvent(listener: (item: FeedItem) => void): void;
  /** A weave: link the app was opened with (clicked somewhere outside it). */
  onLink(listener: (link: string) => void): void;
}

declare global {
  interface Window {
    weave?: Bridge;
  }
}

/**
 * Inside Electron the preload provides `window.weave`. In a plain browser
 * (`npm run dev:web`) the same calls go to the dev server, which forwards them
 * to the daemon.
 */
const webBridge: Bridge = {
  state: () => fetch('/state').then((r) => r.json()),
  openApp: async (url) => {
    window.open(url, '_blank', 'noopener');
  },
  show: async () => window.focus(),
  attention: async () => {},
  // A browser can't hand out folder paths: type it.
  pickFolder: async (title) => prompt(`${title}\n\nThe full path of the folder:`)?.trim() || undefined,
  restore: async () => {
    throw new Error('restore with "weave restore" when using the web preview');
  },
  init: async () => {
    throw new Error('create your identity with "weave init" when using the web preview');
  },
  call: async (method, ...args) => {
    const res = await fetch('/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `request failed: ${res.status}`);
    return data;
  },
  onEvent: (listener) => {
    new EventSource('/events').onmessage = (message) => listener(JSON.parse(message.data));
  },
  // A browser tab is never handed links.
  onLink: () => {},
};

export const bridge: Bridge = window.weave ?? webBridge;

/** Typed shorthand for backend calls. */
export const api = <T>(method: RendererMethod, ...args: unknown[]): Promise<T> => bridge.call(method, ...args) as Promise<T>;
