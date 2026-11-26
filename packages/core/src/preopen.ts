import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';
import { b64u, utf8 } from './bytes.ts';

/*
 * Sealed bodies opened ahead of time, somewhere whose memory is thrown away after.
 *
 * Opening an account decrypts every sealed event it holds, and decrypting leaves far more behind than it gives: for
 * 21 600 events a node made 1.1 GB of short-lived objects to end up holding 90 MB. A browser on a phone doesn't give
 * that room back (its collector doesn't move what stays, so what stays is spread over all of it), and the phone ends a
 * page that takes too much. So a browser's node has a Worker of its own do the decrypting (openMany), takes the plain
 * texts it gives back, and ends it: what the Worker left behind goes with it.
 *
 * Nothing here knows events or spaces: bodies as stored, and the keys to try on them. What comes back is exactly what
 * `open` (crypto.ts) would have made of that body with that key and context, as text; `open` uses it only for that
 * same body, key and context (usePreopened), so nothing is read that couldn't be read without it.
 */

export interface PreopenWork {
  /**
   * Per scope of an event, per epoch its body names ('' where it names none): the keys to try, in order (base64url),
   * each with the context it seals with.
   */
  keys: Record<string, Record<string, Array<{ key: string; context: string }>>>;
  /** Sealed bodies as stored (JSON text), each with its event's scope. `event`: the text is the whole event, the body in it. */
  bodies: Array<{ scope: string; json: string; event?: boolean }>;
}

/** One body opened: what it was (ct, nonce), what opened it (key, context) and its plain text (JSON, not parsed). */
export interface Preopened {
  ct: string;
  nonce: string;
  key: string;
  context: string;
  plain: string;
}

/** Open what can be opened: a body no key here opens, or that isn't a sealed body, is left out. */
export function openMany(work: PreopenWork): Preopened[] {
  const out: Preopened[] = [];
  const decoder = new TextDecoder();
  const keyBytes = new Map<string, Uint8Array>();
  const contextBytes = new Map<string, Uint8Array>();
  for (const item of work.bodies) {
    const epochs = work.keys[item.scope];
    if (!epochs) continue;
    let body: { epoch?: unknown; nonce?: unknown; ct?: unknown } | null;
    try {
      const parsed = JSON.parse(item.json) as { body?: unknown } | null;
      body = (item.event ? parsed?.body : parsed) as typeof body;
    } catch {
      continue;
    }
    if (!body || typeof body !== 'object' || typeof body.nonce !== 'string' || typeof body.ct !== 'string') continue;
    const tries = epochs[body.epoch === undefined ? '' : String(body.epoch)];
    if (!tries) continue;
    let nonce: Uint8Array;
    let ct: Uint8Array;
    try {
      nonce = b64u.decode(body.nonce);
      ct = b64u.decode(body.ct);
    } catch {
      continue;
    }
    for (const { key, context } of tries) {
      try {
        let k = keyBytes.get(key);
        if (!k) keyBytes.set(key, (k = b64u.decode(key)));
        let c = contextBytes.get(context);
        if (!c) contextBytes.set(context, (c = utf8(context)));
        const plain = decoder.decode(xchacha20poly1305(k, nonce, c).decrypt(ct));
        out.push({ ct: body.ct, nonce: body.nonce, key, context, plain });
        break;
      } catch {
        // another key of this epoch, maybe
      }
    }
  }
  return out;
}
