import { gunzipSync as gunzip, gzipSync as gzip } from 'fflate';

/*
 * node:zlib for a browser: what the node unpacks with (a pure component's release file, an image's layers) and packs
 * a backup with, in JavaScript (a browser's CompressionStream waits; these are read synchronously). The rest isn't here.
 */

export function gunzipSync(data: Uint8Array, options?: { maxOutputLength?: number }): Uint8Array {
  const out = gunzip(data);
  if (options?.maxOutputLength !== undefined && out.length > options.maxOutputLength) throw new RangeError('more than it may unpack to');
  return out;
}

export const gzipSync = (data: Uint8Array): Uint8Array => gzip(data);

export const crc32 = (): never => {
  throw new Error('zlib.crc32 is not there in a browser');
};

export default { gunzipSync, gzipSync, crc32 };
