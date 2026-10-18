import type { FeedItem } from '@weave/node/client';
import type { RendererMethod } from '../methods.ts';

export interface AppState {
  home: string;
  hasIdentity: boolean;
  connected: boolean;
}

interface Bridge {
  state(): Promise<AppState>;
  init(name: string): Promise<void>;
  call(method: RendererMethod, ...args: unknown[]): Promise<unknown>;
  onEvent(listener: (item: FeedItem) => void): void;
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
};

export const bridge: Bridge = window.weave ?? webBridge;

/** Typed shorthand for backend calls. */
export const api = <T>(method: RendererMethod, ...args: unknown[]): Promise<T> => bridge.call(method, ...args) as Promise<T>;
