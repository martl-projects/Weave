import { useEffect, useState, useSyncExternalStore, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BadgeInfo, MarkInfo, MarksAnswer, MarkServiceInfo, SpaceInfo } from '@weave/node/client';
import { BadgeCard } from './badges.tsx';
import { api, onItem, useApi, useBlobUrl } from './lib.ts';
import { AsyncButton, attempt, Modal } from './ui.tsx';

/*
 * Marks next to names (stage 19): what the mark services you and the space chose say, each with who says so on
 * hover. A view asks once for all the names it shows (batched per slot and space); answers are kept until the node
 * says the marks may have changed, so navigating back and forth asks nothing again.
 * A bare check is Weave's own (a mark service Weave ships); every other check carries its issuer's initial.
 */

type Slot = 'author' | 'member' | 'chat' | 'profile';

/** How many marks show next to a name; the rest behind "+n". */
const SHOWN = 3;

/** Asks waiting for this tick's batch, per slot and space. */
const waiting = new Map<string, { slot: Slot; space?: string; dids: Set<string>; done: Array<(answers: Map<string, MarkInfo[]>) => void> }>();
/** Answers per tick, slot, space and person. */
const answered = new Map<string, MarkInfo[]>();
let answeredTick = -1;

function ask(tick: number, slot: Slot, space: string | undefined, did: string): Promise<MarkInfo[]> {
  if (tick !== answeredTick) {
    answered.clear();
    answeredTick = tick;
  }
  const key = `${slot}|${space ?? ''}`;
  const known = answered.get(`${key}|${did}`);
  if (known) return Promise.resolve(known);
  return new Promise((resolve) => {
    let batch = waiting.get(key);
    if (!batch) {
      batch = { slot, space, dids: new Set(), done: [] };
      waiting.set(key, batch);
      const b = batch;
      queueMicrotask(() => {
        waiting.delete(key);
        api<MarksAnswer[]>('marks', { slot: b.slot, space: b.space, subjects: [...b.dids].map((d) => ({ did: d })) }).then(
          (answers) => {
            const byDid = new Map(answers.map((a) => ['did' in a.subject ? a.subject.did : '', a.marks]));
            for (const d of b.dids) answered.set(`${key}|${d}`, byDid.get(d) ?? []);
            for (const done of b.done) done(byDid);
          },
          () => b.done.forEach((done) => done(new Map())),
        );
      });
    }
    batch.dids.add(did);
    batch.done.push((answers) => resolve(answers.get(did) ?? []));
  });
}

/*
 * Asked again only when the node says what the services say may have changed (weave.marks: an event they read
 * arrived, a fold finished, the services changed), not on every event: a chat message changes no marks.
 */
let version = 0;
const versionListeners = new Set<() => void>();
onItem((item) => {
  if (item.kind !== 'weave.marks') return;
  version++;
  for (const listener of versionListeners) listener();
});
const useMarksVersion = () =>
  useSyncExternalStore(
    (listener) => {
      versionListeners.add(listener);
      return () => versionListeners.delete(listener);
    },
    () => version,
  );

function useMarks(slot: Slot, did: string, space?: string): MarkInfo[] {
  const tick = useMarksVersion();
  const [marks, setMarks] = useState<MarkInfo[]>([]);
  useEffect(() => {
    let alive = true;
    void ask(tick, slot, space, did).then((m) => alive && setMarks(m));
    return () => {
      alive = false;
    };
  }, [tick, slot, space, did]);
  return marks;
}

const issuerText = (m: MarkInfo) => `${m.issuer.weave ? 'Weave' : m.issuer.name}${m.issuer.domain.kind === 'user' ? '' : ` · ${m.issuer.domain.name}`}`;
export const markTitle = (m: MarkInfo) => `${m.tooltip ? `${m.tooltip}\n` : ''}— says ${issuerText(m)} (${m.issuer.weave ? `${m.issuer.name}, shipped with Weave` : `${m.issuer.name} ${m.issuer.tag}`})`;

/** One mark: as its kind shows; a click on one about something (a badge) opens it. */
function MarkView({ mark, did, size }: { mark: MarkInfo; did: string; size: number }) {
  const url = useBlobUrl(mark.kind === 'image' ? mark.image : undefined);
  const [open, setOpen] = useState(false);
  const title = markTitle(mark);
  const show = mark.ref
    ? (e: MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setOpen(true);
      }
    : undefined;
  const style = { fontSize: size * 0.8, minWidth: size, height: size };
  let shown;
  if (mark.kind === 'image' && url) shown = <img className="badge-mark" src={url} alt={mark.tooltip ?? ''} title={title} width={size} height={size} onClick={show} />;
  else if (mark.kind === 'check')
    shown = (
      <span className={`mark mark-check${mark.issuer.weave ? ' is-weave' : ''}`} title={title} style={style} onClick={show}>
        {mark.issuer.weave ? '✓' : `${mark.issuer.name.slice(0, 1).toUpperCase()}✓`}
      </span>
    );
  else if (mark.kind === 'label' || mark.kind === 'count')
    shown = (
      <span className="mark mark-label" title={title} onClick={show}>
        {mark.kind === 'label' ? mark.text : mark.count}
      </span>
    );
  else
    shown = (
      <span className="badge-mark badge-mark-text" title={title} style={style} onClick={show}>
        {mark.symbol ?? '•'}
      </span>
    );
  return (
    <>
      {shown}
      {/* In a portal: a mark often sits in a link or a clickable row. */}
      {open && mark.ref && createPortal(<MarkedBadge id={mark.ref} did={did} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/** The badge a mark is about, as this node checks it, in full. */
function MarkedBadge({ id, did, onClose }: { id: string; did: string; onClose(): void }) {
  const [badge, setBadge] = useState<BadgeInfo | null>();
  useEffect(() => {
    void api<BadgeInfo[]>('badges', did).then(
      (all) => setBadge(all.find((b) => b.id === id) ?? null),
      () => setBadge(null),
    );
  }, [id, did]);
  if (badge === undefined) return null;
  if (!badge)
    return (
      <Modal title="Not found" onClose={onClose}>
        <p className="small muted">This node doesn't know that badge (or it moved on to someone else).</p>
      </Modal>
    );
  return <BadgeCard badge={badge} onClose={onClose} />;
}

/** What the services you and the space chose say about someone, next to their name. */
export function Marks({ did, slot, space, size = 16 }: { did: string; slot: Slot; space?: string; size?: number }) {
  const marks = useMarks(slot, did, space);
  if (!marks.length) return null;
  const rest = marks.slice(SHOWN);
  return (
    <span className="name-badges">
      {marks.slice(0, SHOWN).map((m, i) => (
        <MarkView key={`${m.issuer.release}-${i}`} mark={m} did={did} size={size} />
      ))}
      {rest.length > 0 && (
        <span className="mark mark-label" title={rest.map(markTitle).join('\n\n')}>
          +{rest.length}
        </span>
      )}
    </span>
  );
}

/** View → Marks…: your own mark services (shown everywhere you look), and taking one in from a project you're in. */
export function MarksSettings({ onClose }: { onClose(): void }) {
  const mine = useApi(() => api<MarkServiceInfo[]>('markServices', { off: true }), []);
  const spaces = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const [project, setProject] = useState('');
  const projects = (spaces.data ?? []).filter((s) => s.kind === 'project');
  const remove = (s: MarkServiceInfo) => attempt(() => api('removeMarks', { service: s.service }), `${s.name} removed`).then(mine.reload);
  const turnOn = (s: MarkServiceInfo) => attempt(() => api('addMarks', { shipped: s.service }), `${s.name} is back`).then(mine.reload);
  const add = () => attempt(() => api('addMarks', { project, follow: true }), 'Taken in').then(() => (setProject(''), mine.reload()));
  return (
    <Modal title="Marks" onClose={onClose}>
      <p className="small muted">
        Mark services show what they say next to names, everywhere you look; hover a mark to see who says so. Projects and communities can pin their own, shown only in
        them.
      </p>
      {mine.error && <p className="error">{mine.error}</p>}
      {(mine.data ?? []).map((s) => (
        <div className="marks-row" key={s.service}>
          <div>
            <b>{s.name}</b> <span className="small muted">{s.shipped ? `Weave ships it${s.off ? ' · off' : ''}` : `${s.tag} · from ${s.project?.name ?? 'a project you’re not in'}`}{s.follow ? ' · follows its newest release' : ''}</span>
            {s.problem && <div className="small error">Shows nothing: {s.problem}</div>}
            {s.shipped && s.service === 'from-weave' && <div className="small muted">Without it, a look-alike of Weave can’t be told apart at a glance.</div>}
          </div>
          {s.off ? <AsyncButton onClick={() => turnOn(s)}>Turn on</AsyncButton> : <AsyncButton onClick={() => remove(s)}>{s.shipped ? 'Turn off' : 'Remove'}</AsyncButton>}
        </div>
      ))}
      {mine.data && !mine.data.length && <p className="small muted">None yet.</p>}
      <fieldset>
        <legend>Take one in</legend>
        <div className="marks-row">
          <select value={project} onChange={(e) => setProject(e.target.value)}>
            <option value="">A project that released one…</option>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <AsyncButton onClick={add} disabled={!project}>
            Add
          </AsyncButton>
        </div>
      </fieldset>
    </Modal>
  );
}
