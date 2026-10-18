import { base64urlnopad } from '@scure/base';

export type Json = null | boolean | number | string | Json[] | { [key: string]: Json };

/**
 * Deterministic JSON: object keys sorted, no whitespace. Everything that is
 * signed or hashed goes through this so every client produces the same bytes.
 */
export function canonicalJson(value: Json): string {
  if (value === null || typeof value === 'boolean' || typeof value === 'string') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new TypeError('canonicalJson: non-finite number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object') {
    const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  throw new TypeError(`canonicalJson: unsupported value of type ${typeof value}`);
}

export const utf8 = (text: string): Uint8Array => new TextEncoder().encode(text);

export const b64u = {
  encode: (bytes: Uint8Array): string => base64urlnopad.encode(bytes),
  decode: (text: string): Uint8Array => base64urlnopad.decode(text),
};
