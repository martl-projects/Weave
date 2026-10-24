import { createHash } from 'node:crypto';

/*
 * Container images in registries (Weave and Docker): which image a release
 * means, pinned by its digest. Weave only reads the registry's API (the OCI
 * distribution API that ghcr.io, Docker Hub and the others speak); it stores
 * and serves no images itself. Hosts' Docker pulls the image by that digest.
 */

type Fetch = typeof fetch;

/** Where an image lives: the registry's host and the repository path in it (Docker Hub's short names filled in). */
export function imageLocation(ref: string): { host: string; path: string } {
  const [first, ...rest] = ref.split('/');
  const isHost = rest.length > 0 && (first.includes('.') || first.includes(':') || first === 'localhost');
  if (isHost) return { host: first === 'docker.io' ? 'registry-1.docker.io' : first, path: rest.join('/') };
  return { host: 'registry-1.docker.io', path: rest.length ? ref : `library/${ref}` };
}

const ACCEPT = [
  'application/vnd.oci.image.index.v1+json',
  'application/vnd.docker.distribution.manifest.list.v2+json',
  'application/vnd.oci.image.manifest.v1+json',
  'application/vnd.docker.distribution.manifest.v2+json',
].join(', ');

/** A registry's bearer token for pulling, from the realm its 401 names (anonymously, or with `basic` credentials). */
async function pullToken(challenge: string, fetchImpl: Fetch, basic?: string): Promise<string | undefined> {
  const m = /^Bearer\s+(.*)$/i.exec(challenge);
  if (!m) return undefined;
  const params = Object.fromEntries([...m[1].matchAll(/(\w+)="([^"]*)"/g)].map(([, k, v]) => [k, v]));
  if (!params.realm) return undefined;
  const url = new URL(params.realm);
  for (const key of ['service', 'scope']) if (params[key]) url.searchParams.set(key, params[key]);
  const res = await fetchImpl(url, { headers: basic ? { authorization: `Basic ${basic}` } : {}, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) return undefined;
  const body = (await res.json().catch(() => ({}))) as { token?: string; access_token?: string };
  return body.token ?? body.access_token;
}

/**
 * The digest (sha256:…) of `ref` at one of `tags` (the first that exists), read from its registry. Public images
 * need nothing; `credentials` (a registry user and token, like a GitHub token for ghcr.io) are tried for private ones.
 */
export async function imageDigest(ref: string, tags: string[], options: { fetch?: Fetch; credentials?: { user: string; token: string } } = {}): Promise<{ tag: string; digest: string }> {
  const fetchImpl = options.fetch ?? fetch;
  const { host, path } = imageLocation(ref);
  const basic = options.credentials ? Buffer.from(`${options.credentials.user}:${options.credentials.token}`).toString('base64') : undefined;
  let refused = false;
  for (const tag of tags) {
    const url = `https://${host}/v2/${path}/manifests/${encodeURIComponent(tag)}`;
    // Anonymously first; for a private image, once more with the credentials.
    for (const asked of basic ? [undefined, basic] : [undefined]) {
      let res = await fetchImpl(url, { headers: { accept: ACCEPT }, signal: AbortSignal.timeout(20_000) });
      if (res.status === 401) {
        const token = await pullToken(res.headers.get('www-authenticate') ?? '', fetchImpl, asked);
        if (token) res = await fetchImpl(url, { headers: { accept: ACCEPT, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
      }
      if (res.status === 401 || res.status === 403) {
        refused = true;
        continue;
      }
      if (res.status === 404) break;
      if (!res.ok) throw new Error(`${host} answered ${res.status} for ${ref}:${tag}`);
      const header = res.headers.get('docker-content-digest');
      const body = Buffer.from(await res.arrayBuffer());
      const digest = header && /^sha256:[0-9a-f]{64}$/.test(header) ? header : `sha256:${createHash('sha256').update(body).digest('hex')}`;
      return { tag, digest };
    }
  }
  if (refused) throw new Error(`${ref} is private, or needs a sign-in Weave doesn't have: make the image public (on ghcr.io: the package's settings → visibility), then release again`);
  throw new Error(`there's no image ${ref} tagged ${tags.join(' or ')}: push it from the release workflow, tagged like the release`);
}
