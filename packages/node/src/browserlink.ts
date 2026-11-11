import { b64u, open, seal, sha256, utf8, type Json, type Sealed } from '@weave/core';

/*
 * A browser linked to a person's Weave (docs/web-stage2.md): one of their computers issues it a key of its own, like an
 * agent's but for the person's everyday use, and hands it over through the storage node it'll use. What goes there is
 * sealed with a secret that only the link has (in the address's #, which a browser never sends): the storage node holds
 * it for a while, by a token made from that secret, and can't open it. Whoever opens the link first gets it, once.
 */

/** A browser's key, as its grant names it: `browser:<name>`. It shows as the person, not as an agent. */
export const BROWSER_PREFIX = 'browser:';

/** How long a link's handover waits at the storage node. */
export const LINK_MS = 15 * 60_000;

const derive = (secret: Uint8Array, what: string): Uint8Array => sha256(new Uint8Array([...utf8(`weave/browser-link/${what}/v1 `), ...secret]));
const CONTEXT = 'weave/browser-link/v1';

/** What finds the handover at the storage node; it can't open it. */
export const linkToken = (secret: Uint8Array): string => b64u.encode(derive(secret, 'token'));
export const sealLink = (secret: Uint8Array, handover: Json): string => JSON.stringify(seal(derive(secret, 'key'), handover, CONTEXT));
export const openLink = <T>(secret: Uint8Array, data: string): T => open(derive(secret, 'key'), JSON.parse(data) as Sealed, CONTEXT) as unknown as T;

/** The link a browser opens: the storage node's page, with the secret after the #. */
export const browserLinkUrl = (url: string, secret: Uint8Array): string => `${url.replace(/\/+$/, '')}/#link=${b64u.encode(secret)}`;
