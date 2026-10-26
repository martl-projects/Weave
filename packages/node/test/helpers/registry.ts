import { createHash } from 'node:crypto';
import type { Fetch } from '../../src/index.ts';

/** A registry holding images as they really are: an index, a manifest per platform, a config with labels; each served by its digest. */
export function registry(images: Record<string, { labels?: Record<string, string> }>, options: { tamper?: boolean } = {}): Fetch {
  const blobs = new Map<string, string>();
  const put = (body: unknown) => {
    const text = JSON.stringify(body);
    const digest = `sha256:${createHash('sha256').update(text).digest('hex')}`;
    blobs.set(digest, text);
    return digest;
  };
  const tags = new Map<string, string>();
  for (const [name, image] of Object.entries(images)) {
    const config = put({ architecture: 'amd64', os: 'linux', config: { Labels: image.labels ?? null } });
    const amd64 = put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: config }, layers: [] });
    const arm64 = put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.manifest.v1+json', config: { digest: config }, layers: [], annotations: { arch: 'arm64' } });
    tags.set(name, put({ schemaVersion: 2, mediaType: 'application/vnd.oci.image.index.v1+json', manifests: [{ digest: amd64, platform: { os: 'linux', architecture: 'amd64' } }, { digest: arm64, platform: { os: 'linux', architecture: 'arm64' } }] }));
  }
  return (async (input: string | URL | Request) => {
    const url = new URL(String(input));
    const m = url.pathname.match(/^\/v2\/martl\/quizbot\/(manifests|blobs)\/(.+)$/);
    if (url.host !== 'ghcr.io' || !m) return new Response('{}', { status: 404 });
    const digest = m[1] === 'manifests' && !m[2].startsWith('sha256:') ? tags.get(`quizbot:${m[2]}`) : m[2];
    const body = digest && blobs.get(digest);
    if (!body) return new Response('{}', { status: 404 });
    const served = options.tamper && m[1] === 'blobs' ? body.replace('quizbot', 'evilbot') : body;
    return new Response(served, { status: 200, headers: { 'docker-content-digest': digest } });
  }) as Fetch;
}
