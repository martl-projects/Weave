import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { roughLocation, screenTilt, type LensLocation } from '@weave/core';
import type { BoardInfo, BoardViewInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bridge, bump, useApi } from './lib.ts';
import { toast } from './ui.tsx';
import { useTexts } from './texts.tsx';

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
 *   to the frame    {weave: 'fullscreen', on, corner}               it fills the screen (or no longer); corner: the
 *                                                                  square at its top right (px) Weave's ✕ sits in
 *   from the frame  {weave: 'locate', id}                           where am I? (only if its member allowed it)
 *   to the frame    {weave: 'location', id, lat, lon, accuracy, rough} / {weave: 'location', id, error}
 *                                                                  Weave asks the device, never the frame; rough is
 *                                                                  the middle of a 0.01° cell (roughLocation)
 *   from the frame  {weave: 'tilt', on}                             how is the device tilted? (only if its manifest
 *                                                                  says "tilt"; on: false, no longer)
 *   to the frame    {weave: 'tilt', x, y}                           again and again while it is asked and in sight:
 *                                                                  degrees to the side and forward (screenTilt)
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

/** An iPhone asks its owner before a page hears its sensors, and only after a tap in that page: this asks. */
const tiltAsks = (): (() => Promise<string>) | undefined => {
  const ask = typeof DeviceOrientationEvent === 'undefined' ? undefined : (DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> }).requestPermission;
  return typeof ask === 'function' ? () => ask.call(DeviceOrientationEvent) : undefined;
};
let tiltGranted = false;

export function LensFrame({ title, release, base, net, location, tilt, onTiltAsk, onLocated, onFullscreen, full, view, act, onOpen, className, style }: { title: string; release: string; base: string; net?: string[]; location?: LensLocation; /** Its manifest says its site may ask how the device is tilted. */ tilt?: boolean; /** The device wants a tap in Weave first: `allow` is what that tap does (null: no longer needed). */ onTiltAsk?(allow: (() => void) | null): void; onLocated?(): void; onFullscreen?(on: boolean): void; full?: boolean; view: unknown; act(name: string, input: unknown): Promise<unknown>; onOpen?(post: string): void; className?: string; style?: CSSProperties }) {
  const { t } = useTexts();
  const frame = useRef<HTMLIFrameElement>(null);
  // Weave Web's frame takes its CSP from its address (a Pages Function): the hosts this member allowed, or none. On a
  // computer or a phone the node's answer carries them (lensFile), so the address stays as it is.
  const hosts = net?.length ? net.join(',') : '';
  const src = bridge.web && hosts ? `${base}?net=${encodeURIComponent(hosts)}` : base;
  const latest = useRef({ view, act, onOpen, release, hosts, title, t, location, tilt, onTiltAsk, onLocated, onFullscreen });
  latest.current = { view, act, onOpen, release, hosts, title, t, location, tilt, onTiltAsk, onLocated, onFullscreen };
  const tilting = useRef<(() => void) | null>(null);
  const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, '*');
  const sendView = () => send(latest.current.view);
  useEffect(sendView, [view]);
  // The view hears when it fills the screen, and where Weave's ✕ is then, so it keeps that corner free.
  useEffect(() => send({ weave: 'fullscreen', on: !!full, corner: 40 }), [full]);

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
      // How the device is tilted: only for a view whose manifest says so, heard from the device here, never in the frame.
      if (m?.weave === 'tilt') {
        tilting.current?.();
        tilting.current = null;
        latest.current.onTiltAsk?.(null);
        if ((m as { on?: unknown }).on !== false && latest.current.tilt) {
          const start = () => {
            tilting.current?.();
            tilting.current = watchTilt((tilt) => send({ weave: 'tilt', ...tilt }));
          };
          const ask = tiltAsks();
          if (!ask || tiltGranted) start();
          else
            latest.current.onTiltAsk?.(() => {
              latest.current.onTiltAsk?.(null);
              ask().then(
                (answer) => {
                  if (answer !== 'granted') return;
                  tiltGranted = true;
                  start();
                },
                () => {},
              );
            });
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
    };
  }, []);

  return <iframe ref={frame} className={className ?? 'lens-frame'} style={style} title={title} src={src} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={sendView} />;
}

/**
 * A lens's view filling the screen: the browser's full screen where it has one for a page's element (a computer, an
 * Android phone), otherwise (an iPhone) the box laid over the whole app. Esc, or the button at the top, leaves it.
 */
function useFullscreen(box: { current: HTMLElement | null }, full: boolean, setFull: (on: boolean) => void) {
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const native = typeof el.requestFullscreen === 'function' && document.fullscreenEnabled;
    if (full && native && document.fullscreenElement !== el) el.requestFullscreen().catch(() => el.classList.add('lens-full'));
    else if (full && !native) el.classList.add('lens-full');
    document.documentElement.classList.toggle('lens-full-on', full);
    if (!full) {
      el.classList.remove('lens-full');
      if (document.fullscreenElement === el) void document.exitFullscreen().catch(() => {});
    }
  }, [full]);
  useEffect(() => {
    const changed = () => {
      if (!document.fullscreenElement && !box.current?.classList.contains('lens-full')) setFull(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && box.current?.classList.contains('lens-full')) setFull(false);
    };
    document.addEventListener('fullscreenchange', changed);
    window.addEventListener('keydown', key);
    return () => {
      document.removeEventListener('fullscreenchange', changed);
      window.removeEventListener('keydown', key);
    };
  }, []);
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
  const box = useRef<HTMLDivElement>(null);
  useFullscreen(box, full, setFull);
  // An iPhone wants a tap in Weave before the view hears how it is tilted: what that tap does, while it is wanted.
  const [tiltAsk, setTiltAsk] = useState<(() => void) | null>(null);
  const { data: view, error, reload } = useApi(() => api<BoardViewInfo>('boardView', { space: space.id, board: board.name, use: true }), [space.id, board.name, board.lens?.release]);
  // Where its view is served here: the desktop, the phone and the web preview each serve it their own way.
  const { data: base } = useApi(async () => (view?.lens?.site ? bridge.lensBase(view.lens.release) : undefined), [view?.lens?.release, view?.lens?.site]);
  const message = useMemo(() => view && { weave: 'view', state: view.state ?? null, actions: view.actions ?? [], board: view.board, me: { did: meDid } }, [view, meDid]);

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
    <div className="lens-box" ref={box}>
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
      {/* A new key when the hosts change: the frame loads again with the CSP that goes with them. */}
      <LensFrame key={net?.allowed ? 'net' : 'none'} title={view.lens.name} release={view.lens.release} base={base} net={net?.allowed ? net.hosts : undefined} location={where?.allowed ? where.asks : undefined} tilt={view.lens.tilt} onTiltAsk={(allow) => setTiltAsk(() => allow)} onFullscreen={setFull} full={full} view={message} act={(name, input) => api('boardAction', { space: space.id, board: board.name, action: name, input })} onOpen={onOpen} />
    </div>
  );
}

/** The switch between a board's posts and its suggested client service. */
export function LensSwitch({ board, on, choose }: { board: BoardInfo; on: boolean; choose(on: boolean): void }) {
  const { t } = useTexts();
  if (!board.lens || board.lens.mode === 'require') return null;
  return (
    <button onClick={() => choose(!on)} title={on ? t('lens.show.list') : t('lens.suggested', { name: board.lens.name })}>
      <Icon name={on ? 'hash' : 'zap'} /> {on ? t('lens.posts') : board.lens.name}
    </button>
  );
}
