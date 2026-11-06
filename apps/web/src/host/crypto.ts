import { Buffer } from 'buffer';
import { hkdf } from '@noble/hashes/hkdf.js';
import { hmac } from '@noble/hashes/hmac.js';
import { sha1 } from '@noble/hashes/legacy.js';
import { sha256, sha512 } from '@noble/hashes/sha2.js';

/* node:crypto for a browser, as far as the node uses it: hashes, HMACs, HKDF, random bytes. */

type Input = string | Uint8Array;

const HASHES = { sha1, sha256, sha512 };
const bytes = (input: Input, encoding?: BufferEncoding): Uint8Array => (typeof input === 'string' ? Buffer.from(input, encoding ?? 'utf8') : input);

function algorithm(name: string) {
  const hash = HASHES[name.toLowerCase() as keyof typeof HASHES];
  if (!hash) throw new Error(`no hash ${name} in a browser`);
  return hash;
}

/** What createHash and createHmac give back: `update` as often as needed, then `digest`. */
function digesting(state: { update(data: Uint8Array): unknown; digest(): Uint8Array }) {
  const self = {
    update(data: Input, encoding?: BufferEncoding) {
      state.update(bytes(data, encoding));
      return self;
    },
    digest(encoding?: BufferEncoding) {
      const out = Buffer.from(state.digest());
      return encoding ? out.toString(encoding) : out;
    },
  };
  return self;
}

export const createHash = (name: string) => digesting(algorithm(name).create());
export const createHmac = (name: string, key: Input) => digesting(hmac.create(algorithm(name), bytes(key)));

export function randomBytes(size: number): Buffer {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(size)));
}

export const randomUUID = (): string => crypto.randomUUID();

export function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) throw new RangeError('the two have different lengths');
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export function hkdfSync(name: string, key: Input, salt: Input, info: Input, length: number): ArrayBuffer {
  return hkdf(algorithm(name), bytes(key), bytes(salt), bytes(info), length).slice().buffer as ArrayBuffer;
}

const nothere = (what: string) => (): never => {
  throw new Error(`${what} isn't there in a browser`);
};
export const createECDH = nothere('createECDH');
export const createPublicKey = nothere('createPublicKey');
export const createVerify = nothere('createVerify');
export const createSign = nothere('createSign');
export const createPrivateKey = nothere('createPrivateKey');
export const generateKeyPairSync = nothere('generateKeyPairSync');
export const createCipheriv = nothere('createCipheriv');
export const createDecipheriv = nothere('createDecipheriv');
export const sign = nothere('sign');
export const verify = nothere('verify');
export const X509Certificate = nothere('X509Certificate');
