import { WebPlugin } from '@capacitor/core';

/**
 * The WeaveWorker plugin in a browser, for development (dev-web.ts): the
 * worker runs on Bare next to the dev server, and its lines come and go over
 * HTTP instead of bare-kit's IPC.
 */
export class WeaveWorkerWeb extends WebPlugin {
  constructor() {
    super();
    new EventSource('/worker/events').onmessage = (m) => this.notifyListeners('message', { message: m.data });
  }

  async post({ message }: { message: string }): Promise<void> {
    const res = await fetch('/worker', { method: 'POST', body: message });
    if (!res.ok) throw new Error(`the worker didn't take it: ${res.status}`);
  }
}
