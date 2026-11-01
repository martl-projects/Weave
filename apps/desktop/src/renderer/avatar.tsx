// Weave avatars: everyone's figure (a public weave.avatar event, a few numbers), drawn by Weave avatar's renderer
// (martl-projects/weave-avatar, pinned; it ships as dist/renderer/avatar3d/weave-avatar.js and loads when first needed).
// Someone without one shows as the figure their key makes (the same everywhere); their pixel sprite only while the
// renderer loads.

import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode, type RefObject } from 'react';
import { api, onItem } from './lib.ts';

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

/** Someone's head, as their avatar shows it; fallback while it's drawn (or when it can't be). */
export function FigureHead({ figure, seed, fallback }: { figure: Figure | null; seed: string; fallback: ReactNode }) {
  const url = usePicture((l) => l.snapshot(figure ?? l.Avatar.fromSeed(seed), 'face'), `face:${JSON.stringify(figure ?? seed)}`);
  return url ? <img className="figure-head" src={url} alt="" draggable={false} /> : <>{fallback}</>;
}

/**
 * Someone's avatar in a scene ("idea": pointing up, a light bulb above): their figure, or the one their key makes.
 * Small pictures come close (head and shoulders, with what's around them); big ones show all of it.
 */
export function SceneImage({ did, scene, size = 256, close = false, className = '' }: { did: string; scene: string; size?: number; close?: boolean; className?: string }) {
  const [ref, seen] = useSeen<HTMLSpanElement>();
  const figure = useFigure(did);
  const frame = close ? 'close' : 'full';
  const url = usePicture(figure === undefined || !seen ? undefined : (l) => l.sceneSnapshot(figure ?? l.Avatar.fromSeed(did), scene, size, frame), `scene:${scene}:${size}:${frame}:${figure === undefined ? 'asking' : JSON.stringify(figure ?? did)}`);
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
  // Few people: a taller picture, so they aren't small in a wide one. Peeking over an edge: from the navel up, shoulder
  // to shoulder, as wide as there are people (up to a banner's width; then rows behind).
  const [width, height] = peek ? [Math.round(256 * Math.min(5.5, Math.max(1, ((people.length - 1) * 1.3 + 1.5) / 3.6))), 256] : people.length <= 2 ? [400, 400] : people.length <= 4 ? [512, 384] : [512, 288];
  const [ref, seen] = useSeen<HTMLDivElement>();
  const figures = useFigures(people);
  const url = usePicture(figures && seen ? (l) => l.groupSnapshot(figures.map((f, i) => f ?? l.Avatar.fromSeed(people[i])), width, height, { banner, peek, poses: people.map((d) => poses?.[d] ?? '') }) : undefined, `group:${width}x${height}:${peek ? 'peek' : ''}:${banner ?? ''}:${people.map((d) => poses?.[d] ?? '').join(',')}:${JSON.stringify(figures ?? people)}`);
  return <div ref={ref} className={`group-photo ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>{url && <img src={url} alt={banner ? `${banner}: a group photo` : 'A group photo'} draggable={false} />}</div>;
}

/**
 * A post's scene with everyone who wrote it: alone, its author in the scene; with co-authors (those who confirmed),
 * all of them together, its author in the scene and the others beside them. Small pictures show heads and shoulders.
 */
export function PostScene({ post, scene, size, close = false, className = '' }: { post: { by: { did: string }; coauthors?: Array<{ did: string; state: string }> }; scene: string; size: number; close?: boolean; className?: string }) {
  const others = [...new Set((post.coauthors ?? []).filter((c) => c.state === 'confirmed' && c.did !== post.by.did).map((c) => c.did))];
  if (!others.length) return <SceneImage did={post.by.did} scene={scene} size={size} close={close} className={className} />;
  return <GroupPhoto dids={[post.by.did, ...others]} poses={{ [post.by.did]: scene }} peek={close} className={`post-group ${className}`} />;
}
