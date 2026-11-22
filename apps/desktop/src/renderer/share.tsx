import { useState, useSyncExternalStore } from 'react';
import type { BoardInfo, LinkTarget, PostInfo, SpaceInfo, WebsiteInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, useApi } from './lib.ts';
import { LinkFinish } from './onboardlinks.tsx';
import { useTexts } from './texts.tsx';

/*
 * Share mode: making a Weave link by going where it should lead. The places tree already is the hierarchy (project, board,
 * post; groups, communities), so instead of picking it again in lists, you navigate: where you are is where the link
 * opens, and the + beside the places in the tree lets the newcomer into more of them. A bar at the bottom says what the
 * link will do; Next asks the rest (welcome, how often, the card) and makes it. Outside your places it's a link to you.
 */

interface ShareState {
  on: boolean;
  /** More places it lets them into, beside the one it opens. */
  also: string[];
  /** On a project's Live page: the website it opens, or the project itself. */
  website: string;
}

let state: ShareState = { on: false, also: [], website: '' };
const listeners = new Set<() => void>();
const set = (next: Partial<ShareState>) => {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
};

/** Into share mode (the Share buttons, File → Make a link, Invite's Weave link). */
export const startShare = () => set({ on: true, also: [], website: '' });
export const stopShare = () => set({ on: false, also: [], website: '' });
/** The + in the tree: one more place the link lets them into, or one less. */
export const toggleAlso = (id: string) => set({ also: state.also.includes(id) ? state.also.filter((x) => x !== id) : [...state.also, id] });

export function useShare(): ShareState {
  return useSyncExternalStore(
    (l) => (listeners.add(l), () => void listeners.delete(l)),
    () => state,
  );
}

/** A place a link may let people into: a project's maintainers make its links, any member a group's or community's. */
export const mayShare = (space: SpaceInfo) => space.kind !== 'direct' && !space.closed && !!space.mayInvite;

/** Where the route is, as a link's target: a space, a board, a post or a website in it; outside your places, you. */
function targetOf(route: string[], spaces: SpaceInfo[], website: string, postSpace?: string): { target?: LinkTarget; space?: SpaceInfo; notYours?: SpaceInfo } {
  const inSpace = ['p', 'g', 'r'].includes(route[0]) ? spaces.find((s) => s.id === route[1]) : route[0] === 'post' && postSpace ? spaces.find((s) => s.id === postSpace) : undefined;
  if (route[0] === 'post' && route[1]) {
    if (!inSpace) return { target: { kind: 'me' } };
    if (!mayShare(inSpace)) return { notYours: inSpace };
    return { target: { kind: 'post', space: inSpace.id, post: route[1] }, space: inSpace };
  }
  if (!inSpace) return { target: { kind: 'me' } };
  if (!mayShare(inSpace)) return { notYours: inSpace };
  const [view, arg, post] = [route[2], route[3], route[4]];
  if (view === 'b' && arg && post) return { target: { kind: 'post', space: inSpace.id, post }, space: inSpace };
  if (view === 'b' && arg) return { target: { kind: 'board', space: inSpace.id, board: arg }, space: inSpace };
  if (view === 'post' && arg) return { target: { kind: 'post', space: inSpace.id, post: arg }, space: inSpace };
  if (view === 'live' && website) return { target: { kind: 'website', space: inSpace.id, website }, space: inSpace };
  return { target: { kind: 'space', space: inSpace.id }, space: inSpace };
}

const PREFIX: Record<string, string> = { project: 'p/', community: 'r/', group: 'g/' };
/** A place as the bar names it: p/Pilzfinder, g/Kletterfreunde, r/Pilze. */
const named = (s: SpaceInfo) => `${PREFIX[s.kind] ?? ''}${s.name}`;

/** The bar at the bottom while sharing: where the link leads, where else it lets them in, and Next. */
export function ShareBar({ route, spaces }: { route: string[]; spaces: SpaceInfo[] }) {
  const { t } = useTexts();
  const share = useShare();
  const [finishing, setFinishing] = useState(false);
  const postId = route[0] === 'post' ? route[1] : route[2] === 'b' ? route[4] : route[2] === 'post' ? route[3] : undefined;
  const { data: post } = useApi(() => (share.on && postId ? api<PostInfo>('post', postId).catch(() => undefined) : Promise.resolve(undefined)), [share.on, postId]);
  const { target, space, notYours } = targetOf(route, spaces, share.website, post?.space?.id);
  const projectId = space?.kind === 'project' ? space.id : '';
  const { data: boards } = useApi(() => (share.on && projectId ? api<BoardInfo[]>('boards', projectId) : Promise.resolve([] as BoardInfo[])), [share.on, projectId]);
  const onLive = !!projectId && route[2] === 'live';
  const { data: websites } = useApi(() => (share.on && onLive ? api<WebsiteInfo[]>('websites', projectId).catch(() => [] as WebsiteInfo[]) : Promise.resolve([] as WebsiteInfo[])), [share.on, onLive, projectId]);
  const { data: me } = useApi(() => (share.on ? api<{ name?: string }>('profile') : Promise.resolve({} as { name?: string })), [share.on]);
  if (!share.on) return null;

  const board = target && 'board' in target ? boards?.find((b) => b.name === target.board) : target?.kind === 'post' ? boards?.find((b) => b.name === route[3]) : undefined;
  const site = target?.kind === 'website' ? websites?.find((w) => w.id === target.website) : undefined;
  const crumbs = !target
    ? []
    : target.kind === 'me'
      ? [t('sharemode.to.me', { name: me?.name ?? '' })]
      : [named(space!), ...(board ? [board.title] : []), ...(target.kind === 'post' ? [post?.title || t('word.post')] : []), ...(site ? [site.name] : [])];
  const title = target?.kind === 'me' ? (me?.name ?? '') : (crumbs[crumbs.length - 1] ?? '');
  // Places in the plan beside the one it opens; the one it opens doesn't count twice.
  const also = share.also.filter((id) => id !== space?.id).map((id) => spaces.find((s) => s.id === id)).filter((s): s is SpaceInfo => !!s && mayShare(s));

  return (
    <div className="share-bar" role="region" aria-label={t('sharemode.title')}>
      <div className="share-where">
        <span className="share-label">
          <Icon name="share" /> {t('sharemode.opens')}
        </span>
        {notYours ? (
          <span className="share-crumbs muted">{t('sharemode.not.yours', { place: notYours.name })}</span>
        ) : (
          <span className="share-crumbs">
            {crumbs.map((c, i) => (
              <span key={i}>
                {i > 0 && <span className="share-sep"> › </span>}
                <b>{c}</b>
              </span>
            ))}
          </span>
        )}
        {onLive && !!websites?.length && (
          <select aria-label={t('linkb.what.website')} value={share.website} onChange={(e) => set({ website: e.target.value })}>
            <option value="">{t('sharemode.live.project')}</option>
            {websites.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        )}
      </div>
      {/* Every place it adds them to: the one it opens (its own, it stays), then what the + added (× takes it out). */}
      <div className="share-also">
        {(space || also.length > 0) && <span className="share-label">{t('sharemode.also')}</span>}
        {space && <span className="share-chip">{named(space)}</span>}
        {also.map((s) => (
          <span className="share-chip" key={s.id}>
            {named(s)}
            <button className="link" aria-label={t('sharemode.also.remove', { place: s.name })} onClick={() => toggleAlso(s.id)}>
              ×
            </button>
          </span>
        ))}
        {!also.length && <span className="small muted">{t('sharemode.hint')}</span>}
      </div>
      <div className="buttons">
        <button onClick={stopShare}>{t('button.cancel')}</button>
        <button className="default" disabled={!target} onClick={() => setFinishing(true)}>
          {t('linkb.next')}
        </button>
      </div>
      {finishing && target && (
        <LinkFinish
          target={target}
          space={space}
          also={also.map((s) => s.id)}
          title={title}
          crumbs={[...crumbs, ...also.map((s) => `+ ${named(s)}`)]}
          onClose={(made) => (setFinishing(false), made && stopShare())}
        />
      )}
    </div>
  );
}

/** The + beside a place in the tree while sharing. */
export function ShareAdd({ space, route }: { space: SpaceInfo; route: string[] }) {
  const { t } = useTexts();
  const share = useShare();
  if (!share.on || !mayShare(space) || route[1] === space.id) return null;
  const added = share.also.includes(space.id);
  return (
    <button
      className={`share-add${added ? ' on' : ''}`}
      title={t(added ? 'sharemode.also.remove' : 'sharemode.also.add', { place: space.name })}
      aria-pressed={added}
      onClick={(e) => (e.preventDefault(), toggleAlso(space.id))}
    >
      {added ? (
        <>
          <span className="share-yes">✓</span>
          <span className="share-no">×</span>
        </>
      ) : (
        '+'
      )}
    </button>
  );
}
