import type { Backend } from '@weave/node/client';

/** Backend methods the renderer may call. `watch` is handled separately as an event stream. */
export const RENDERER_METHODS = [
  'whoami',
  'status',
  'feed',
  'publish',
  'groups',
  'createGroup',
  'invite',
  'joinGroup',
  'members',
  'removeMember',
  'setEdge',
  'social',
  'profile',
  'setProfile',
  'directory',
] as const satisfies ReadonlyArray<keyof Backend>;

export type RendererMethod = (typeof RENDERER_METHODS)[number];
