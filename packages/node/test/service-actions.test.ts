import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { contractWords, parseContract, tightens } from '@weave/core';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * Actions: what a service's contract says people may ask it to do, each with who may. The node that runs it checks
 * the asker's role before the service sees a request, and answers a refusal itself; a project tightens who may, never
 * widens it.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-service-actions-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

const CONTRACT = {
  reads: 'addressed',
  writes: [],
  actions: [
    { name: 'hello', label: 'Say hello', who: 'members' },
    { name: 'wipe', label: 'Wipe everything', who: 'maintainers', input: [{ name: 'reason', label: 'Why' }] },
  ],
  version: '1.0',
} as const;

let component: string;
beforeAll(async () => {
  component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-bot.js'), 'service');
}, 180_000);

describe('a contract’s actions', () => {
  it('say who may, and a project may only make that narrower', () => {
    const contract = parseContract(CONTRACT)!;
    expect(contract.actions?.map((a) => [a.name, a.who])).toEqual([['hello', 'members'], ['wipe', 'maintainers']]);
    expect(contractWords(contract)).toContain('members can say hello, maintainers can wipe everything');
    expect(parseContract({ ...CONTRACT, reads: 'nothing' })?.actions).toBeUndefined();
    expect(tightens('members', 'maintainers')).toBe(true);
    expect(tightens('members', { board: 'tasks' })).toBe(true);
    expect(tightens('maintainers', 'members')).toBe(false);
    expect(tightens('maintainers', 'owner')).toBe(true);
    expect(tightens({ board: 'tasks' }, 'members')).toBe(false);
  });
});

describe('a service’s actions', { timeout: 120_000 }, () => {
  it('reach it only from people who may use them', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      const bot = await martl.addService({ name: 'bot', contract: CONTRACT as never, spaces: ['Weave'], wasm: component });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      sync([martl, lena]);
      const answers = async () => {
        sync([martl, lena]);
        return Object.fromEntries((await lena.serviceRequests({ space: 'Weave', service: bot.did })).map((r) => [r.text, r.results[0]]));
      };

      // What Lena may do there: say hello, not wipe.
      expect((await lena.serviceActions({ space: 'Weave', service: bot.did })).map((a) => [a.name, a.mine])).toEqual([['hello', true], ['wipe', false]]);
      await expect(lena.askService({ space: 'Weave', service: bot.did, text: 'wipe it', action: 'wipe' })).rejects.toThrow(/only maintainers can wipe everything in Weave/);

      // Asked anyway, around her app's check: Weave answers no, and the service never sees it.
      await lena.publish({ kind: 'weave.service.request', body: { to: bot.did, text: 'sneaky wipe', action: 'wipe' }, space: 'Weave' });
      await lena.askService({ space: 'Weave', service: bot.did, text: 'hi there', action: 'hello' });
      sync([martl, lena]);
      await vi.waitFor(async () => {
        const got = await answers();
        expect(got['sneaky wipe']?.error).toMatch(/only maintainers can wipe everything/);
        expect(got['hi there']?.text).toMatch(/^hi from bot \(#1\): hi there$/);
      }, { timeout: 30_000, interval: 200 });
      expect(readFileSync(join(martl.home.dir, 'services', 'bot', 'data', 'count'), 'utf8')).toBe('1');

      // martl may.
      await martl.askService({ space: 'Weave', service: bot.did, text: 'wipe, really', data: { reason: 'tests' }, action: 'wipe' });
      await vi.waitFor(async () => expect((await answers())['wipe, really']?.text).toMatch(/from bot \(#2\)/), { timeout: 30_000, interval: 200 });

      // The project makes hello maintainers only: Lena's hello goes no further. Wider than the contract: refused.
      await expect(lena.setServicePolicy({ space: 'Weave', service: bot.did, action: 'hello', who: 'maintainers' })).rejects.toThrow(/only the maintainers/);
      await expect(martl.setServicePolicy({ space: 'Weave', service: bot.did, action: 'wipe', who: 'members' })).rejects.toThrow(/narrower, not wider/);
      const after = await martl.setServicePolicy({ space: 'Weave', service: bot.did, action: 'hello', who: 'maintainers' });
      expect(after.find((a) => a.name === 'hello')).toMatchObject({ who: 'maintainers', declared: 'members', mine: true });
      sync([martl, lena]);
      expect((await lena.serviceActions({ space: 'Weave', service: bot.did })).find((a) => a.name === 'hello')?.mine).toBe(false);
      await lena.publish({ kind: 'weave.service.request', body: { to: bot.did, text: 'hello again', action: 'hello' }, space: 'Weave' });
      sync([martl, lena]);
      await vi.waitFor(async () => expect((await answers())['hello again']?.error).toMatch(/only maintainers can say hello/), { timeout: 30_000, interval: 200 });
    } finally {
      await martl.removeService('bot').catch(() => {});
      await api.close();
    }
  });
});
