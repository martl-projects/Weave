import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import { safePath, untar } from './untar.ts';

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

type RegistryOptions = { fetch?: Fetch; credentials?: { user: string; token: string }; arch?: string };
type ImageManifest = { mediaType?: string; manifests?: Array<{ digest: string; platform?: { os?: string; architecture?: string } }>; config?: { digest: string }; layers?: Array<{ digest: string; mediaType?: string; size?: number; annotations?: Record<string, string> }> };

/**
 * The image at a digest, as Weave runs it: from an index, its WebAssembly one (wasi/wasm) when it has one, else the
 * one for Linux on this machine's architecture (or its first Linux one). Every step checked against its digest.
 */
async function imageAt(ref: string, digest: string, options: RegistryOptions): Promise<{ manifest: ImageManifest; blob(digest: string): Promise<Buffer>; wasm: boolean }> {
  const fetchImpl = options.fetch ?? fetch;
  const { host, path } = imageLocation(ref);
  const basic = options.credentials ? Buffer.from(`${options.credentials.user}:${options.credentials.token}`).toString('base64') : undefined;
  const manifestAt = async (d: string) => JSON.parse((await byDigest(`${base(host)}/v2/${path}/manifests/${d}`, d, ACCEPT, fetchImpl, basic)).toString('utf8')) as ImageManifest;
  let manifest = await manifestAt(digest);
  let wasm = false;
  if (manifest.manifests) {
    const wasi = manifest.manifests.find((m) => m.platform?.os === 'wasi' && m.platform.architecture === 'wasm');
    const linux = manifest.manifests.filter((m) => m.platform?.os === 'linux');
    const arch = ociArch(options.arch ?? process.arch);
    const chosen = wasi ?? linux.find((m) => m.platform?.architecture === arch) ?? linux[0];
    if (!chosen) throw new Error(`${ref} has no image for Linux or WebAssembly`);
    wasm = !!wasi;
    manifest = await manifestAt(chosen.digest);
  }
  return { manifest, wasm, blob: (d) => byDigest(`${base(host)}/v2/${path}/blobs/${d}`, d, '*/*', fetchImpl, basic) };
}

/** The labels of an image's config, at its digest (see imageAt): as pinned as the image. */
export async function imageLabels(ref: string, digest: string, options: RegistryOptions = {}): Promise<Record<string, string>> {
  const { manifest, blob } = await imageAt(ref, digest, options);
  if (!manifest.config?.digest) throw new Error(`${ref}@${digest} has no config`);
  const config = JSON.parse((await blob(manifest.config.digest)).toString('utf8')) as { config?: { Labels?: Record<string, string> | null } };
  return config.config?.Labels ?? {};
}

/**
 * The files of an image, at its digest, unpacked into `into` without Docker: what a WebAssembly service's image holds
 * (its component, its website's files). Each layer is checked against its digest and unpacked strictly (see untar);
 * a layer that is a bare WebAssembly module (the OCI artifact way) is kept under its title, or service.wasm.
 */
export async function pullImage(ref: string, digest: string, into: string, options: RegistryOptions & { limit?: number } = {}): Promise<void> {
  const { manifest, blob } = await imageAt(ref, digest, options);
  const limit = options.limit ?? 200 * 1024 * 1024;
  let written = 0;
  mkdirSync(into, { recursive: true });
  for (const layer of manifest.layers ?? []) {
    if ((layer.size ?? 0) > limit) throw new Error(`a layer of ${ref} is larger than ${Math.round(limit / 1024 / 1024)} MB`);
    let bytes: Uint8Array = await blob(layer.digest);
    const type = layer.mediaType ?? '';
    if (type.endsWith('+wasm') || type === 'application/wasm') {
      written += bytes.length;
      if (written > limit) throw new Error(`${ref} holds more than ${Math.round(limit / 1024 / 1024)} MB`);
      writeFileSync(join(into, safePath(layer.annotations?.['org.opencontainers.image.title'] ?? '') ?? 'service.wasm'), bytes);
      continue;
    }
    if (type.includes('gzip') || (bytes[0] === 0x1f && bytes[1] === 0x8b)) bytes = gunzipSync(bytes, { maxOutputLength: limit });
    written = untar(bytes, into, limit, written);
  }
}
