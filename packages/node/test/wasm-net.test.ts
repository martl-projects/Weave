import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkManifest, contractWords, isNetHost, netAllows, parseContract } from '@weave/core';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { nearby } from '../src/runtime.ts';
import { buildComponent } from './helpers/components.ts';
import { serviceFromRelease } from './helpers/release.ts';

/*
 * A WebAssembly service reaching out: only over HTTPS, only to the hosts its contract names (net), never to this
 * computer or its networks, and whoever installs it reads those hosts in its contract.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-wasm-net-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

let component: string;
beforeAll(async () => {
  component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-net.js'), 'service', { http: true });
}, 180_000);

describe('net in a contract', () => {
  it('names hosts, not addresses, and says so in its words', () => {
    expect(['api.example.com', '*.example.com', 'API.Example.com'.toLowerCase()].every(isNetHost)).toBe(true);
    expect(['localhost', '127.0.0.1', '10.0.0.1', '[::1]', 'example', '*.', 'a..b', 'http://x.com', 'x.com:8080'].some(isNetHost)).toBe(false);
    const contract = parseContract({ reads: 'addressed', writes: [], net: ['API.example.com', 'localhost', '192.168.1.1', '*.github.com'], version: '1.0' })!;
    expect(contract.net).toEqual(['api.example.com', '*.github.com']);
    expect(contractWords(contract)).toContain('talks to api.example.com, *.github.com over HTTPS');
    expect(netAllows(contract.net, 'api.example.com')).toBe(true);
    expect(netAllows(contract.net, 'raw.github.com')).toBe(true);
    expect(netAllows(contract.net, 'github.com')).toBe(false);
    expect(netAllows(contract.net, 'evilgithub.com')).toBe(false);
    expect(netAllows(contract.net, 'other.example.com')).toBe(false);
    const checked = checkManifest({ app: 'reacher', name: 'Reacher', service: { reads: 'addressed', writes: [], net: ['api.example.com', '127.0.0.1'], version: '1.0' } });
    expect(checked.problems.join(' ')).toMatch(/"service\.net".*not "127\.0\.0\.1"/);
  });

  it('never reaches this computer or its networks', () => {
    for (const address of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.178.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::', 'fd00::1', 'fe80::1', '::ffff:127.0.0.1']) expect(nearby(address), address).toBe(true);
    for (const address of ['93.184.215.14', '140.82.112.3', '2606:4700::6810:84e5', '::ffff:93.184.215.14']) expect(nearby(address), address).toBe(false);
  });
});

describe('WebAssembly services reaching out', { timeout: 120_000 }, () => {
  it('reach the hosts their contract names, and nothing else', async () => {
    const server = createServer((req, res) => res.end(`pong ${req.url}`));
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);
    // The contract's host stands for the server here; other.example.test stands for one too, but isn't in it.
    const port = (server.address() as { port: number }).port;
    martl.wasmSetup.testHosts = { 'api.example.test': port, 'other.example.test': port };
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await serviceFromRelease(martl, { name: 'reacher', manifest: { app: 'reacher', name: 'Reacher', service: { reads: 'addressed', writes: [], net: ['api.example.test'], version: '1.0' } }, component, project: 'Weave', spaces: ['Weave'] });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      sync([martl, lena]);
      const answers = async () => {
        sync([martl, lena]);
        return Object.fromEntries((await lena.serviceRequests({ space: 'Weave', service: 'martl/reacher' })).map((r) => [r.text, r.results.map((x) => x.text)[0]]));
      };
      const ask = async (url: string) => {
        await lena.askService({ space: 'Weave', service: 'martl/reacher', text: url });
        sync([martl, lena]);
      };

      await ask('https://api.example.test/ping');
      await vi.waitFor(async () => expect((await answers())['https://api.example.test/ping']).toBe('200 pong /ping'), { timeout: 30_000, interval: 200 });

      // Not in its contract, not HTTPS, another port: refused, and its log says why.
      for (const url of ['https://other.example.test/x', 'http://api.example.test/x', 'https://api.example.test:8443/x']) await ask(url);
      await vi.waitFor(
        async () => {
          const got = await answers();
          for (const url of ['https://other.example.test/x', 'http://api.example.test/x', 'https://api.example.test:8443/x']) expect(got[url], url).toMatch(/^failed/);
        },
        { timeout: 30_000, interval: 200 },
      );
      const log = readFileSync(join(martl.home.dir, 'services', 'reacher', 'service.log'), 'utf8');
      expect(log).toMatch(/refused a request to other\.example\.test: other\.example\.test isn't among the hosts its contract names/);
      expect(log).toMatch(/refused a request to api\.example\.test: only HTTPS/);
      expect(log).toMatch(/refused a request to api\.example\.test:8443: only HTTPS, on its usual port/);
    } finally {
      await martl.removeService('reacher').catch(() => {});
      await api.close();
      server.close();
    }
  });
});
