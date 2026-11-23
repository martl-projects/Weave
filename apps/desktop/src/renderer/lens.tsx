import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { LENS_FILES, lensFileName, roughLocation, screenTilt, type LensLocation } from '@weave/core';
import type { AgentBoardInfo, BoardInfo, BoardViewInfo, ShowInfo, SpaceInfo, TicketInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bridge, bump, useApi } from './lib.ts';
import { Modal, toast } from './ui.tsx';
import { BuyTicket } from './shows.tsx';
import { useTexts } from './texts.tsx';
import { LensShare } from './lensshare.tsx';
import { fillWindow } from './windowfill.ts';

/*
 * A board shown through its client service: the service's own renderer (its site) in a sandboxed frame, which gets
 * the state its fold made and asks for actions. This view is the only thing it talks to:
 *
 *   to the frame    {weave: 'view', state, actions, board, me}     whenever the board changes
 *   from the frame  {weave: 'act', id, name, input}                do an action (signed by you, with your rights)
 *                   {weave: 'open', post}                          open a post in Weave
 *   to the frame    {weave: 'acted', id, error?}                   how that went
 *   from the frame  {weave: 'files', net} / {weave: 'loaded'}       Weave Web's frame: the view's files, please / built
 *                                                                  (net: the hosts in its own address, which its CSP took)
 *   to the frame    {weave: 'files', files: [{path, type, data}]}  (apps/web/src/lens-frame.html)
 *   from the frame  {weave: 'fullscreen', on?}                      fill the screen with the view (on: false, leave it)
 *   from the frame  {weave: 'edges', own: true}                     I lay out the screen's edges myself: filling the
 *                                                                  screen, give me all of it (under notch and home bar)
 *   to the frame    {weave: 'fullscreen', on, corner, inset}        it fills the screen (or no longer); inset {top,
 *                                                                  right, bottom, left}: what the device covers of each
 *                                                                  edge, px (0 unless it said 'edges'); corner: the
 *                                                                  square at its top right (px) Weave's ✕ sits in
 *   from the frame  {weave: 'locate', id}                           where am I? (only if its member allowed it)
 *   to the frame    {weave: 'location', id, lat, lon, accuracy, rough} / {weave: 'location', id, error}
 *                                                                  Weave asks the device, never the frame; rough is
 *                                                                  the middle of a 0.01° cell (roughLocation)
 *   from the frame  {weave: 'tilt', on}                             how is the device tilted? (only if its manifest
 *                                                                  says "tilt"; on: false, no longer)
 *   to the frame    {weave: 'tilt', x, y}                           again and again while it is asked and in sight:
 *                                                                  degrees to the side and forward (screenTilt)
 *   from the frame  {weave: 'picture', id, ref}                     the bytes of a picture (wblob:…) that its view names
 *   to the frame    {weave: 'picture', id, type, data} / {…, error}  data: an ArrayBuffer. Nothing its view doesn't name
 *   from the frame  {weave: 'attach', id, name, type, data}         keep this picture (LENS_FILES: which, how large)
 *   to the frame    {weave: 'attached', id, ref} / {…, error}        its reference, to put into an action's input
 *   from the frame  {weave: 'save', id, name, type, data}           a file for its member (a PDF it made): Weave
 *   to the frame    {weave: 'saved', id} / {…, error}                offers it in a line above the view; they save it or not
 *   from the frame  {weave: 'tickets', id, show?}                    the shows of this project, or one of them (only
 *                                                                  if its manifest says "tickets")
 *   to the frame    {weave: 'tickets', id, shows: [{id, name, starts, ends, price: {amount, decimals, symbol}, open,
 *                   cancelled, mine, ticket}]} / {weave: 'tickets', id, show: {…}, holders?: [{did, name, tx}]} /
 *                   {…, error}                                      mine: its member hosts it; ticket: they have one;
 *                                                                  holders: who paid, for its host only
 *   from the frame  {weave: 'ticket', show}                         its member wants a ticket: Weave shows how to pay
 *
 * The view message says what this Weave answers: can: ['picture', 'attach', 'save', 'tilt', 'tickets'] (what is there
 * of it). Telling members is not a message: an event of the lens's own kind names them ("notify" in its body, lensNotify).
 *
 * A chat's widget (widgets.tsx) talks the same way: its 'view' carries {widget: {id, title}} instead of board.
 *
 * Suggested lenses are each member's choice (kept on this computer); required ones are how the board shows.
 */

const CHOSEN = 'weave.lens.';

export function useLensChoice(space: SpaceInfo, board?: BoardInfo): [boolean, (on: boolean) => void] {
  const key = `${CHOSEN}${space.id}/${board?.name ?? ''}`;
  const read = () => {
    try {
      return localStorage.getItem(key) === board?.lens?.release;
    } catch {
      return false;
    }
  };
  const [chosen, setChosen] = useState(read);
  useEffect(() => setChosen(read()), [key, board?.lens?.release]);
  const choose = (on: boolean) => {
    try {
      if (on && board?.lens) localStorage.setItem(key, board.lens.release);
      else localStorage.removeItem(key);
    } catch {
      // Not kept: it holds until the app restarts.
    }
    setChosen(on);
  };
  return [board?.lens?.mode === 'require' || chosen, choose];
}

/**
 * A client service's renderer in its sandboxed frame, a board's lens or a chat's widget (widgets.tsx): it gets what
 * `view` says whenever that changes, asks for actions (`act`, signed by you with your rights) and to open posts.
 * Only its own frame is listened to, nothing else on the page.
 */
/**
 * Where this device is, asked of it once at a time (the browser's or Electron's geolocation), as closely as a view
 * may know it: rough (roughLocation) or exact. The frame never gets geolocation itself (its sandbox has none).
 */
function locate(level: LensLocation): Promise<{ lat: number; lon: number; accuracy: number; rough: boolean }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('this device has no location'));
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const { latitude: lat, longitude: lon, accuracy } = p.coords;
        if (level === 'exact') resolve({ lat, lon, accuracy: Math.round(accuracy), rough: false });
        else resolve({ ...roughLocation(lat, lon), accuracy: Math.max(1000, Math.round(accuracy)), rough: true });
      },
      (e) => reject(new Error(e.message || 'no location')),
      { enableHighAccuracy: level === 'exact', timeout: 15000, maximumAge: 60000 },
    );
  });
}

/**
 * How this device is tilted, told as it changes (at most thirty times a second, and not while Weave is out of sight):
 * the browser's reading of the device's sensors, as the screen is held (screenTilt). The frame never gets a sensor
 * itself (its sandbox has none). Returns the way to stop.
 */
function watchTilt(tell: (tilt: { x: number; y: number }) => void): () => void {
  let last = 0;
  const heard = (e: DeviceOrientationEvent) => {
    if (e.beta == null || e.gamma == null || document.hidden) return;
    const now = performance.now();
    if (now - last < 33) return;
    last = now;
    tell(screenTilt(e.beta, e.gamma, screen.orientation?.angle ?? 0));
  };
  window.addEventListener('deviceorientation', heard);
  return () => window.removeEventListener('deviceorientation', heard);
}

/** How much of each edge of the screen the device covers (a notch, rounded corners, the home bar), in CSS pixels. */
function screenInsets(): { top: number; right: number; bottom: number; left: number } {
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)';
  document.body.appendChild(probe);
  const s = getComputedStyle(probe);
  const px = (v: string) => Math.round(parseFloat(v) || 0);
  const inset = { top: px(s.paddingTop), right: px(s.paddingRight), bottom: px(s.paddingBottom), left: px(s.paddingLeft) };
  probe.remove();
  return inset;
}

/** A file a view made for its member, waiting for their word: save it (resolves when it is with them) or not. */
export interface LensOffer {
  name: string;
  size: number;
  save(): Promise<void>;
  drop(): void;
}

const toBase64 = (bytes: Uint8Array): string => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
};

/** Bytes to the person's files: the share sheet on a phone where there is one, the browser's download otherwise. */
async function saveBytes(data: ArrayBuffer, name: string, type: string): Promise<void> {
  const native = 'Capacitor' in window && (window as unknown as { Capacitor: { isNativePlatform?(): boolean } }).Capacitor.isNativePlatform?.();
  if (native && typeof navigator.share === 'function') {
    const shared = new File([data], name, { type });
    if (navigator.canShare?.({ files: [shared] })) return navigator.share({ files: [shared], title: name });
  }
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** An iPhone asks its owner before a page hears its sensors, and only after a tap in that page: this asks. */
const tiltAsks = (): (() => Promise<string>) | undefined => {
  const ask = typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
  return typeof ask === 'function' ? () => ask.call(DeviceOrientationEvent) : undefined;
};
let tiltGranted = false;
/** The views that wait for the iPhone's yes: each is started when it comes, whichever tap brought it. */
const tiltWaiting = new Set<() => void>();
const TILT_SAID = 'weave.tilt.said';
/**
 * Ask the iPhone (it answers without a question when it still remembers a yes, and refuses to ask unless a tap in
 * Weave came first). A yes is kept here, so the next time Weave asks by itself at the first tap anywhere in it.
 */
function tiltGrant(ask: () => Promise<string>): Promise<boolean> {
  return ask().then(
    (answer) => {
      if (answer !== 'granted') return false;
      tiltGranted = true;
      try {
        localStorage.setItem(TILT_SAID, '1');
      } catch {
        // Not kept: Weave's line asks again next time.
      }
      for (const go of [...tiltWaiting]) go();
      tiltWaiting.clear();
      return true;
    },
    () => false,
  );
}
// Someone who said yes before isn't asked by Weave again: an iPhone forgets its own yes when the page is closed, and
// asks only after a tap, so the first tap in Weave brings its question back (or, if it remembers, nothing at all).
if (typeof window !== 'undefined') {
  const ask = tiltAsks();
  let said = false;
  try {
    said = localStorage.getItem(TILT_SAID) === '1';
  } catch {
    // No storage: Weave's line asks.
  }
  if (ask && said) {
    const once = () => {
      window.removeEventListener('touchend', once, true);
      window.removeEventListener('click', once, true);
      if (!tiltGranted) void tiltGrant(ask);
    };
    window.addEventListener('touchend', once, true);
    window.addEventListener('click', once, true);
  }
}

export function LensFrame({ title, release, base, net, location, tilt, tickets, onTicket, onShare, onTiltAsk, onOffer, onEdges, onLocated, onFullscreen, full, view, act, onOpen, className, style }: { /** Its member wants to take this lens along to a group of their own: Weave's dialog for it. */ onShare?(): void; /** What a view whose manifest says "tickets" learns about its project's shows (or one of them). */ tickets?(show?: string): Promise<Record<string, unknown>>; /** Its member wants a ticket to that show. */ onTicket?(show: string): void; /** The view says whether it lays out the screen's edges itself (then, filling the screen, it gets all of it). */ onEdges?(own: boolean): void; /** A file the view made for its member: shown to them to save or not (null: it is settled). Without it a view cannot hand out files. */ onOffer?(offer: LensOffer | null): void; title: string; release: string; base: string; net?: string[]; location?: LensLocation; /** Its manifest says its site may ask how the device is tilted. */ tilt?: boolean; /** The device wants a tap in Weave first: `allow` is what that tap does (null: no longer needed). */ onTiltAsk?(allow: (() => void) | null): void; onLocated?(): void; onFullscreen?(on: boolean): void; full?: boolean; view: unknown; act(name: string, input: unknown): Promise<unknown>; onOpen?(post: string): void; className?: string; style?: CSSProperties }) {
  const { t } = useTexts();
  const frame = useRef<HTMLIFrameElement>(null);
  // Weave Web's frame takes its CSP from its address (a Pages Function): the hosts this member allowed, or none. On a
  // computer or a phone the node's answer carries them (lensFile), so the address stays as it is.
  const hosts = net?.length ? net.join(',') : '';
  const src = bridge.web && hosts ? `${base}?net=${encodeURIComponent(hosts)}` : base;
  const latest = useRef({ view, act, onOpen, release, hosts, title, t, location, tilt, tickets, onTicket, onShare, onTiltAsk, onOffer, onEdges, onLocated, onFullscreen });
  latest.current = { view, act, onOpen, release, hosts, title, t, location, tilt, tickets, onTicket, onShare, onTiltAsk, onOffer, onEdges, onLocated, onFullscreen };
  const tilting = useRef<(() => void) | null>(null);
  const tiltGo = useRef<(() => void) | null>(null);
  const attached = useRef(0);
  const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, '*');
  const sendView = () => send(latest.current.view);
  useEffect(sendView, [view]);
  // The view hears when it fills the screen, and where Weave's ✕ is then, so it keeps that corner free. A view that
  // said it lays out the screen's edges itself ({weave: 'edges', own: true}) gets all of the screen, under a phone's
  // notch and home bar too, and hears how much of each edge the device covers (inset, px): it lays its own ground
  // there and keeps what matters clear. Any other view stays inside those edges, and its inset is 0.
  const [edges, setEdges] = useState(false);
  useEffect(() => {
    const tell = () => send({ weave: 'fullscreen', on: !!full, corner: 40, inset: full && edges ? screenInsets() : { top: 0, right: 0, bottom: 0, left: 0 } });
    tell();
    if (!full) return;
    window.addEventListener('resize', tell);
    return () => window.removeEventListener('resize', tell);
  }, [full, edges]);

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const m = event.data as { weave?: string; id?: unknown; name?: unknown; input?: unknown; post?: unknown };
      if (m?.weave === 'act' && typeof m.name === 'string') {
        latest.current.act(m.name, m.input ?? null).then(
          () => {
            send({ weave: 'acted', id: m.id });
            bump();
          },
          (e: Error) => {
            send({ weave: 'acted', id: m.id, error: e.message });
            toast(e.message, 'error');
          },
        );
      }
      if (m?.weave === 'open' && typeof m.post === 'string') latest.current.onOpen?.(m.post);
      if (m?.weave === 'edges') {
        const own = (m as { own?: unknown }).own === true;
        setEdges(own);
        latest.current.onEdges?.(own);
      }
      // The view asks to fill the screen (a map, a game): a click in it came first, so the browser lets the page do it.
      if (m?.weave === 'fullscreen') latest.current.onFullscreen?.((m as { on?: unknown }).on !== false);
      // Where its member is: only as its member allowed (location), asked of the device here, never in the frame.
      if (m?.weave === 'locate') {
        const level = latest.current.location;
        if (!level) send({ weave: 'location', id: m.id, error: latest.current.t('lens.location.not.allowed', { name: latest.current.title }) });
        else
          locate(level).then(
            (where) => {
              send({ weave: 'location', id: m.id, ...where });
              latest.current.onLocated?.();
            },
            (e: Error) => send({ weave: 'location', id: m.id, error: e.message }),
          );
      }
      // A picture's bytes: only one its own view names (a post's picture on this board), so it sees nothing its member
      // doesn't see here anyway. The frame cannot open a wblob: reference itself.
      if (m?.weave === 'picture') {
        const ref = (m as { ref?: unknown }).ref;
        const tell = latest.current.t;
        if (typeof ref !== 'string' || !/^wblob:[\w.-]{20,200}$/.test(ref) || !JSON.stringify(latest.current.view ?? null).includes(JSON.stringify(ref)))
          send({ weave: 'picture', id: m.id, error: tell('lens.picture.not.here') });
        else
          api<{ data: string; type: string }>('blob', ref).then(
            ({ data, type }) => {
              if (!type.startsWith('image/')) return send({ weave: 'picture', id: m.id, error: tell('lens.picture.not.here') });
              const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
              frame.current?.contentWindow?.postMessage({ weave: 'picture', id: m.id, type, data: bytes.buffer }, '*', [bytes.buffer]);
            },
            (e: Error) => send({ weave: 'picture', id: m.id, error: e.message }),
          );
      }
      // A picture the view wants kept (a photo its member chose in it): stored as theirs, encrypted, like one they
      // attach themselves. Only pictures, each small, and not endlessly: a view cannot fill the disk.
      if (m?.weave === 'attach') {
        const { type, data } = m as { type?: unknown; data?: unknown };
        const fits = data instanceof ArrayBuffer && data.byteLength > 0 && data.byteLength <= LENS_FILES.attachBytes && (LENS_FILES.attach as readonly unknown[]).includes(type);
        if (!fits || attached.current >= LENS_FILES.attachCount) send({ weave: 'attached', id: m.id, error: latest.current.t('lens.attach.limits') });
        else {
          attached.current++;
          api<string>('putBlob', { data: toBase64(new Uint8Array(data as ArrayBuffer)), type: type as string }).then(
            (ref) => send({ weave: 'attached', id: m.id, ref }),
            (e: Error) => send({ weave: 'attached', id: m.id, error: e.message }),
          );
        }
      }
      // A file the view made for its member (a book as a PDF): Weave shows that it is there, and they save it or not.
      if (m?.weave === 'save') {
        const { type, data, name } = m as { type?: unknown; data?: unknown; name?: unknown };
        const tell = latest.current.t;
        const offer = latest.current.onOffer;
        if (!offer) send({ weave: 'saved', id: m.id, error: tell('lens.save.not.here') });
        else if (!(data instanceof ArrayBuffer) || !data.byteLength || data.byteLength > LENS_FILES.saveBytes || !(LENS_FILES.save as readonly unknown[]).includes(type)) send({ weave: 'saved', id: m.id, error: tell('lens.save.limits') });
        else {
          const file = lensFileName(name);
          offer({
            name: file,
            size: data.byteLength,
            save: () =>
              saveBytes(data, file, type as string).then(
                () => send({ weave: 'saved', id: m.id }),
                (e: Error) => send({ weave: 'saved', id: m.id, error: e.message }),
              ),
            drop: () => send({ weave: 'saved', id: m.id, error: tell('lens.save.declined') }),
          });
        }
      }
      // The shows of its project and their tickets: only for a view whose manifest says so. Who paid is told to the
      // show's host alone (their node knows nobody else's ticket).
      if (m?.weave === 'tickets') {
        const show = (m as { show?: unknown }).show;
        const ask = latest.current.tickets;
        if (!ask) send({ weave: 'tickets', id: m.id, error: latest.current.t('lens.tickets.not.here', { name: latest.current.title }) });
        else
          ask(typeof show === 'string' ? show : undefined).then(
            (answer) => send({ weave: 'tickets', id: m.id, ...answer }),
            (e: Error) => send({ weave: 'tickets', id: m.id, error: e.message }),
          );
      }
      if (m?.weave === 'ticket' && typeof (m as { show?: unknown }).show === 'string' && latest.current.tickets) latest.current.onTicket?.((m as unknown as { show: string }).show);
      // Its member wants this lens for a group of their own (a button in the view): Weave's dialog, which asks them everything.
      if (m?.weave === 'share') latest.current.onShare?.();
      // How the device is tilted: only for a view whose manifest says so, heard from the device here, never in the frame.
      if (m?.weave === 'tilt') {
        tilting.current?.();
        tilting.current = null;
        if (tiltGo.current) tiltWaiting.delete(tiltGo.current);
        tiltGo.current = null;
        latest.current.onTiltAsk?.(null);
        if ((m as { on?: unknown }).on !== false && latest.current.tilt) {
          const start = () => {
            tilting.current?.();
            tilting.current = watchTilt((tilt) => send({ weave: 'tilt', ...tilt }));
          };
          const ask = tiltAsks();
          if (!ask || tiltGranted) start();
          else {
            // An iPhone: started when its yes comes. Asked silently first (it may still remember); if it wants a tap,
            // Weave's line offers one, unless the tap anywhere in Weave (for someone who said yes before) comes first.
            const go = () => {
              latest.current.onTiltAsk?.(null);
              start();
            };
            tiltGo.current = go;
            tiltWaiting.add(go);
            void tiltGrant(ask).then((yes) => {
              if (!yes && !tiltGranted && tiltGo.current === go) latest.current.onTiltAsk?.(() => void tiltGrant(ask));
            });
          }
        }
      }
      // Weave Web's frame (apps/web/src/lens-frame.html) asks for the view's files, builds its page, and says so.
      // Only to the frame this page made, with the hosts it was given: a view that sent its frame elsewhere (another
      // address, other hosts) gets nothing of it.
      if (m?.weave === 'files' && (m as { net?: unknown }).net !== latest.current.hosts) {
        toast(latest.current.t('lens.net.mismatch', { name: latest.current.title }), 'error');
        return;
      }
      if (m?.weave === 'files')
        api<Array<{ path: string; type: string; data: string }>>('lensSite', { release: latest.current.release }).then(
          (files) => send({ weave: 'files', files }),
          (e: Error) => toast(e.message, 'error'),
        );
      if (m?.weave === 'loaded') {
        frame.current.dataset.loaded = '1';
        sendView();
      }
    };
    window.addEventListener('message', listen);
    return () => {
      window.removeEventListener('message', listen);
      tilting.current?.();
      if (tiltGo.current) tiltWaiting.delete(tiltGo.current);
    };
  }, []);

  return <iframe ref={frame} className={className ?? 'lens-frame'} style={style} title={title} src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={sendView} />;
}

/**
 * A lens's view filling Weave's window (windowfill.ts): inside its border and below its title bar, the screen when
 * Weave is maximized; on a phone, the whole screen. Esc, or the button at the top, leaves it.
 */
function useFullscreen(el: HTMLElement | null, full: boolean, setFull: (on: boolean) => void) {
  useEffect(() => {
    if (!el || !full) return;
    const unfill = fillWindow(el);
    const key = (e: KeyboardEvent) => e.key === 'Escape' && setFull(false);
    window.addEventListener('keydown', key);
    return () => {
      window.removeEventListener('keydown', key);
      unfill();
    };
  }, [full, el]);
}

/** The pane's button for it, next to the lens switch. */
export function LensFullscreenButton({ full, setFull }: { full: boolean; setFull(on: boolean): void }) {
  const { t } = useTexts();
  return (
    <button onClick={() => setFull(!full)} title={t(full ? 'lens.fullscreen.exit' : 'lens.fullscreen')}>
      <span aria-hidden="true">⤢</span> {t('lens.fullscreen.short')}
    </button>
  );
}

export function LensView({ space, board, meDid, onOpen, full = false, setFull = () => {} }: { space: SpaceInfo; board: BoardInfo; meDid: string; onOpen(post: string): void; full?: boolean; setFull?(on: boolean): void }) {
  const { t } = useTexts();
  // Its box, once it shows (it waits for the view): what fills Weave's window.
  const [box, setBox] = useState<HTMLDivElement | null>(null);
  useFullscreen(box, full, setFull);
  // An iPhone wants a tap in Weave before the view hears how it is tilted: what that tap does, while it is wanted.
  const [tiltAsk, setTiltAsk] = useState<(() => void) | null>(null);
  // A file the view made for its member, until they saved it or said no.
  const [offer, setOffer] = useState<LensOffer | null>(null);
  // The view lays out the screen's edges itself: filling the screen, it gets all of it.
  const [bleed, setBleed] = useState(false);
  const waiting = useRef<LensOffer | null>(null);
  // One at a time: a newer file takes the place of one nobody answered (which is then not saved).
  const offered = (next: LensOffer | null) => {
    if (next) waiting.current?.drop();
    waiting.current = next;
    setOffer(next);
  };
  const { data: view, error, reload } = useApi(() => api<BoardViewInfo>('boardView', { space: space.id, board: board.name, use: true }), [space.id, board.name, board.lens?.release]);
  // Where its view is served here: the desktop, the phone and the web preview each serve it their own way.
  const { data: base } = useApi(async () => (view?.lens?.site ? bridge.lensBase(view.lens.release) : undefined), [view?.lens?.release, view?.lens?.site]);
  const asksTickets = !!view?.lens?.tickets && space.kind === 'project';
  const message = useMemo(() => view && { weave: 'view', state: view.state ?? null, actions: view.actions ?? [], board: view.board, me: { did: meDid }, can: ['picture', 'attach', 'save', 'share', ...(view.lens?.tilt ? ['tilt'] : []), ...(asksTickets ? ['tickets'] : [])] }, [view, meDid, asksTickets]);
  // The show its member wants a ticket to, while Weave shows how to pay it.
  const [buying, setBuying] = useState<ShowInfo | null>(null);
  // Its member asked, in the view, to take this lens along.
  const [sharing, setSharing] = useState(false);
  const showFor = (s: ShowInfo) => ({ id: s.id, name: s.name, starts: s.starts, ends: s.ends, price: { amount: String(s.price.amount), decimals: s.price.decimals, symbol: s.price.symbol }, open: s.open, cancelled: s.cancelled, mine: s.mine, ticket: !!s.ticket });
  const tickets = async (id?: string): Promise<Record<string, unknown>> => {
    const shows = await api<ShowInfo[]>('shows', space.id);
    if (id === undefined) return { shows: shows.map(showFor) };
    const show = shows.find((s) => s.id === id);
    if (!show) throw new Error(t('lens.tickets.no.show'));
    if (!show.mine) return { show: showFor(show) };
    const sold = await api<TicketInfo[]>('tickets', show.id);
    return { show: showFor(show), holders: sold.filter((x) => x.ok).map((x) => ({ did: x.holder.did, name: x.holder.name ?? null, tx: x.tx })) };
  };
  const wantTicket = (id: string) =>
    void api<ShowInfo[]>('shows', space.id).then(
      (shows) => {
        const show = shows.find((s) => s.id === id);
        if (!show) toast(t('lens.tickets.no.show'), 'error');
        else setBuying(show);
      },
      (e: Error) => toast(e.message, 'error'),
    );

  if (error) return <p className="muted pad">{error}</p>;
  if (!view) return <p className="muted pad">{t('lens.getting.ready', { name: board.lens?.name ?? t('lens.its.view') })}</p>;
  if (view.lens?.problem) return <p className="muted pad">{t('lens.cant.show', { name: view.lens.name, problem: view.lens.problem })}</p>;
  if (!view.lens?.site)
    return (
      <div className="pad">
        <p className="muted">{t('lens.no.view', { name: view.lens?.name })}</p>
        <pre className="sunken">{JSON.stringify(view.state, null, 2)}</pre>
      </div>
    );
  if (!base) return <p className="muted pad">{t('lens.getting.ready', { name: view.lens.name })}</p>;
  const net = view.lens.net;
  const allow = async (on: boolean) => {
    await api('allowLensNet', { release: view.lens!.release, ...(on ? {} : { off: true }) }).catch((e: Error) => toast(e.message, 'error'));
    reload();
  };
  const where = view.lens.location;
  const allowTilt = tiltAsk;
  const allowWhere = async (on: boolean) => {
    await api('allowLensLocation', { release: view.lens!.release, ...(on ? {} : { off: true }) }).catch((e: Error) => toast(e.message, 'error'));
    reload();
  };
  return (
    <div className={bleed ? 'lens-box lens-bleed' : 'lens-box'} ref={setBox}>
      {full && (
        <button className="lens-full-exit" onClick={() => setFull(false)} title={t('lens.fullscreen.exit')} aria-label={t('lens.fullscreen.exit')}>
          ✕
        </button>
      )}
      {net && !net.allowed && (
        <div className="lens-net ask">
          <span>
            <Icon name="community" /> {t('lens.net.ask', { name: view.lens.name, hosts: net.hosts.join(', ') })}
          </span>
          <span className="muted">{t('lens.net.why')}</span>
          <button onClick={() => void allow(true)}>{t('lens.net.allow')}</button>
        </div>
      )}
      {net?.allowed && (
        <div className="lens-net">
          <span className="muted">
            <Icon name="community" /> {t('lens.net.on', { hosts: net.hosts.join(', ') })}
          </span>
          <button className="link" onClick={() => void allow(false)}>{t('lens.net.off')}</button>
        </div>
      )}
      {where && !where.allowed && (
        <div className="lens-net ask">
          <span>
            <Icon name="mapPin" /> {t(where.asks === 'exact' ? 'lens.location.ask.exact' : 'lens.location.ask', { name: view.lens.name })}
          </span>
          <span className="muted">{t('lens.location.why')}</span>
          <button onClick={() => void allowWhere(true)}>{t('lens.net.allow')}</button>
        </div>
      )}
      {where?.allowed && (
        <div className="lens-net">
          <span className="muted">
            <Icon name="mapPin" /> {t(where.asks === 'exact' ? 'lens.location.on.exact' : 'lens.location.on', { name: view.lens.name })}
          </span>
          <button className="link" onClick={() => void allowWhere(false)}>{t('lens.net.off')}</button>
        </div>
      )}
      {allowTilt && (
        <div className="lens-net ask">
          <span>
            <Icon name="zap" /> {t('lens.tilt.ask', { name: view.lens.name })}
          </span>
          <span className="muted">{t('lens.tilt.why')}</span>
          <button onClick={allowTilt}>{t('lens.net.allow')}</button>
        </div>
      )}
      {offer && (
        <div className="lens-net ask">
          <span>
            <Icon name="download" /> {t('lens.save.ask', { name: view.lens.name, file: offer.name, size: offer.size < 1024 * 1024 ? `${Math.max(1, Math.round(offer.size / 1024))} KB` : `${(offer.size / 1024 / 1024).toFixed(1)} MB` })}
          </span>
          <button
            className="link"
            onClick={() => {
              offer.drop();
              offered(null);
            }}
          >
            {t('lens.save.drop')}
          </button>
          <button
            style={{ marginLeft: 0 }}
            onClick={() => {
              void offer.save();
              offered(null);
            }}
          >
            {t('lens.save.save')}
          </button>
        </div>
      )}
      {buying && (
        <Modal title={buying.name} onClose={() => setBuying(null)}>
          {buying.ticket ? <p>{t('lens.tickets.have')}</p> : <BuyTicket show={buying} />}
        </Modal>
      )}
      {sharing && <LensShare space={space} board={board} meDid={meDid} onClose={() => setSharing(false)} />}
      {/* A new key when the hosts change: the frame loads again with the CSP that goes with them. */}
      <LensFrame tickets={asksTickets ? tickets : undefined} onTicket={wantTicket} onShare={() => (setFull(false), setSharing(true))} key={net?.allowed ? 'net' : 'none'} title={view.lens.name} release={view.lens.release} base={base} net={net?.allowed ? net.hosts : undefined} location={where?.allowed ? where.asks : undefined} tilt={view.lens.tilt} onTiltAsk={(allow) => setTiltAsk(() => allow)} onOffer={offered} onEdges={setBleed} onFullscreen={setFull} full={full} view={message} act={(name, input) => api('boardAction', { space: space.id, board: board.name, action: name, input })} onOpen={onOpen} />
    </div>
  );
}

/**
 * Whether your agents are let onto this board: a switch of yours, kept on your node. Closed, they neither read nor
 * write there and get none of its files (a book laid out by an agent, before its pictures come).
 */
export function BoardAgentsSwitch({ space, board }: { space: SpaceInfo; board: BoardInfo }) {
  const { t } = useTexts();
  const { data: closed, reload } = useApi(() => api<AgentBoardInfo[]>('agentBoards'), [space.id, board.name]);
  if (!closed) return null;
  const shut = closed.some((c) => c.space.id === space.id && c.board === board.name);
  const flip = () =>
    void api('closeBoardToAgents', { space: space.id, board: board.name, ...(shut ? { off: true } : {}) }).then(
      () => {
        reload();
        toast(t(shut ? 'board.agents.opened' : 'board.agents.closed', { board: board.title }));
      },
      (e: Error) => toast(e.message, 'error'),
    );
  return (
    <button onClick={flip} aria-pressed={shut} title={t(shut ? 'board.agents.out.hint' : 'board.agents.in.hint')}>
      {t(shut ? 'board.agents.out' : 'board.agents.in')}
    </button>
  );
}

/** The switch between a board's posts and its suggested client service. */
export function LensSwitch({ board, on, choose, className }: { board: BoardInfo; on: boolean; choose(on: boolean): void; className?: string }) {
  const { t } = useTexts();
  if (!board.lens || board.lens.mode === 'require') return null;
  return (
    <button className={className} onClick={() => choose(!on)} title={on ? t('lens.show.list') : t('lens.suggested', { name: board.lens.name })}>
      <Icon name={on ? 'hash' : 'zap'} /> {on ? t('lens.posts') : board.lens.name}
    </button>
  );
}
