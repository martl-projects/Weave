import { createHash } from 'node:crypto';

/*
 * Container images in registries (Weave and Docker): which image a release
 * means, pinned by its digest. Weave only reads the registry's API (the OCI
 * distribution API that ghcr.io, Docker Hub and the others speak); it stores
 * and serves no images itself. Hosts' Docker pulls the image by that digest.
 * A Weave service's manifest is read from its image's config (imageLabels), checked
 * against the digest at every step.
 */

type Fetch = typeof fetch;

/** Where an image lives: the registry's host and the repository path in it (Docker Hub's short names filled in). */
export function imageLocation(ref: string): { host: string; path: string } {
  const [first, ...rest] = ref.split('/');
  const isHost = rest.length > 0 && (first.includes('.') || first.includes(':') || first === 'localhost');
  if (isHost) return { host: first === 'docker.io' ? 'registry-1.docker.io' : first, path: rest.join('/') };
  return { host: 'registry-1.docker.io', path: rest.length ? ref : `library/${ref}` };
}

/** A registry's address: on this computer over http, as Docker allows it (a registry you run yourself); elsewhere https. */
const base = (host: string): string => (/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(host) ? `http://${host}` : `https://${host}`);

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
    const url = `${base(host)}/v2/${path}/manifests/${encodeURIComponent(tag)}`;
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

/** A registry request by digest, signed in the way its 401 asks (anonymously, or with `basic`); its body checked against the digest. */
async function byDigest(url: string, digest: string, accept: string, fetchImpl: Fetch, basic?: string): Promise<Buffer> {
  let res = await fetchImpl(url, { headers: { accept }, signal: AbortSignal.timeout(30_000) });
  if (res.status === 401) {
    const token = await pullToken(res.headers.get('www-authenticate') ?? '', fetchImpl, basic);
    if (token) res = await fetchImpl(url, { headers: { accept, authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
  }
  if (!res.ok) throw new Error(`${new URL(url).host} answered ${res.status} for ${digest}`);
  const body = Buffer.from(await res.arrayBuffer());
  // Whatever the registry serves, it has to be what the digest says.
  if (`sha256:${createHash('sha256').update(body).digest('hex')}` !== digest) throw new Error(`${new URL(url).host} served something else than ${digest}`);
  return body;
}

/** The platform an image index offers for this computer, as OCI names it. */
const ociArch = (arch: string): string => ({ x64: 'amd64', arm64: 'arm64', arm: 'arm', ia32: '386' })[arch] ?? arch;

/**
 * The labels of an image's config, at its digest: an index's image for Linux on this machine's architecture (or its
 * first Linux one). Every step is checked against its digest, so the labels are as pinned as the image.
 */
export async function imageLabels(ref: string, digest: string, options: { fetch?: Fetch; credentials?: { user: string; token: string }; arch?: string } = {}): Promise<Record<string, string>> {
  const fetchImpl = options.fetch ?? fetch;
  const { host, path } = imageLocation(ref);
  const basic = options.credentials ? Buffer.from(`${options.credentials.user}:${options.credentials.token}`).toString('base64') : undefined;
  const manifestAt = (d: string) => byDigest(`${base(host)}/v2/${path}/manifests/${d}`, d, ACCEPT, fetchImpl, basic);
  type Manifest = { mediaType?: string; manifests?: Array<{ digest: string; platform?: { os?: string; architecture?: string } }>; config?: { digest: string } };
  let manifest = JSON.parse((await manifestAt(digest)).toString('utf8')) as Manifest;
  if (manifest.manifests) {
    const linux = manifest.manifests.filter((m) => m.platform?.os === 'linux');
    const arch = ociArch(options.arch ?? process.arch);
    const chosen = linux.find((m) => m.platform?.architecture === arch) ?? linux[0];
    if (!chosen) throw new Error(`${ref} has no image for Linux`);
    manifest = JSON.parse((await manifestAt(chosen.digest)).toString('utf8')) as Manifest;
  }
  if (!manifest.config?.digest) throw new Error(`${ref}@${digest} has no config`);
  const config = JSON.parse((await byDigest(`${base(host)}/v2/${path}/blobs/${manifest.config.digest}`, manifest.config.digest, '*/*', fetchImpl, basic)).toString('utf8')) as { config?: { Labels?: Record<string, string> | null } };
  return config.config?.Labels ?? {};
}
