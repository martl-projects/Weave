import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { createIdentity } from '@weave/core';
import { StorageClient } from '@weave/net';
import { PlanStore, StorageNode, storageServer, type StorageNetwork } from '../src/index.ts';

/*
 * Onboarding links on a storage node (idea bZFDCQNT): a planner puts a sealed plan under a short code, anyone with the
 * code gets it, a use is taken only with the key's check (and brings an account invitation when asked), the creator
 * lists and revokes, and the preview is all that's open. Over a real WebSocket and HTTP.
 */

const dirs: string[] = [];
const servers: Server[] = [];
const nodes: StorageNode[] = [];
afterEach(async () => {
  for (const server of servers.splice(0)) {
    server.closeAllConnections();
    server.close();
  }
  for (const node of nodes.splice(0)) await node.close();
});
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 })));

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

async function start(web?: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-plans-'));
  dirs.push(dir);
  const network = (): StorageNetwork => ({ join: async () => {}, leave: async () => {}, announce: () => {}, destroy: async () => {} });
  const node = await StorageNode.open({ dir, network });
  nodes.push(node);
  const server = storageServer(node, { origins: ['https://web.example'], ...(web ? { web } : {}) });
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `127.0.0.1:${(server.address() as AddressInfo).port}`;
  const connect = async (origin?: string) => {
    const ws = new WebSocket(`ws://${base}/storage`, origin ? ({ headers: { origin } } as unknown as string[]) : undefined);
    await new Promise<void>((resolve, reject) => {
      ws.addEventListener('open', () => resolve());
      ws.addEventListener('error', () => reject(new Error('refused')));
    });
    return StorageClient.connect({
      send: (text) => ws.send(text),
      close: () => ws.close(),
      onMessage: (handle) => ws.addEventListener('message', (e) => handle(String(e.data))),
      onClose: (handle) => ws.addEventListener('close', () => handle()),
    });
  };
  return { node, dir, connect, http: `http://${base}` };
}

describe('onboarding links on a storage node', { timeout: 60_000 }, () => {
  it('lets only planners the operator named put plans, as themselves', async () => {
    const { dir, connect } = await start();
    const martl = createIdentity();
    await expect((await connect()).putPlan(martl, { sealed: 'x', check: 'c' })).rejects.toThrow(/operator decides/);
    PlanStore.allowIn(dir, martl.did);
    expect(PlanStore.plannersIn(dir)).toEqual([martl.did]);
    const code = await (await connect()).putPlan(martl, { sealed: 'sealed-plan', check: 'check' });
    expect(code).toMatch(/^[A-Za-z0-9]{8}$/);
    // Someone else's key can't speak for martl, and an account's signin proof isn't a planner's.
    PlanStore.allowIn(dir, martl.did, false);
    await expect((await connect()).putPlan(martl, { sealed: 'x', check: 'c' })).rejects.toThrow(/operator decides/);
  });

  it('gives the sealed plan to whoever has the code, takes a use only with the check, and hands out an account invitation', async () => {
    const { node, dir, connect } = await start();
    const martl = createIdentity();
    PlanStore.allowIn(dir, martl.did);
    const code = await (await connect()).putPlan(martl, { sealed: 'sealed-plan', check: 'the-check', uses: 2, preview: { title: 'Pferderennen', text: 'martl invites you to play' } });

    const friend = await connect();
    expect(await friend.getPlan(code)).toEqual({ sealed: 'sealed-plan', by: martl.did });
    await expect(friend.getPlan('AAAAAAAA')).rejects.toThrow('no longer works');
    // Without the key's check, nothing is used up.
    await expect(friend.takePlan(code, 'guessed', true)).rejects.toThrow('not this link');
    const { invite } = await friend.takePlan(code, 'the-check', true);
    expect(invite).toBeTruthy();
    // The invitation makes one account, once.
    await friend.register(createIdentity(), invite!);
    await expect((await connect()).register(createIdentity(), invite!)).rejects.toThrow('invitation is not valid');
    // Someone who has an account takes a use without one.
    expect(await (await connect()).takePlan(code, 'the-check', false)).toEqual({});
    // Used up: the plan is gone for everyone.
    await expect((await connect()).getPlan(code)).rejects.toThrow('no longer works');
    await expect((await connect()).takePlan(code, 'the-check', true)).rejects.toThrow('no longer works');
    expect((await (await connect()).listPlans(martl))[0]).toMatchObject({ code, uses: 2, used: 2, preview: { title: 'Pferderennen' } });
    expect(node.plans.preview(code)).toEqual({ live: false });
  });

  it('lets the creator list and revoke their links, and nobody else', async () => {
    const { dir, connect } = await start();
    const [martl, lena] = [createIdentity(), createIdentity()];
    PlanStore.allowIn(dir, martl.did);
    PlanStore.allowIn(dir, lena.did);
    const code = await (await connect()).putPlan(martl, { sealed: 'p', check: 'c', expires: new Date(Date.now() + 86_400_000).toISOString() });
    expect(await (await connect()).listPlans(lena)).toEqual([]);
    await expect((await connect()).revokePlan(lena, code)).rejects.toThrow('no such link of yours');
    await (await connect()).revokePlan(martl, code);
    await expect((await connect()).getPlan(code)).rejects.toThrow('no longer works');
    expect((await (await connect()).listPlans(martl))[0]).toMatchObject({ code, revoked: true, used: 0 });
    // An expired one stops too.
    const old = await (await connect()).putPlan(martl, { sealed: 'p', check: 'c', expires: new Date(Date.now() - 1000).toISOString() });
    await expect((await connect()).getPlan(old)).rejects.toThrow('no longer works');
  });

  it('refuses a picture that is not a small PNG, and plans too large', async () => {
    const { dir, connect } = await start();
    const martl = createIdentity();
    PlanStore.allowIn(dir, martl.did);
    await expect((await connect()).putPlan(martl, { sealed: 'p', check: 'c', preview: { title: 'T' }, image: Buffer.from('GIF89a').toString('base64') })).rejects.toThrow(/PNG/);
    await expect((await connect()).putPlan(martl, { sealed: 'p', check: 'c', preview: { title: 'T' }, image: Buffer.concat([PNG, Buffer.alloc(301 * 1024)]).toString('base64') })).rejects.toThrow(/PNG/);
    await expect((await connect()).putPlan(martl, { sealed: 'x'.repeat(65 * 1024), check: 'c' })).rejects.toThrow(/not a sealed plan/);
    await expect((await connect()).putPlan(martl, { sealed: 'p', check: 'c', uses: 0 })).rejects.toThrow(/whole number/);
  });

  it('serves the preview and its picture openly, counting no use, and says when a link no longer works', async () => {
    const web = mkdtempSync(join(tmpdir(), 'weave-plans-web-'));
    dirs.push(web);
    mkdirSync(web, { recursive: true });
    writeFileSync(join(web, 'index.html'), '<!doctype html><html><head><title>Weave</title></head><body></body></html>');
    const { dir, connect, http } = await start(web);
    const martl = createIdentity();
    PlanStore.allowIn(dir, martl.did);
    const code = await (await connect()).putPlan(martl, { sealed: 'p', check: 'c', uses: 1, preview: { title: 'Pferderennen <3', text: 'martl invites you "to play"' }, image: PNG.toString('base64') });

    expect(await (await fetch(`${http}/preview/${code}`)).json()).toEqual({ live: true, preview: { title: 'Pferderennen <3', text: 'martl invites you "to play"' }, image: true });
    const picture = await fetch(`${http}/preview/${code}.png`);
    expect(picture.headers.get('content-type')).toBe('image/png');
    expect(Buffer.from(await picture.arrayBuffer())).toEqual(PNG);
    const page = await (await fetch(`${http}/j/${code}`)).text();
    expect(page).toContain('<meta property="og:title" content="Pferderennen &lt;3">');
    expect(page).toContain('<meta property="og:description" content="martl invites you &quot;to play&quot;">');
    expect(page).toContain(`/preview/${code}.png">`);
    // Fetching the preview again and again used nothing up.
    expect((await (await connect()).listPlans(martl))[0].used).toBe(0);

    await (await connect()).revokePlan(martl, code);
    expect(await (await fetch(`${http}/preview/${code}`)).json()).toEqual({ live: false });
    expect((await fetch(`${http}/preview/${code}.png`)).status).toBe(404);
    expect(await (await fetch(`${http}/j/${code}`)).text()).toContain('This invite link no longer works');
    expect((await fetch(`${http}/preview/nothing!`)).status).toBe(404);
  });

  it('lets a program without an origin connect, and turns pages from elsewhere away', async () => {
    const { connect } = await start();
    await expect(connect()).resolves.toBeTruthy();
    await expect(connect('https://web.example')).resolves.toBeTruthy();
    await expect(connect('https://evil.example')).rejects.toThrow('refused');
  });
});
