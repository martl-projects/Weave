import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as cli from '@bytecodealliance/preview2-shim/cli';
import * as clocks from '@bytecodealliance/preview2-shim/clocks';
import * as filesystem from '@bytecodealliance/preview2-shim/filesystem';
import * as io from '@bytecodealliance/preview2-shim/io';
import * as random from '@bytecodealliance/preview2-shim/random';
import { describe, expect, it } from 'vitest';
import { buildComponent } from '../../../packages/node/test/helpers/components.ts';
import { framesFrom, lensFrameCsp, serviceCsp } from '../build.ts';
import { transpileComponent } from '../src/transpile.ts';
import { onRequestGet } from '../src/functions/lens-frame.ts';
import { frameHosts, lensFrameCspFor } from '../src/lensframecsp.ts';

/*
 * Lenses and widgets in Weave Web (docs/web-stage2.md, step 8): a release's pure component is transpiled where it runs
 * (transpile.ts, in its Worker), and its view is built in a sandboxed frame of its own (lens-frame.html). What a real
 * Chrome does with them is browser-check.ts's.
 */

const camel = (text: string) => text.replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
const packages: Record<string, Record<string, unknown>> = { cli, clocks, io, random, filesystem };
const refuse = () => {
  throw new Error('a service here calls nothing');
};
/** What service.ts hands a pure component: WASI's pieces, and nothing to call. */
const imports = new Proxy(
  {},
  {
    get(_, key) {
      const m = /^(wasi|weave):([a-z0-9-]+)\/([a-z0-9-]+)(@.*)?$/.exec(String(key));
      if (!m) return undefined;
      if (m[1] === 'weave' || m[2] === 'http') return new Proxy({}, { get: () => refuse });
      return packages[m[2]]?.[camel(m[3])];
    },
  },
);

describe('a release’s pure component in a page', { timeout: 180_000 }, () => {
  it('is transpiled from its bytes, and folds and acts', async () => {
    const component = readFileSync(await buildComponent(join(import.meta.dirname, '..', '..', '..', 'packages', 'node', 'test', 'helpers', 'wasm-widget-tally.js'), 'board'));
    const files = await transpileComponent(component);
    expect(files.has('component.js')).toBe(true);
    const glue = `data:text/javascript;base64,${Buffer.from(files.get('component.js')!).toString('base64')}`;
    const { instantiate } = (await import(glue)) as { instantiate(core: (file: string) => Promise<WebAssembly.Module>, imports: object): Promise<Record<string, (...args: unknown[]) => unknown>> };
    const run = await instantiate((file) => WebAssembly.compile(files.get(file)! as Uint8Array<ArrayBuffer>), imports);
    const state = JSON.parse(String(run.fold(JSON.stringify({ widget: 'w1', title: 'Lunch?', by: { did: 'did:key:z1' } }), JSON.stringify([{ id: 'w1', kind: 'weave.widget', body: {}, author: 'did:key:z1', time: 't' }, { id: 'v1', kind: 'tally.vote', body: { target: 'w1', choice: 'pasta' }, author: 'did:key:z2', authorName: 'Ola', time: 't' }]))));
    expect(state).toMatchObject({ widget: 'w1', first: 'weave.widget', votes: [{ by: 'Ola', choice: 'pasta' }] });
    expect(JSON.parse(String(run.act('vote', '{"choice":"pizza"}', '{}', '{}')))).toEqual([{ kind: 'tally.vote', body: { choice: 'pizza' } }]);
  });

  it("refuses what isn't a client service", async () => {
    // A mark service (Weave's badges): pure too, but another world.
    const service = readFileSync(await buildComponent(join(import.meta.dirname, '..', '..', '..', 'packages', 'shipped', 'badges', 'src', 'service.js'), 'marks', { bundle: true }));
    await expect(transpileComponent(service)).rejects.toThrow(/no fold and act/);
  });
});

describe('the frame a view is built in', () => {
  it('is sandboxed with scripts only, reaches nothing, and only the page frames it', () => {
    expect(lensFrameCsp).toMatch(/^sandbox allow-scripts;/);
    expect(lensFrameCsp).not.toMatch(/allow-same-origin/);
    expect(lensFrameCsp).toContain("connect-src 'none'");
    expect(lensFrameCsp).toContain("frame-ancestors 'self'");
    expect(framesFrom()).toBe("'self' https://*.weave-rooms.net");
    // The services' Worker may import what it transpiles, and reaches only what the page does.
    expect(serviceCsp('https://storage.example')).toBe("default-src 'none'; script-src 'self' 'wasm-unsafe-eval' blob:; connect-src 'self' https://storage.example wss://storage.example");
  });

  it('reaches the hosts in its address and no others, as a Pages Function serves it', async () => {
    expect(frameHosts(new URL('https://web.example/lens-frame?net=api.open-meteo.com,*.tile.openstreetmap.org'))).toEqual(['api.open-meteo.com', '*.tile.openstreetmap.org']);
    expect(frameHosts(new URL("https://web.example/lens-frame?net=x.example;script-src%20*,'self',localhost"))).toEqual([]);
    expect(lensFrameCspFor()).toBe(lensFrameCsp);
    const assets = { fetch: async () => new Response('<!doctype html>', { headers: { 'content-type': 'text/html' } }) };
    const answer = await onRequestGet({ request: new Request('https://web.example/lens-frame?net=api.open-meteo.com'), env: { ASSETS: assets } });
    const csp = answer.headers.get('content-security-policy')!;
    expect(csp).toContain('connect-src https://api.open-meteo.com;');
    expect(csp).toMatch(/^sandbox allow-scripts;/);
    expect(csp).toContain("frame-ancestors 'self'");
    const bare = await onRequestGet({ request: new Request('https://web.example/lens-frame'), env: { ASSETS: assets } });
    expect(bare.headers.get('content-security-policy')).toBe(lensFrameCsp);
  });

  it('is built from the view’s files with their blob: addresses (its own page, as served)', () => {
    const page = readFileSync(join(import.meta.dirname, '..', 'src', 'lens-frame.html'), 'utf8');
    expect(page).toContain("window.parent.postMessage({ weave: 'files', net: new URLSearchParams(location.search).get('net') || '' }, '*')");
    expect(page).toContain("parent.postMessage({ weave: 'loaded' }, '*')");
    expect(page).toContain('URL.createObjectURL');
  });
});
