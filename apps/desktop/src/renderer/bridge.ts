import { errorFromWire, type ErrorAnswer } from '@weave/core';
import type { FeedItem } from '@weave/node/client';
import type { RendererMethod } from '../methods.ts';
import type { UpdateAction, UpdateView } from '../updatestate.ts';
import { t } from './texts.tsx';

export interface AppState {
  home: string;
  hasIdentity: boolean;
  connected: boolean;
  /** Why the daemon couldn't be started or reached. */
  error?: string;
  /** The company's enrollment link, from this computer's managed settings. */
  enrollLink?: string;
  /** Managed by a company: only company accounts here. */
  companyOnly?: boolean;
}

interface Bridge {
  state(): Promise<AppState>;
  /** Start the daemon again; restart also ends one that holds the home but doesn't answer. Not in the browser preview. */
  reconnect?(restart: boolean): Promise<void>;
  /** Create the identity; resolves to the recovery words, shown once. */
  init(name: string): Promise<string | undefined>;
  /** Set this computer up from the recovery words; with a backup file (its path), everything it holds comes back too, with no network. */
  restore(words: string, backup?: string): Promise<void>;
  /** Set up a company account: the company's sign-in opens in the browser. Resolves to who was set up. */
  enroll(link: string): Promise<{ name?: string; company?: { name?: string } }>;
  /** Open a room's shared app in its own window. */
  openApp(url: string, title: string): Promise<void>;
  /** Let the person pick a folder on this computer; undefined if they cancel. */
  pickFolder(title: string): Promise<string | undefined>;
  /** Let the person pick a backup file on this computer; undefined if they cancel. Missing in a browser. */
  pickFile?(title: string): Promise<string | undefined>;
  /** Show a file Weave got (an artifact's) in its folder. */
  reveal?(path: string): Promise<void>;
  /** Bring the app's window to the front (a notification was clicked). */
  show(): Promise<void>;
  /** Show or hide the Mentions panel window; missing in a browser (open #/overlay there). */
  mentions?(action: 'show' | 'hide'): Promise<void>;
  /** Show the overlay on this device (on Sessions): with a value sets it; answers whether it's on. Missing in a browser. */
  overlay?(on?: boolean): Promise<boolean>;
  /** From the panel: show this route (#/…) in the main window. Missing in a browser. */
  route?(hash: string): Promise<void>;
  /** In the main window: a route the panel asked for. */
  onRoute?(listener: (hash: string) => void): void;
  /** Ctrl+click: work on a post in the Claude app (its session, or a new one). Missing in a browser. */
  /** Work on an item in the Claude app: in a session you picked, a new one, or (no choice) where it was last. */
  workOn?(post: string, choice?: { session: { provider: string; id: string } } | { new: true }): Promise<{ how: 'session' | 'new' | 'cancelled'; delivered?: 'pasted' | 'clipboard' | 'link'; where?: string }>;
  /** Start a Claude Code session in a folder; with a job, it gets it (and its projects) once the Claude app says which session it is. */
  newSession?(input: { folder: string; role?: 'driver' | 'worker'; projects?: string[]; text?: string }): Promise<'pasted' | 'clipboard' | 'link'>;
  /** Bring a session (the Claude app's own id) to the front in the Claude app. Missing in a browser. */
  showSession?(host: string): Promise<void>;
  /** In the address book picker: put it away and paste `text` where you were typing (or leave it on the clipboard). Missing in a browser. */
  pick?(text: string): Promise<'pasted' | 'clipboard'>;
  /** In the address book picker: put it away, pasting nothing. */
  closePicker?(): Promise<void>;
  /** In the address book picker: make the window as tall as this (it grows with the results). */
  fitPicker?(height: number): Promise<void>;
  /** In the address book picker: the pick went where you were typing, or onto the clipboard; it says so for a moment. */
  onPickerDone?(listener: (delivered: 'pasted' | 'clipboard') => void): void;
  /** In the address book picker: a shortcut was pressed again, so it starts afresh on that tab (all, people, projects, posts). */
  onPickerOpen?(listener: (tab: string) => void): void;
  /** In the side panel: show this session (after Ctrl+click). */
  onPanelSession?(listener: (session: string) => void): void;
  /** The desktop app's operating system (darwin, win32, linux); missing in a browser. */
  platform?: string;
  /** The app's own title bar buttons; missing in a browser, which has its own window. */
  windowControl?(action: 'minimize' | 'maximize' | 'close'): Promise<{ maximized: boolean; focused: boolean }>;
  onWindowState?(listener: (state: { maximized: boolean; focused: boolean }) => void): void;
  /** Where a board's client service's view is served for the board view's frame (see lens.tsx). */
  lensBase(release: string): Promise<string> | string;
  /** Flash the taskbar button until the person looks. */
  attention(): Promise<void>;
  /** The language setting changed: the desktop's menus and titles follow (src/texts.ts). Missing in a browser and on the phone. */
  language?(setting: string): Promise<void>;
  call(method: RendererMethod, ...args: unknown[]): Promise<unknown>;
  onEvent(listener: (item: FeedItem) => void): void;
  /** A weave: link the app was opened with (clicked somewhere outside it). */
  onLink(listener: (link: string) => void): void;
  /** In the phone app, which uses a computer's node: pairing with it takes the place of creating an identity. */
  phone?: {
    /** Pair with the computer whose pairing link (from its QR code) this is. */
    pair(link: string): Promise<void>;
    /** Scan a QR code with the camera; undefined if the person cancels. */
    scan(): Promise<string | undefined>;
    /** Forget the computer on this phone, to pair again. */
    forget(): Promise<void>;
    /** Open a room's app (its address on the computer) on the phone, through the computer. */
    openRoom(room: string, url: string): Promise<void>;
  };
  /** New versions, in the desktop app (src/update.ts): where one stands, Check / Download / Restart to update, and the setting. Missing in a browser and on the phone. */
  update?: {
    state(): Promise<UpdateView>;
    action(action: UpdateAction): Promise<void>;
    setAuto(on: boolean): Promise<void>;
    onChange(listener: (view: UpdateView) => void): void;
  };
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
  // The web preview serves it from its own origin (dev-web.ts).
  lensBase: (release) => `/lens/${encodeURIComponent(release)}/`,
  // A browser can't hand out folder paths: type it.
  pickFolder: async (title) => prompt(`${title}\n\n${t('bridge.full.path')}`)?.trim() || undefined,
  restore: async () => {
    throw new Error('restore with "weave restore" when using the web preview');
  },
  init: async () => {
    throw new Error('create your identity with "weave init" when using the web preview');
  },
  enroll: async (link) => {
    const res = await fetch('/enroll', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link }) });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error ?? `request failed: ${res.status}`);
    return data;
  },
  call: async (method, ...args) => {
    const res = await fetch('/rpc', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ method, args }) });
    const data = await res.json();
    if (!res.ok) throw errorFromWire(data, `request failed: ${res.status}`);
    return data;
  },
  onEvent: (listener) => {
    new EventSource('/events').onmessage = (message) => listener(JSON.parse(message.data));
  },
  // A browser tab is never handed links.
  onLink: () => {},
};

/**
 * Electron's preload answers a call with {result} or {error, name?, values?} instead of throwing: an error thrown in the
 * main process would arrive as "Error invoking remote method…" without its name. Thrown here, as the daemon threw it.
 */
const electronBridge = (w: Bridge): Bridge => ({
  ...w,
  call: async (method, ...args) => {
    const answer = (await w.call(method, ...args)) as { result?: unknown } | ErrorAnswer;
    if (answer && typeof answer === 'object' && 'error' in answer) throw errorFromWire(answer, 'the call failed');
    return (answer as { result?: unknown })?.result;
  },
});

export const bridge: Bridge = window.weave ? (window.weave.phone ? window.weave : electronBridge(window.weave)) : webBridge;

/** Typed shorthand for backend calls. */
export const api = <T>(method: RendererMethod, ...args: unknown[]): Promise<T> => bridge.call(method, ...args) as Promise<T>;
