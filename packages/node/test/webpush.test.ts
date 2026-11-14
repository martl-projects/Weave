import { createDecipheriv, createECDH, createHmac, createPublicKey, randomBytes, verify } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { encryptPush, isPushEndpoint, makeVapidKeys, sendPush, vapidAuthorization } from '../src/webpush.ts';

/** A browser's side of RFC 8291, written apart from the sending side: what a browser does with the body. */
function browser() {
  const ecdh = createECDH('prime256v1');
  const uaPublic = ecdh.generateKeys();
  const auth = randomBytes(16);
  const hmac = (key: Uint8Array, data: Uint8Array) => createHmac('sha256', key).update(data).digest();
  return {
    subscription: { p256dh: uaPublic.toString('base64url'), auth: auth.toString('base64url') },
    open(body: Buffer): string {
      const salt = body.subarray(0, 16);
      const idlen = body[20];
      const asPublic = body.subarray(21, 21 + idlen);
      const ct = body.subarray(21 + idlen);
      const shared = ecdh.computeSecret(asPublic);
      const ikm = hmac(hmac(auth, shared), Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
      const prk = hmac(salt, ikm);
      const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
      const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
      const decipher = createDecipheriv('aes-128-gcm', cek, nonce);
      decipher.setAuthTag(ct.subarray(ct.length - 16));
      const plain = Buffer.concat([decipher.update(ct.subarray(0, ct.length - 16)), decipher.final()]);
      expect(plain.at(-1)).toBe(2);
      return plain.subarray(0, -1).toString('utf8');
    },
  };
}

describe('web push', () => {
  it('encrypts to the browser so that only it reads the message (RFC 8291)', () => {
    const b = browser();
    const body = encryptPush(b.subscription, Buffer.from('{"sealed":"by the sender"}'));
    expect(b.open(body)).toBe('{"sealed":"by the sender"}');
    // A fresh key each time: the same message twice looks different.
    expect(encryptPush(b.subscription, Buffer.from('x')).equals(encryptPush(b.subscription, Buffer.from('x')))).toBe(false);
    expect(() => browser().open(body)).toThrow();
  });

  it("signs for the push service with the node's key (VAPID, RFC 8292)", () => {
    const keys = makeVapidKeys();
    const header = vapidAuthorization('https://fcm.googleapis.com/fcm/send/abc', keys, 'https://web.martl.io', 1_800_000_000_000);
    const [, jwt, k] = /^vapid t=([^,]+), k=(.+)$/.exec(header)!;
    expect(k).toBe(keys.publicKey);
    const [h, c, s] = jwt.split('.');
    expect(JSON.parse(Buffer.from(c, 'base64url').toString())).toEqual({ aud: 'https://fcm.googleapis.com', exp: 1_800_000_000 + 12 * 3600, sub: 'https://web.martl.io' });
    const raw = Buffer.from(keys.publicKey, 'base64url');
    const key = createPublicKey({ key: { kty: 'EC', crv: 'P-256', x: raw.subarray(1, 33).toString('base64url'), y: raw.subarray(33).toString('base64url') }, format: 'jwk' });
    expect(verify('sha256', Buffer.from(`${h}.${c}`), { key, dsaEncoding: 'ieee-p1363' }, Buffer.from(s, 'base64url'))).toBe(true);
  });

  it('posts only to push services', () => {
    expect(isPushEndpoint('https://fcm.googleapis.com/fcm/send/x')).toBe(true);
    expect(isPushEndpoint('https://web.push.apple.com/QG')).toBe(true);
    expect(isPushEndpoint('https://updates.push.services.mozilla.com/wpush/v2/x')).toBe(true);
    expect(isPushEndpoint('http://fcm.googleapis.com/x')).toBe(false);
    expect(isPushEndpoint('https://169.254.169.254/latest')).toBe(false);
    expect(isPushEndpoint('https://evil.example/googleapis.com')).toBe(false);
  });

  it('sends with the headers a push service wants, and says when a subscription is gone', async () => {
    const b = browser();
    const keys = makeVapidKeys();
    const seen: Array<{ url: string; init: RequestInit }> = [];
    const fake = (async (url: string, init: RequestInit) => (seen.push({ url, init }), new Response(null, { status: seen.length === 1 ? 201 : 410 }))) as unknown as typeof fetch;
    const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/abc', ...b.subscription };
    expect(await sendPush(sub, Buffer.from('hi'), keys, 'https://web.martl.io', { fetch: fake })).toEqual({ ok: true, gone: false, status: 201 });
    const headers = seen[0].init.headers as Record<string, string>;
    expect(headers['Content-Encoding']).toBe('aes128gcm');
    expect(headers.Authorization).toMatch(/^vapid t=/);
    expect(b.open(Buffer.from(seen[0].init.body as Uint8Array))).toBe('hi');
    expect((await sendPush(sub, Buffer.from('hi'), keys, 'https://web.martl.io', { fetch: fake })).gone).toBe(true);
  });
});
