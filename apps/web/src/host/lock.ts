import type { Home } from '@weave/node';

/* In place of packages/node/src/lock.ts: one tab at a time holds the home, by a Web Lock the Worker took before it opened it. */

export const acquireLock = (_home: Home) => () => {};
export const lockHolder = (_home: Home): number | undefined => undefined;
export const maybeWeave = (_pid: number): boolean => false;
