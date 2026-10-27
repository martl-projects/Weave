import { createHash } from 'node:crypto';
import type { Fetch } from '../../src/index.ts';

/**
 * A registry holding images as they really are: an index, a manifest per platform, a config with labels; each
 * served by its digest. Images are named "repo:tag" under ghcr.io/martl. A WebAssembly image (`wasm`: its one layer,
 * a gzipped tar) is indexed for wasi/wasm only, as docker buildx --platform wasi/wasm makes it.
 */
export function registry(images: Record<string, { labels?: Record<string, string>; wasm?: Uint8Array }>, options: { tamper?: boolean } = {}): Fetch {
  const blobs = new Map<string, Buffer>();
  const putBytes = (bytes: Uint8Array) => {
    const digest = `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
    blobs.set(digest, Buffer.from(bytes));
    return digest;
  };
  const put = (body: unknown) => putBytes(Buffer.from(JSON.stringify(body)));
  const tags = new Map<string, string>();
  for (const [name, image] of Object.entries(images)) {
    if (image.wasm) {
      const config = put({ architecture: 'wasm', os: 'wasi', config: { Labels: image.labels ?? null } });
      const layer = putBytes(image.wasm);
      const manifest = put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: config }, layers: [{ mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip', digest: layer, size: image.wasm.length }] });
      tags.set(name, put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [{ digest: manifest, platform: { os: 'wasi', architecture: 'wasm' } }] }));
      continue;
    }
    const config = put({ architecture: 'amd64', os: 'linux', config: { Labels: image.labels ?? null } });
    const amd64 = put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: config }, layers: [] });
    const arm64 = put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: config }, layers: [], annotations: { arch: 'arm64' } });
    tags.set(name, put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [{ digest: amd64, platform: { os: 'linux', architecture: 'amd64' } }, { digest: arm64, platform: { os: 'linux', architecture: 'arm64' } }] }));
  }
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const m = url.pathname.match(/^\/v2\/martl\/([^/]+)\/(manifests|blobs)\/(.+)$/);
    if (url.host !== 'ghcr.io' || !m) return new Response('{}', { status: 404 });
    const digest = m[2] === 'manifests' && !m[3].startsWith('sha256:') ? tags.get(`${m[1]}:${m[3]}`) : m[3];
    const body = digest && blobs.get(digest);
    if (!body) return new Response('{}', { status: 404 });
    const served = options.tamper && m[2] === 'blobs' ? Buffer.from(body.toString('latin1').replace('quizbot', 'evilbot'), 'latin1') : body;
    return new Response(new Uint8Array(served), { status: 200, headers: { 'docker-content-digest': digest } });
  }) as Fetch;
}
