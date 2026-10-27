import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { WASM_LIMITS } from '../src/runtime.ts';
import type { ComponentizeOptions } from '@bytecodealliance/componentize-js';

/*
 * WebAssembly services (W1): a service's own code as a component that Weave runs itself, in a worker of its own,
 * with nothing installed. It reads and acts only through its gate (so only as its contract allows), keeps what it
 * keeps in its /data folder, picks up what came while it was off, and can't hang the node.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-wasm-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

/** The test bot as a component: built once per machine (it takes a few seconds), kept by its source's hash. */
let component: string;
beforeAll(async () => {
  const source = join(import.meta.dirname, 'helpers', 'wasm-bot.js');
  const wit = join(import.meta.dirname, '..', '..', 'sdk', 'wit', 'service.wit');
  const hash = createHash('sha256').update(readFileSync(source)).update(readFileSync(wit)).digest('hex').slice(0, 16);
  const cache = join(tmpdir(), 'weave-test-components');
  component = join(cache, `wasm-bot-${hash}.wasm`);
  if (existsSync(component)) return;
  const { componentize } = await import('@bytecodealliance/componentize-js');
  // The WIT as text (an option its typings leave out): its own file access can't open absolute Windows paths.
  const options = { sourcePath: source, witWorld: readFileSync(wit, 'utf8'), worldName: 'service', disableFeatures: ['http', 'fetch-event'] };
  const built = await componentize(options as ComponentizeOptions);
  mkdirSync(cache, { recursive: true });
  writeFileSync(component, built.component);
}, 180_000);

describe('WebAssembly services', { timeout: 120_000 }, () => {
  it('runs inside Weave: answers within its contract, keeps its data, catches up, and cannot hang the node', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);
    await expect(martl.addService({ name: 'bad', contract: { reads: 'addressed', writes: [], version: '1.0' }, wasm: join(tmpdir(), 'nothing-here.wasm') })).rejects.toThrow(/isn't a WebAssembly component/);
    await expect(martl.addService({ name: 'bad', contract: { reads: 'addressed', writes: [], version: '1.0' }, wasm: component, command: ['node', 'x.js'] })).rejects.toThrow(/one of them/);

    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      const bot = await martl.addService({ name: 'bot', contract: { reads: 'addressed', writes: [], version: '1.0' }, spaces: ['Weave'], wasm: component, settings: { GREETING: 'hello' } });
      expect(bot).toMatchObject({ name: 'bot', wasm: component });
      const answers = async () => {
        sync([martl, lena]);
        return Object.fromEntries((await lena.serviceRequests({ space: 'Weave', service: 'martl/bot' })).map((r) => [r.text, r.results.map((x) => x.text)[0]]));
      };
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      sync([martl, lena]);

      // Lena asks: the component answers as the service, with its setting and a count it keeps.
      await lena.askService({ space: 'Weave', service: 'martl/bot', text: 'are you there?' });
      await vi.waitFor(async () => expect((await answers())['are you there?']).toBe('hello from bot (#1): are you there?'), { timeout: 30_000, interval: 200 });
      expect(readFileSync(join(martl.home.dir, 'services', 'bot', 'data', 'count'), 'utf8')).toBe('1');

      // Only within its contract: a post is refused by the host, and it can tell.
      await lena.askService({ space: 'Weave', service: 'martl/bot', text: 'post' });
      await vi.waitFor(async () => expect((await answers()).post).toMatch(/^refused: .*may not sign weave\.post/), { timeout: 30_000, interval: 200 });

      // Stopped, it misses nothing: started again, it answers what came meanwhile, counting on.
      await martl.setService({ name: 'bot', enabled: false });
      await lena.askService({ space: 'Weave', service: 'martl/bot', text: 'while you were off' });
      sync([martl, lena]);
      await martl.setService({ name: 'bot', enabled: true });
      await vi.waitFor(async () => expect((await answers())['while you were off']).toBe('hello from bot (#2): while you were off'), { timeout: 30_000, interval: 200 });

      // It can't hang the node: an event that takes too long ends its worker, is given up, and it goes on.
      const limit = WASM_LIMITS.eventMs;
      WASM_LIMITS.eventMs = 2000;
      try {
        await lena.askService({ space: 'Weave', service: 'martl/bot', text: 'hang' });
        await lena.askService({ space: 'Weave', service: 'martl/bot', text: 'after' });
        await vi.waitFor(async () => expect((await answers()).after).toBe('hello from bot (#3): after'), { timeout: 60_000, interval: 300 });
        expect((await answers()).hang).toBeUndefined();
        expect(readFileSync(join(martl.home.dir, 'services', 'bot', 'service.log'), 'utf8')).toMatch(/took longer than 2s on an event: stopped/);
      } finally {
        WASM_LIMITS.eventMs = limit;
      }
    } finally {
      await martl.removeService('bot').catch(() => {});
      await api.close();
    }
  });
});
