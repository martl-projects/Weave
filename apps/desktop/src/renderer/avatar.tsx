// Weave avatars: everyone's figure (a public weave.avatar event, a few numbers), drawn by Weave avatar's renderer
// (martl-projects/weave-avatar, pinned; it ships as dist/renderer/avatar3d/weave-avatar.js and loads when first needed).
// Someone without one shows as the figure their key makes (the same everywhere); their pixel sprite only while the
// renderer loads.

import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
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

/** A picture from the renderer, once it's drawn. */
function usePicture(draw: ((l: AvatarLib) => Promise<string>) | undefined, key: string): string | undefined {
  const [url, setUrl] = useState<{ key: string; url: string }>();
  useEffect(() => {
    if (!draw) return;
    let live = true;
    avatarLib()
      .then(draw)
      .then((u) => live && setUrl({ key, url: u }))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [key]);
  return url?.key === key ? url.url : undefined;
}

/** Someone's head, as their avatar shows it; fallback while it's drawn (or when it can't be). */
export function FigureHead({ figure, seed, fallback }: { figure: Figure | null; seed: string; fallback: ReactNode }) {
  const url = usePicture((l) => l.snapshot(figure ?? l.Avatar.fromSeed(seed), 'face'), JSON.stringify(figure ?? seed));
  return url ? <img className="figure-head" src={url} alt="" draggable={false} /> : <>{fallback}</>;
}

/**
 * Someone's avatar in a scene ("idea": pointing up, a light bulb above): their figure, or the one their key makes.
 * Small pictures come close (head and shoulders, with what's around them); big ones show all of it.
 */
export function SceneImage({ did, scene, size = 256, close = false, className = '' }: { did: string; scene: string; size?: number; close?: boolean; className?: string }) {
  const figure = useFigure(did);
  const frame = close ? 'close' : 'full';
  const url = usePicture(figure === undefined ? undefined : (l) => l.sceneSnapshot(figure ?? l.Avatar.fromSeed(did), scene, size, frame), `${scene}:${size}:${frame}:${figure === undefined ? 'asking' : JSON.stringify(figure ?? did)}`);
  return <span className={`scene-image ${className}`}>{url && <img src={url} alt={sceneLabel(scene)} title={sceneLabel(scene)} draggable={false} />}</span>;
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
  const people = dids.slice(0, 12);
  // Few people: a taller picture, so they aren't small in a wide one. Peeking over an edge: one row, heads and
  // shoulders, as wide as there are people.
  const [width, height] = peek ? [Math.round(256 * Math.max(1, (people.length * 1.75 + 1.4) / 3.1)), 256] : people.length <= 2 ? [400, 400] : people.length <= 4 ? [512, 384] : [512, 288];
  const figures = useFigures(people);
  const url = usePicture(figures ? (l) => l.groupSnapshot(figures.map((f, i) => f ?? l.Avatar.fromSeed(people[i])), width, height, { banner, peek, poses: people.map((d) => poses?.[d] ?? '') }) : undefined, `${width}x${height}:${peek ? 'peek' : ''}:${banner ?? ''}:${people.map((d) => poses?.[d] ?? '').join(',')}:${JSON.stringify(figures ?? people)}`);
  return <div className={`group-photo ${className}`} style={{ aspectRatio: `${width} / ${height}` }}>{url && <img src={url} alt={banner ? `${banner}: a group photo` : 'A group photo'} draggable={false} />}</div>;
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
