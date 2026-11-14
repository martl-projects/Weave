import { createECDH, createHmac, createPrivateKey, createCipheriv, generateKeyPairSync, randomBytes, sign, type KeyObject } from 'node:crypto';

/*
 * Web Push from a storage node (docs/web-push.md): the message encrypted to the browser (RFC 8291, aes128gcm) and the
 * node's own key on the request (VAPID, RFC 8292). What's inside is already sealed by the sender to the browser's push
 * key: neither this node nor the push service (Apple, Google, Mozilla) reads it.
 */

const b64u = (bytes: Uint8Array): string => Buffer.from(bytes).toString('base64url');
const fromB64u = (text: string): Buffer => Buffer.from(text, 'base64url');

/** A storage node's VAPID keys: the public one browsers subscribe with (uncompressed P-256, base64url), the private one as JWK. */
export interface VapidKeys {
  publicKey: string;
  privateKey: JsonWebKey;
}

/** A browser's subscription, as PushManager.subscribe gives it. */
export interface PushSubscriptionData {
  endpoint: string;
  /** The browser's P-256 key (base64url, 65 bytes). */
  p256dh: string;
  /** Its auth secret (base64url, 16 bytes). */
  auth: string;
}

export function makeVapidKeys(): VapidKeys {
  const { publicKey, privateKey } = generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { publicKey: b64u(Buffer.concat([Buffer.from([4]), fromB64u(jwk.x!), fromB64u(jwk.y!)])), privateKey: privateKey.export({ format: 'jwk' }) };
}

const hmac = (key: Uint8Array, data: Uint8Array): Buffer => createHmac('sha256', key).update(data).digest();

/** RFC 8291: the body for one push, from a fresh key of this node's to the browser's. */
export function encryptPush(subscription: Pick<PushSubscriptionData, 'p256dh' | 'auth'>, payload: Uint8Array): Buffer {
  const uaPublic = fromB64u(subscription.p256dh);
  const authSecret = fromB64u(subscription.auth);
  if (uaPublic.length !== 65 || authSecret.length !== 16) throw new Error("that isn't a browser's push subscription");
  const ecdh = createECDH('prime256v1');
  const asPublic = ecdh.generateKeys();
  const shared = ecdh.computeSecret(uaPublic);
  const prkKey = hmac(authSecret, shared);
  const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
  const salt = randomBytes(16);
  const prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
  // One record: the payload, then its delimiter (2: the last record), no padding.
  const cipher = createCipheriv('aes-128-gcm', cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(payload), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** RFC 8292: the Authorization header for one push service (by the endpoint's origin), good for 12 hours. */
export function vapidAuthorization(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const header = b64u(Buffer.from(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u(Buffer.from(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject })));
  const key: KeyObject = createPrivateKey({ key: keys.privateKey, format: 'jwk' });
  const signature = sign('sha256', Buffer.from(`${header}.${claims}`), { key, dsaEncoding: 'ieee-p1363' });
  return `vapid t=${header}.${claims}.${b64u(signature)}, k=${keys.publicKey}`;
}

/** The push services browsers use: a storage node posts to these and no other address (it would be a way into its network). */
const PUSH_HOSTS = ['.googleapis.com', '.push.apple.com', '.push.services.mozilla.com', '.notify.windows.com'];

export function isPushEndpoint(endpoint: string, also: string[] = []): boolean {
  try {
    const url = new URL(endpoint);
    if (also.some((origin) => url.origin === origin)) return true;
    return url.protocol === 'https:' && PUSH_HOSTS.some((host) => url.hostname.endsWith(host));
  } catch {
    return false;
  }
}

/** Send one push. `gone`: the push service says the subscription no longer exists (drop it). */
export async function sendPush(subscription: PushSubscriptionData, payload: Uint8Array, keys: VapidKeys, subject: string, options: { ttl?: number; fetch?: typeof fetch } = {}): Promise<{ ok: boolean; gone: boolean; status: number }> {
  const res = await (options.fetch ?? fetch)(subscription.endpoint, {
    method: 'POST',
    headers: {
      TTL: String(options.ttl ?? 24 * 3600),
      Urgency: 'high',
      'Content-Encoding': 'aes128gcm',
      'Content-Type': 'application/octet-stream',
      Authorization: vapidAuthorization(subscription.endpoint, keys, subject),
    },
    body: new Uint8Array(encryptPush(subscription, payload)),
  });
  return { ok: res.ok, gone: res.status === 404 || res.status === 410, status: res.status };
}
