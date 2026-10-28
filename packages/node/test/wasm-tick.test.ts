import { generateKeyPairSync, verify } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * What a WebAssembly service does on its own: ticks it asks for (work nobody asked for, like keeping something in
 * step), and signatures with a key among its settings that never reaches it (a GitHub App's JWT, say).
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-wasm-tick-'));
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
  component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-ticker.js'), 'service');
}, 180_000);

describe('a WebAssembly service on its own', { timeout: 120_000 }, () => {
  it('ticks when it asks to, and signs with a key it never sees', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({ name: 'ticker', contract: { reads: 'addressed', writes: [], version: '1.0' }, spaces: ['Weave'], wasm: component, asks: [{ name: 'KEY', label: 'Signing key', signing: true }], settings: { KEY: pem } });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      sync([martl, lena]);
      const answerTo = async (text: string) => {
        await lena.askService({ space: 'Weave', service: 'martl/ticker', text });
        let got: string | undefined;
        await vi.waitFor(
          async () => {
            sync([martl, lena]);
            got = (await lena.serviceRequests({ space: 'Weave', service: 'martl/ticker' })).find((r) => r.text === text)?.results[0]?.text;
            expect(got).toBeDefined();
          },
          { timeout: 30_000, interval: 200 },
        );
        return got!;
      };

      // Ticks: every second once it asks, one at a time, until it stops them.
      expect(await answerTo('tick')).toBe('ticking');
      const ticks = join(martl.home.dir, 'services', 'ticker', 'data', 'ticks');
      await vi.waitFor(() => expect(existsSync(ticks) && readFileSync(ticks, 'utf8')).toBe('3'), { timeout: 20_000, interval: 200 });
      await new Promise((r) => setTimeout(r, 2500));
      expect(readFileSync(ticks, 'utf8')).toBe('3');

      // Its key: it signs with it, but setting() never hands it over.
      expect(await answerTo('peek')).toBe('(none)');
      const signature = Buffer.from(await answerTo('sign RS256'), 'base64');
      expect(verify('sha256', Buffer.from('hello'), publicKey, signature)).toBe(true);
      expect(await answerTo('sign PS512')).toMatch(/^failed: .*RS256, ES256 or HS256/);
    } finally {
      await martl.removeService('ticker').catch(() => {});
      await api.close();
    }
  });
});
