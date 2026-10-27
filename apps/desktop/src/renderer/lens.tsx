import { useEffect, useRef, useState } from 'react';
import type { BoardInfo, BoardViewInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bridge, bump, useApi } from './lib.ts';
import { toast } from './ui.tsx';

/*
 * A board shown through its client service: the service's own renderer (its site) in a sandboxed frame, which gets
 * the state its fold made and asks for actions. This view is the only thing it talks to:
 *
 *   to the frame    {weave: 'view', state, actions, board, me}     whenever the board changes
 *   from the frame  {weave: 'act', id, name, input}                do an action (signed by you, with your rights)
 *                   {weave: 'open', post}                          open a post in Weave
 *   to the frame    {weave: 'acted', id, error?}                   how that went
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

export function LensView({ space, board, meDid, onOpen }: { space: SpaceInfo; board: BoardInfo; meDid: string; onOpen(post: string): void }) {
  const { data: view, error } = useApi(() => api<BoardViewInfo>('boardView', { space: space.id, board: board.name, use: true }), [space.id, board.name, board.lens?.release]);
  const frame = useRef<HTMLIFrameElement>(null);
  // Where its view is served here: the desktop, the phone and the web preview each serve it their own way.
  const { data: base } = useApi(async () => (view?.lens?.site ? bridge.lensBase(view.lens.release) : undefined), [view?.lens?.release, view?.lens?.site]);
  const latest = useRef(view);
  latest.current = view;

  const send = (message: unknown) => frame.current?.contentWindow?.postMessage(message, '*');
  const sendView = () => {
    const v = latest.current;
    if (v) send({ weave: 'view', state: v.state ?? null, actions: v.actions ?? [], board: v.board, me: { did: meDid } });
  };
  useEffect(sendView, [view]);

  useEffect(() => {
    const listen = (event: MessageEvent) => {
      // Only its own frame, nothing else on the page.
      if (!frame.current || event.source !== frame.current.contentWindow) return;
      const m = event.data as { weave?: string; id?: unknown; name?: unknown; input?: unknown; post?: unknown };
      if (m?.weave === 'act' && typeof m.name === 'string') {
        api<{ view: BoardViewInfo }>('boardAction', { space: space.id, board: board.name, action: m.name, input: m.input ?? null }).then(
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
      if (m?.weave === 'open' && typeof m.post === 'string') onOpen(m.post);
    };
    window.addEventListener('message', listen);
    return () => window.removeEventListener('message', listen);
  }, [space.id, board.name]);

  if (error) return <p className="muted pad">{error}</p>;
  if (!view) return <p className="muted pad">Getting {board.lens?.name ?? 'its view'} ready…</p>;
  if (view.lens?.problem) return <p className="muted pad">{view.lens.name} can't show this board here: {view.lens.problem}</p>;
  if (!view.lens?.site)
    return (
      <div className="pad">
        <p className="muted">{view.lens?.name} has no view of its own. Its state:</p>
        <pre className="sunken">{JSON.stringify(view.state, null, 2)}</pre>
      </div>
    );
  if (!base) return <p className="muted pad">Getting {view.lens.name} ready…</p>;
  return <iframe ref={frame} className="lens-frame" title={view.lens.name} src={base} sandbox="allow-scripts" referrerPolicy="no-referrer" onLoad={sendView} />;
}

/** The switch between a board's posts and its suggested client service. */
export function LensSwitch({ board, on, choose }: { board: BoardInfo; on: boolean; choose(on: boolean): void }) {
  if (!board.lens || board.lens.mode === 'require') return null;
  return (
    <button onClick={() => choose(!on)} title={on ? 'Show the posts as a list' : `The maintainers suggest viewing this board with ${board.lens.name}`}>
      <Icon name={on ? 'hash' : 'zap'} /> {on ? 'Posts' : board.lens.name}
    </button>
  );
}
