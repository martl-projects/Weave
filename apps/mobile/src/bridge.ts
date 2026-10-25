import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { Browser } from '@capacitor/browser';
import { CapacitorBarcodeScanner, CapacitorBarcodeScannerTypeHint } from '@capacitor/barcode-scanner';
import { Device } from '@capacitor/device';
import type { FeedItem } from '@weave/node/client';

/*
 * The phone app's bridge (window.weave), in place of Electron's preload: the
 * desktop's screens call it the same way, and it passes each call to the
 * worker (worklet/phone.ts), which holds the connection to your computer.
 * The native WeaveWorker plugin starts the worker and carries the lines
 * between it and this WebView.
 */

interface WorkerPlugin {
  post(options: { message: string }): Promise<void>;
  /** Keep the worker running while the app is paused (Android: a room's app is open in a browser tab over it). */
  hold(options: { on: boolean }): Promise<void>;
  addListener(event: 'message', listener: (data: { message: string }) => void): Promise<PluginListenerHandle>;
}

const Worker = registerPlugin<WorkerPlugin>('WeaveWorker', { web: () => import('./web-worker.ts').then((m) => new m.WeaveWorkerWeb()) });

const pending = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
const listeners = new Set<(item: FeedItem) => void>();
let next = 1;

void Worker.addListener('message', ({ message }) => {
  const m = JSON.parse(message) as Record<string, unknown>;
  if (typeof m.id === 'number') {
    const call = pending.get(m.id);
    pending.delete(m.id);
    if (typeof m.error === 'string') call?.reject(new Error(m.error));
    else call?.resolve(m.result);
  } else if ('event' in m) {
    for (const listener of listeners) listener(m.event as FeedItem);
  } else if (typeof m.fatal === 'string') {
    console.error('Weave worker:', m.fatal);
  }
});

const post = (message: unknown) => Worker.post({ message: JSON.stringify(message) });
const ask = <T>(op: string, fields: Record<string, unknown> = {}) =>
  new Promise<T>((resolve, reject) => {
    const id = next++;
    pending.set(id, { resolve: resolve as (value: unknown) => void, reject });
    post({ id, op, ...fields }).catch(reject);
  });

// The room's app was closed: the worker may be suspended with the app again.
void Browser.addListener('browserFinished', () => void Worker.hold({ on: false }).catch(() => {}));

// Back in front: reconnect at once rather than at the next retry.
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) post({ op: 'wake' }).catch(() => {});
});

window.weave = {
  async state() {
    const s = await ask<{ paired: boolean; name?: string; connected: boolean }>('state');
    // "home" names whose computer this is, for the screen that says it can't be reached.
    return { home: s.name ?? '', hasIdentity: s.paired, connected: s.connected };
  },
  init: async () => {
    throw new Error('the phone app uses your computer’s identity: pair with it');
  },
  restore: async () => {
    throw new Error('the phone app uses your computer’s identity: pair with it');
  },
  enroll: async () => {
    throw new Error('the phone app uses your computer’s account: pair with it');
  },
  openApp: async (url) => void window.open(url, '_blank'),
  // A phone has no folders to give a project's app.
  pickFolder: async () => undefined,
  show: async () => {},
  attention: async () => {},
  call: (method, ...args) => ask('call', { method, args }),
  onEvent: (listener) => void listeners.add(listener),
  onLink: () => {},
  phone: {
    async pair(link) {
      const device = await Device.getInfo();
      await ask('pair', { link, phoneName: device.name || device.model });
    },
    async scan() {
      try {
        const { ScanResult } = await CapacitorBarcodeScanner.scanBarcode({ hint: CapacitorBarcodeScannerTypeHint.QR_CODE });
        return ScanResult || undefined;
      } catch (error) {
        // Closing the scanner rejects; that's not an error to show.
        if (/cancel/i.test(String((error as Error)?.message ?? error))) return undefined;
        throw error;
      }
    },
    forget: () => ask('forget'),
    async openRoom(room, url) {
      // The worker serves the room's app on this phone, through your computer; it opens in a browser inside the
      // app, which stays in front (iOS suspends the worker of an app in the background).
      const local = await ask<string>('openRoom', { room, url });
      await Worker.hold({ on: true });
      await Browser.open({ url: local, presentationStyle: 'fullscreen' });
    },
  },
};
