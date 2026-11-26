import { openMany, type PreopenWork } from '../../../packages/core/src/preopen.ts';

/*
 * A Worker that lives for one task: it opens the sealed events of an account that is being unlocked and gives their
 * plain texts back, and the node's Worker ends it (worker.ts, openedAhead). Decrypting leaves far more behind than it
 * gives, and a phone's browser doesn't give that room back to a Worker that goes on living: this one doesn't.
 */

declare const self: { onmessage: ((event: { data: PreopenWork }) => void) | null; postMessage(message: unknown): void };

self.onmessage = ({ data }) => self.postMessage(openMany(data));
