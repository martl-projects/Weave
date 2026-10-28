import { createHash } from 'node:crypto';
import { copyFileSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseManifest, type AppManifest, type Json } from '@weave/core';
import type { WeaveNode } from '../../src/index.ts';
import { digestOf } from '../../src/shipped.ts';
import { buildComponent } from './components.ts';

/*
 * Releases for tests that need one, not how it's published: a maintainer publishes it as GitHub releases would (its
 * files fingerprinted), GitHub serves its files on this computer, and each node's fetcher (github-checkout, the one
 * Weave ships) gets an open one directly from there.
 */

export interface ReleaseFile {
  name: string;
  bytes: Buffer;
}

/** Publish a release as its project's maintainer: the manifest with its files' fingerprints, open (direct) unless said. */
export async function publishRelease(node: WeaveNode, input: { project: string; repo: string; tag: string; manifest: Record<string, unknown>; files?: Record<string, ReleaseFile>; access?: 'grant' | 'direct' }): Promise<AppManifest> {
  const assets = Object.fromEntries(Object.entries(input.files ?? {}).map(([platform, f]) => [platform, { file: f.name, sha256: createHash('sha256').update(f.bytes).digest('hex'), size: f.bytes.length }]));
  const install = { ...((input.manifest.install as Record<string, unknown> | undefined) ?? {}), github: input.repo, tag: input.tag, ...(Object.keys(assets).length ? { assets, access: input.access ?? 'direct' } : {}) };
  const manifest = parseManifest({ ...input.manifest, install });
  await node.publish({ kind: 'weave.app', body: manifest as unknown as Json, space: input.project });
  return manifest;
}

/** GitHub's public releases, as a server on this computer: the API (api.github.com) and its file store. */
export class PublicGitHub {
  #files = new Map<number, ReleaseFile & { repo: string; tag: string }>();
  #next = 1;
  /** Files handed out, by name. */
  delivered: string[] = [];
  server?: Server;

  add(repo: string, tag: string, ...files: ReleaseFile[]): this {
    for (const f of files) this.#files.set(this.#next++, { ...f, repo, tag });
    return this;
  }

  async serve(): Promise<number> {
    this.server = createServer((req, res) => {
      const url = new URL(req.url ?? '/', 'http://github');
      const json = (status: number, body: unknown) => res.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
      const file = url.pathname.match(/^\/files\/(\d+)$/);
      if (file) {
        const found = this.#files.get(Number(file[1]));
        if (!found) return json(404, { message: 'Not Found' });
        this.delivered.push(found.name);
        return res.writeHead(200, { 'content-length': String(found.bytes.length) }).end(found.bytes);
      }
      const tagged = url.pathname.match(/^\/repos\/([^/]+\/[^/]+)\/releases\/tags\/(.+)$/);
      if (tagged) {
        const assets = [...this.#files].filter(([, f]) => f.repo === tagged[1] && f.tag === decodeURIComponent(tagged[2])).map(([id, f]) => ({ id, name: f.name, size: f.bytes.length }));
        return assets.length ? json(200, { tag_name: decodeURIComponent(tagged[2]), assets }) : json(404, { message: 'Not Found' });
      }
      const asset = url.pathname.match(/^\/repos\/[^/]+\/[^/]+\/releases\/assets\/(\d+)$/);
      if (asset && this.#files.has(Number(asset[1]))) return res.writeHead(302, { location: `https://objects.githubusercontent.com/files/${asset[1]}` }).end();
      json(404, { message: 'Not Found' });
    });
    await new Promise<void>((resolve) => this.server!.listen(0, '127.0.0.1', resolve));
    return (this.server.address() as { port: number }).port;
  }

  close(): void {
    this.server?.close();
  }
}

let checkout: string | undefined;

/** The fetcher Weave ships, built once: a folder of shipped services with it (and what else is listed there). */
export async function shippedCheckout(): Promise<string> {
  if (checkout) return checkout;
  const source = join(import.meta.dirname, '..', '..', '..', 'shipped', 'github-checkout');
  const component = await buildComponent(join(source, 'src', 'service.js'), 'fetcher', { http: true });
  const dir = mkdtempSync(join(tmpdir(), 'weave-shipped-checkout-'));
  copyFileSync(component, join(dir, 'github-checkout.wasm'));
  writeFileSync(join(dir, 'shipped.json'), JSON.stringify({ 'github-checkout': { component: 'github-checkout.wasm', digest: digestOf(component), manifest: JSON.parse(readFileSync(join(source, 'weave.app.json'), 'utf8')) } }));
  checkout = dir;
  return dir;
}

/** Let a node fetch open releases from this GitHub: its fetcher added for all its projects, GitHub on this computer. */
export async function fetchesFrom(node: WeaveNode, port: number): Promise<void> {
  node.wasmSetup.shippedDir = await shippedCheckout();
  node.wasmSetup.testHosts = { ...node.wasmSetup.testHosts, 'api.github.com': port, 'objects.githubusercontent.com': port };
  await node.addFetcher({ shipped: 'github-checkout', projects: 'all' });
}
