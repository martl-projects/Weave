// Weave avatars: everyone's figure (a public weave.avatar event, a few numbers), drawn by Weave avatar's renderer
// (martl-projects/weave-avatar, pinned; it ships as dist/renderer/avatar3d/weave-avatar.js and loads when first needed).
// Someone without one shows as the figure their key makes (the same everywhere); their pixel sprite only while the
// renderer loads.

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { api, onItem } from './lib.ts';
import { Sprite } from './ui.tsx';
import { t } from './texts.tsx';

export type Figure = Record<string, number>;

/** What Weave uses of the renderer (see the weave-avatar repository's README). */
export interface AvatarLib {
  Avatar: {
    PARTS: Record<string, number>;
    ADJUST: Record<string, number>;
    COLORS: Record<string, string[]>;
    clean(a: unknown): Figure;
    random(): Figure;
    fromSeed(text: string): Figure;
    screenFromSeed(text: string): Figure;
    offset(a: Figure, key: string): number;
  };
  snapshot(a: Figure, kind?: 'head' | 'face' | 'bust'): Promise<string>;
  sceneSnapshot(a: Figure, scene: string, size?: number, frame?: 'full' | 'close'): Promise<string>;
  mountViewer(el: HTMLElement): { set(a: Figure, bounce?: boolean): void; zoom(k: number): void; dispose(): void };
  loadFaceSprites(): Promise<void>;
  thumb(part: string, a: Figure, size?: number): string;
  partNames(part: string): string[];
  SCENES: Array<{ id: string; label: string }>;
  groupSnapshot(people: Figure[], width?: number, height?: number, opts?: { banner?: string; color?: string; poses?: string[]; peek?: boolean }): Promise<string>;
  GROUP_PHOTO_MAX: number;
  GROUP_POSES: Array<{ id: string; label: string }>;
}

let lib: Promise<AvatarLib> | undefined;
/** The renderer, loaded once (three.js and the figure: about 2 MB, so only when an avatar is drawn). */
export function avatarLib(): Promise<AvatarLib> {
  lib ??= import(/* not bundled: it's the pinned release */ new URL('./avatar3d/weave-avatar.js', import.meta.url).href) as Promise<AvatarLib>;
  return lib;
}

// ---------------------------------------------------------------- whose figure is what (asked in batches, kept)

const figures = new Map<string, Figure | null>();
const wanted = new Set<string>();
const listeners = new Set<() => void>();
let version = 0;
let asking: ReturnType<typeof setTimeout> | undefined;

function changed(): void {
  version++;
  for (const listener of listeners) listener();
}

function want(did: string): void {
  if (figures.has(did) || wanted.has(did)) return;
  wanted.add(did);
  asking ??= setTimeout(() => {
    asking = undefined;
    const people = [...wanted];
    wanted.clear();
    for (const did of people) figures.set(did, null);
    void api<Record<string, Figure>>('avatars', people)
      .then((found) => {
        for (const did of people) figures.set(did, found[did] ?? null);
        changed();
      })
      .catch(() => {});
  }, 30);
}

// Someone changed theirs: ask again.
onItem((item) => {
  if (item.kind !== 'weave.avatar' || !figures.has(item.author)) return;
  forgetFigure(item.author);
});

/** Forget what we know of someone's figure (after you changed yours). */
export function forgetFigure(did: string): void {
  figures.delete(did);
  want(did);
  changed();
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Several people's figures at once: each theirs or null, undefined while any is still asked for. */
export function useFigures(dids: string[]): Array<Figure | null> | undefined {
  useSyncExternalStore(subscribe, () => version);
  const key = dids.join(',');
  useEffect(() => dids.forEach(want), [key]);
  const all = dids.map((did) => figures.get(did));
  return all.some((f) => f === undefined) ? undefined : (all as Array<Figure | null>);
}

/** Someone's figure: theirs, null when they have none, undefined while it's asked for. */
export function useFigure(did: string): Figure | null | undefined {
  useSyncExternalStore(subscribe, () => version);
  useEffect(() => want(did), [did]);
  return figures.get(did);
}

// ---------------------------------------------------------------- pictures: drawn when seen, kept on disk

/*
 * Drawing a picture takes the renderer 20–35 ms, so only what's (nearly) on screen is drawn, and what's drawn is kept
 * on disk (this app's IndexedDB) under the renderer's release: the next start shows it at once. A new release draws
 * anew. The oldest go once there are more than KEEP.
 */
const KEEP = 1500;
const RELEASE = typeof AVATAR_RELEASE === 'string' ? AVATAR_RELEASE : 'dev';
let store: Promise<IDBDatabase | undefined> | undefined;
function pictureStore(): Promise<IDBDatabase | undefined> {
  store ??= new Promise((resolve) => {
    try {
      const open = indexedDB.open('weave-avatar-pictures', 1);
      open.onupgradeneeded = () => open.result.createObjectStore('pictures').createIndex('used', 'used');
      open.onsuccess = () => resolve(open.result);
      open.onerror = () => resolve(undefined);
    } catch {
      resolve(undefined);
    }
  });
  return store;
}
const done = <T,>(r: IDBRequest<T>) => new Promise<T | undefined>((resolve) => ((r.onsuccess = () => resolve(r.result)), (r.onerror = () => resolve(undefined))));
async function keptPicture(key: string): Promise<string | undefined> {
  const db = await pictureStore();
  if (!db) return undefined;
  const row = await done<{ url: string; used: number } | undefined>(db.transaction('pictures').objectStore('pictures').get(`${RELEASE}:${key}`));
  if (row) db.transaction('pictures', 'readwrite').objectStore('pictures').put({ ...row, used: Date.now() }, `${RELEASE}:${key}`);
  return row?.url;
}
let kept = 0;
async function keepPicture(key: string, url: string): Promise<void> {
  const db = await pictureStore();
  if (!db) return;
  db.transaction('pictures', 'readwrite').objectStore('pictures').put({ url, used: Date.now() }, `${RELEASE}:${key}`);
  // Now and then: the least recently used go, past KEEP (older releases' first, as they're never used again).
  if (++kept % 50 !== 1) return;
  const pictures = db.transaction('pictures', 'readwrite').objectStore('pictures');
  const count = (await done(pictures.count())) ?? 0;
  if (count <= KEEP) return;
  let extra = count - KEEP;
  const cursor = pictures.index('used').openCursor();
  cursor.onsuccess = () => {
    const c = cursor.result;
    if (!c || extra-- <= 0) return;
    c.delete();
    c.continue();
  };
}

/** A picture by its key: kept on disk, or drawn (then kept). For pictures drawn outside React too (post cards). */
export async function picture(key: string, draw: (l: AvatarLib) => Promise<string>): Promise<string> {
  const known = await keptPicture(key);
  if (known) return known;
  const url = await draw(await avatarLib());
  void keepPicture(key, url);
  return url;
}

/** Whether an element has come (near) on screen: once it has, it stays seen. */
export function useSeen<T extends Element>(): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el) return;
    const io = new IntersectionObserver((entries) => entries.some((e) => e.isIntersecting) && setSeen(true), { rootMargin: '300px' });
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return [ref, seen];
}

/** A picture, once it's drawn (or found on disk); nothing is drawn before draw is given (seen, and known what to draw). */
function usePicture(draw: ((l: AvatarLib) => Promise<string>) | undefined, key: string): string | undefined {
  const [url, setUrl] = useState<{ key: string; url: string }>();
  useEffect(() => {
    if (!draw) return;
    let live = true;
    picture(key, draw)
      .then((u) => live && setUrl({ key, url: u }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key, !!draw]);
  return url?.key === key ? url.url : undefined;
}

/**
 * An agent's (or a session's) figure when its person set none: their body, with a screen for a head; the screen, its
 * colours and its face made from the agent's (or session's) own seed, so each looks different.
 */
export function agentDefault(l: AvatarLib, person: Figure | null, personDid: string, seed: string): Figure {
  const own = l.Avatar.screenFromSeed(seed);
  const pick = (keys: string[]) => Object.fromEntries(keys.map((k) => [k, own[k]]));
  // A friendly face to start with: smiling mouths, open brows.
  const SMILES = [1, 2, 3, 5, 6, 7, 25], OPEN = [0, 4, 5, 6, 7, 22];
  return { ...(person ?? l.Avatar.fromSeed(personDid)), ...pick(['screen', 'screenColor', 'frameColor', 'eyes', 'eyeColor']), mouth: SMILES[own.mouth % SMILES.length], brows: OPEN[own.brows % OPEN.length], head: 1 };
}
/** What a session's default figure is made from: its name if it has one (so it stays when it moves), else its id. */
export const sessionSeed = (s: { name?: string; provider: string; id: string }) => `session:${s.name ?? `${s.provider}:${s.id}`}`;

/** A face drawn from a figure that depends on what's known (an agent's person, a session's): pixel sprite until then. */
export function MadeFace({ seed, size, make, ready }: { seed: string; size: number; make(l: AvatarLib): Figure; ready: boolean }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const sprite = <Sprite seed={seed} size={size} face />;
  const [figure, setFigure] = useState<Figure>();
  useEffect(() => {
    if (!ready || !seen) return;
    let live = true;
    void avatarLib().then((l) => live && setFigure(make(l)));
    return () => {
      live = false;
    };
  }, [ready, seen, seed]);
  return (
    <span ref={ref} className="avatar" style={{ width: size, height: size }}>
      {figure ? <FigureHead figure={figure} seed={seed} fallback={sprite} /> : sprite}
    </span>
  );
}

/** An agent's face: its own avatar, or its person's body with a screen for a head. */
export function AgentAvatar({ person, agent, size = 24 }: { person: string; agent: string; size?: number }) {
  const mine = useFigure(`${person}·${agent}`);
  const theirs = useFigure(person);
  return <MadeFace seed={`${person}·${agent}`} size={size} ready={mine !== undefined && theirs !== undefined} make={(l) => mine ?? agentDefault(l, theirs ?? null, person, `${person}·${agent}`)} />;
}

/** Whoever wrote something, by their face: the agent if one did (agents are who others see), else the person. */
export function AuthorAvatar({ by, size = 24 }: { by: { did: string; agent?: string }; size?: number }) {
  if (by.agent) return <AgentAvatar person={by.did} agent={by.agent} size={size} />;
  return <PersonAvatar did={by.did} size={size} />;
}

/** A session's face, so you know it again: its own avatar, or its person's body with a screen for a head. */
export function SessionAvatar({ session, person, size = 28 }: { session: { name?: string; provider: string; id: string; avatar?: Figure }; person: string; size?: number }) {
  const theirs = useFigure(person);
  const seed = sessionSeed(session);
  return <MadeFace seed={`${seed}:${JSON.stringify(session.avatar ?? null)}`} size={size} ready={theirs !== undefined} make={(l) => session.avatar ?? agentDefault(l, theirs ?? null, person, seed)} />;
}

/** Someone's head, as their avatar shows it; fallback while it's drawn (or when it can't be). */
export function FigureHead({ figure, seed, fallback }: { figure: Figure | null; seed: string; fallback: ReactNode }) {
  const url = usePicture((l) => l.snapshot(figure ?? l.Avatar.fromSeed(seed), 'face'), `face:${JSON.stringify(figure ?? seed)}`);
  return url ? <img className="figure-head" src={url} alt="" draggable={false} /> : <>{fallback}</>;
}

/**
 * Someone's avatar in a scene ("idea": pointing up, a light bulb above): their figure, or the one their key makes.
 * Small pictures come close (head and shoulders, with what's around them); big ones show all of it.
 */
export function SceneImage({ did, agent, scene, size = 256, close = false, className = '' }: { did: string; agent?: string; scene: string; size?: number; close?: boolean; className?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  // Written by an agent: the agent in the scene (its own avatar, or its person's body with a screen for a head).
  const person = useFigure(did);
  const own = useFigure(agent ? `${did}·${agent}` : did);
  const known = person !== undefined && own !== undefined;
  const make = (l: AvatarLib) => (agent ? (own ?? agentDefault(l, person ?? null, did, `${did}·${agent}`)) : (person ?? l.Avatar.fromSeed(did)));
  const who = agent ? `${did}·${agent}:${JSON.stringify(own ?? null)}` : '';
  const frame = close ? 'close' : 'full';
  const url = usePicture(!known || !seen ? undefined : (l) => l.sceneSnapshot(make(l), scene, size, frame), `scene:${scene}:${size}:${frame}:${who}:${!known ? 'asking' : JSON.stringify(person ?? did)}`);
  return <span ref={ref} className={`scene-image ${className}`}>{url && <img src={url} alt={sceneLabel(scene)} title={sceneLabel(scene)} draggable={false} />}</span>;
}

/** What someone can do on a group photo: its own poses, then the scenes (with their things), once the renderer is here. */
export function useGroupPoses(): Array<{ id: string; label: string; scene?: true }> | undefined {
  const [poses, setPoses] = useState<Array<{ id: string; label: string; scene?: true }>>();
  useEffect(() => {
    void avatarLib().then((l) => setPoses([...l.GROUP_POSES.map(({ id, label }) => ({ id, label })), ...l.SCENES.map(({ id, label }) => ({ id, label, scene: true as const }))]));
  }, []);
  return poses;
}

/**
 * A post's picture, as it chose: its image, no picture (scene "none"), a scene of its own, or (chosen nothing, like
 * every post from before) its author's avatar in a scene picked by its id: the same one every time, for everyone.
 * Only calm scenes are picked, none that says something the post doesn't (a bug, a release).
 */
const PICKED_SCENES = ['hello', 'thinking', 'coffee', 'coding', 'bookworm', 'cozy', 'bird-friend', 'good-dog', 'idea', 'celebrate'];
export function pickedScene(id: string): string {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return PICKED_SCENES[(h >>> 0) % PICKED_SCENES.length];
}
export function postScene(post: { id: string; image?: string; scene?: string }): string | undefined {
  if (post.image || post.scene === 'none') return undefined;
  return post.scene ?? pickedScene(post.id);
}

// The scenes' names, once the renderer is here (they come with it).
let labels: Record<string, string> = {};
export function useScenes(): Array<{ id: string; label: string }> | undefined {
  const [scenes, setScenes] = useState<Array<{ id: string; label: string }>>();
  useEffect(() => {
    void avatarLib().then((l) => {
      labels = Object.fromEntries(l.SCENES.map((s) => [s.id, s.label]));
      setScenes(l.SCENES);
    });
  }, []);
  return scenes;
}
export const sceneLabel = (id: string) => labels[id] ?? id;

/**
 * A group photo: up to twelve of its people (the first ones given), in rows, holding a banner with its name. Who has
 * no avatar stands there as the figure their key makes.
 */
export function GroupPhoto({ dids, banner, poses, peek, className = '' }: { dids: string[]; banner?: string; poses?: Record<string, string>; peek?: boolean; className?: string }) {
  const people = dids.slice(0, peek ? 36 : 12);
  // An agent (did·agent) without a figure of its own: its person's body with a screen for a head (their figure is asked for too).
  const persons = [...new Set(people.map((d) => d.split('·')[0]))];
  // Few people: a taller picture, so they aren't small in a wide one. Peeking over an edge: from the navel up, shoulder
  // to shoulder, as wide as there are people (up to a banner's width; then rows behind).
  const [width, height] = peek ? [Math.round(256 * Math.min(5.5, Math.max(1, ((people.length - 1) * 1.3 + 1.5) / 3.6))), 256] : people.length <= 2 ? [400, 400] : people.length <= 4 ? [512, 384] : [512, 288];
  const [ref, seen] = useSeen<HTMLDivElement>();
  const figures = useFigures([...people, ...persons]);
  const figureOf = (l: AvatarLib, i: number) => {
    const f = figures![i], [did, agent] = people[i].split('·');
    return f ?? (agent ? agentDefault(l, figures![people.length + persons.indexOf(did)] ?? null, did, people[i]) : l.Avatar.fromSeed(did));
  };
  const url = usePicture(figures && seen ? (l) => l.groupSnapshot(people.map((_, i) => figureOf(l, i)), width, height, { banner, peek, poses: people.map((d) => poses?.[d] ?? '') }) : undefined, `group:${width}x${height}:${peek ? 'peek' : ''}:${banner ?? ''}:${people.map((d) => poses?.[d] ?? '').join(',')}:${JSON.stringify(figures ?? people)}`);
  return <div ref={ref} className={`group-photo ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>{url && <img src={url} alt={banner ? t('photo.group.alt', { banner }) : t('photo.group.alt.plain')} draggable={false} />}</div>;
}

/**
 * A post's scene with everyone who wrote it: alone, its author in the scene; with co-authors (those who confirmed),
 * all of them together, its author in the scene and the others beside them. Written by an agent, as it's credited
 * ("person · agent"): the person and their agent's robot, the robot in the scene. Small pictures show heads and shoulders.
 */
export function PostScene({ post, scene, size, close = false, className = '' }: { post: { by: { did: string; agent?: string }; coauthors?: Array<{ did: string; state: string }> }; scene: string; size: number; close?: boolean; className?: string }) {
  const others = [...new Set((post.coauthors ?? []).filter((c) => c.state === 'confirmed' && c.did !== post.by.did).map((c) => c.did))];
  const writer = post.by.agent ? `${post.by.did}·${post.by.agent}` : post.by.did;
  const all = post.by.agent ? [post.by.did, writer, ...others] : [writer, ...others];
  if (all.length === 1) return <SceneImage did={post.by.did} scene={scene} size={size} close={close} className={className} />;
  return <GroupPhoto dids={all} poses={{ [writer]: scene }} peek={close} className={`post-group ${className}`} />;
}

/** A person's face: their avatar, or the one their key makes (pixel sprite until it's drawn). */
function PersonAvatar({ did, size }: { did: string; size: number }) {
  const figure = useFigure(did);
  return <MadeFace seed={did} size={size} ready={figure !== undefined} make={(l) => figure ?? l.Avatar.fromSeed(did)} />;
}

/** A session's whole figure in a scene (waving, unless told otherwise): its own avatar, or its person's body with a screen for a head. */
export function SessionFigure({ session, person, scene = 'hello', size = 320, className = '' }: { session: { name?: string; provider: string; id: string; avatar?: Figure }; person: string; scene?: string; size?: number; className?: string }) {
  const theirs = useFigure(person);
  const seed = sessionSeed(session);
  const url = usePicture(theirs === undefined ? undefined : (l) => l.sceneSnapshot(session.avatar ?? agentDefault(l, theirs ?? null, person, seed), scene, size), `scene:${scene}:${size}:full:${seed}:${JSON.stringify(session.avatar ?? null)}:${theirs === undefined ? 'asking' : JSON.stringify(theirs ?? person)}`);
  return <span className={`scene-image ${className}`}>{url && <img src={url} alt="" draggable={false} />}</span>;
}
