import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
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
 *   from the frame  {weave: 'files'} / {weave: 'loaded'}            Weave Web's frame: the view's files, please / built
 *   to the frame    {weave: 'files', files: [{path, type, data}]}  (apps/web/src/lens-frame.html)
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
export function LensFrame({ title, release, base, view, act, onOpen, className, style }: { title: string; release: string; base: string; view: unknown; act(name: string, input: unknown): Promise<unknown>; onOpen?(post: string): void; className?: string; style?: CSSProperties }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const latest = useRef({ view, act, onOpen, release });
  latest.current = { view, act, onOpen, release };
  const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, '*');
  const sendView = () => send(latest.current.view);
  useEffect(sendView, [view]);

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
      // Weave Web's frame (apps/web/src/lens-frame.html) asks for the view's files, builds its page, and says so.
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
    return () => window.removeEventListener('message', listen);
  }, []);

  return <iframe ref={frame} className={className ?? 'lens-frame'} style={style} title={title} src={base} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={sendView} />;
}

export function LensView({ space, board, meDid, onOpen }: { space: SpaceInfo; board: BoardInfo; meDid: string; onOpen(post: string): void }) {
  const { t } = useTexts();
  const { data: view, error } = useApi(() => api<BoardViewInfo>('boardView', { space: space.id, board: board.name, use: true }), [space.id, board.name, board.lens?.release]);
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
  return <LensFrame title={view.lens.name} release={view.lens.release} base={base} view={message} act={(name, input) => api('boardAction', { space: space.id, board: board.name, action: name, input })} onOpen={onOpen} />;
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
