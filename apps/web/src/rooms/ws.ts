/*
 * A website's own WebSocket, in its frame (docs/web-stage2.md, step 9): the service worker puts this first in every page
 * of the website, as /__weave/ws.js. A WebSocket to the website's own address goes to the tab, which opens it through a
 * tunnel to the host (shell.ts); one to anywhere else is the browser's, as it was.
 */

export {};

/** What the tab hands a WebSocket (shell.ts): sending, closing, and events back. */
interface Link {
  send(binary: boolean, data: Uint8Array): void;
  close(code: number, reason: string): void;
}
type Open = (path: string, protocols: string[], events: { open(protocol: string): void; message(binary: boolean, data: Uint8Array): void; close(code: number, reason: string, clean: boolean): void; error(): void }) => Link;

const Native = window.WebSocket;
const tab = () => (window.parent as unknown as { __weaveWebSocket?: Open }).__weaveWebSocket;

class WeaveWebSocket extends EventTarget {
  static readonly CONNECTING = 0;
  static readonly OPEN = 1;
  static readonly CLOSING = 2;
  static readonly CLOSED = 3;
  readonly CONNECTING = 0;
  readonly OPEN = 1;
  readonly CLOSING = 2;
  readonly CLOSED = 3;
  readonly url: string;
  readyState = 0;
  protocol = '';
  extensions = '';
  bufferedAmount = 0;
  binaryType: BinaryType = 'blob';
  onopen: ((event: Event) => void) | null = null;
  onmessage: ((event: MessageEvent) => void) | null = null;
  onclose: ((event: CloseEvent) => void) | null = null;
  onerror: ((event: Event) => void) | null = null;
  #link: Link;
  /** Sends in order, though a Blob is read first. */
  #sending: Promise<void> = Promise.resolve();

  constructor(url: string | URL, protocols: string | string[] = []) {
    super();
    const target = new URL(String(url), location.href);
    const open = tab()!;
    this.url = target.href.replace(/^http/, 'ws');
    const fire = (event: Event, handler: ((event: never) => void) | null) => {
      handler?.call(this, event as never);
      this.dispatchEvent(event);
    };
    this.#link = open(target.pathname + target.search, typeof protocols === 'string' ? [protocols] : [...protocols], {
      open: (protocol) => {
        this.readyState = 1;
        this.protocol = protocol;
        fire(new Event('open'), this.onopen);
      },
      message: (binary, data) => {
        if (this.readyState !== 1) return;
        const payload = binary ? (this.binaryType === 'arraybuffer' ? data.slice().buffer : new Blob([data.slice()])) : new TextDecoder().decode(data);
        fire(new MessageEvent('message', { data: payload, origin: location.origin }), this.onmessage);
      },
      close: (code, reason, clean) => {
        if (this.readyState === 3) return;
        this.readyState = 3;
        fire(new CloseEvent('close', { code, reason, wasClean: clean }), this.onclose);
      },
      error: () => fire(new Event('error'), this.onerror),
    });
  }

  send(data: string | ArrayBufferLike | Blob | ArrayBufferView): void {
    if (this.readyState === 0) throw new DOMException('Still in CONNECTING state.', 'InvalidStateError');
    if (this.readyState !== 1) return;
    this.#sending = this.#sending.then(async () => {
      if (typeof data === 'string') return this.#link.send(false, new TextEncoder().encode(data));
      if (data instanceof Blob) return this.#link.send(true, new Uint8Array(await data.arrayBuffer()));
      if (ArrayBuffer.isView(data)) return this.#link.send(true, new Uint8Array(data.buffer, data.byteOffset, data.byteLength).slice());
      this.#link.send(true, new Uint8Array(data as ArrayBuffer).slice());
    });
  }

  close(code = 1000, reason = ''): void {
    if (this.readyState >= 2) return;
    this.readyState = 2;
    this.#link.close(code, reason);
  }
}

/** The website's own address through the tab; anywhere else, the browser's own WebSocket. */
window.WebSocket = new Proxy(WeaveWebSocket, {
  construct(target, args: [string | URL, (string | string[])?]) {
    const to = new URL(String(args[0]), location.href);
    return to.host === location.host && tab() ? Reflect.construct(target, args) : new Native(...(args as [string | URL, string | string[]]));
  },
}) as unknown as typeof WebSocket;
