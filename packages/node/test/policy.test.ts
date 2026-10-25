import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { signEventV2 } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { OidcStub, VaultStub } from './helpers/stubs.ts';

const dirs: string[] = [];
let oidc: OidcStub;
let vault: VaultStub;
beforeAll(async () => {
  oidc = await new OidcStub().start();
  vault = await new VaultStub(oidc).start();
});
afterAll(async () => {
  closeOpenStores();
  await vault.stop();
  await oidc.stop();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function dir(): string {
  const made = mkdtempSync(join(tmpdir(), 'weave-policy-'));
  dirs.push(made);
  return made;
}
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
};
const settle = () => new Promise((r) => setTimeout(r, 300));
const day = 24 * 3_600_000;

/** Acme's node, with Lena (an admin, in engineering) and Kofi enrolled and vouched for, and Bob, who isn't with Acme. */
async function company(key: string) {
  vault.createKey(key);
  const acme = WeaveNode.init('Acme', dir());
  acme.kmsCredentials = { token: vault.rootToken };
  await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key, jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
  await settle();
  const link = await acme.enrollLink();
  const lena = await WeaveNode.enroll(link, dir(), { idToken: oidc.token({ sub: 'lena@acme', groups: ['employees', 'weave-admins'] }), name: 'Lena' });
  const kofi = await WeaveNode.enroll(link, dir(), { idToken: oidc.token({ sub: 'kofi@acme', groups: ['employees'] }), name: 'Kofi' });
  const bob = WeaveNode.init('Bob', dir());
  const all = [acme, lena, kofi, bob];
  syncAll(all);
  for (const node of [lena, kofi]) await node.reconcile();
  await settle();
  syncAll(all);
  await acme.reconcile();
  syncAll(all);
  const round = async () => {
    syncAll(all);
    await acme.reconcile();
    syncAll(all);
    for (const node of [lena, kofi]) await node.reconcile();
    syncAll(all);
  };
  return { acme, lena, kofi, bob, all, round };
}

// Many sync and reconcile rounds against the HTTP stand-ins: slow on CI runners.
describe('company policy', { timeout: 120_000 }, () => {
  it('holds a company account to the policy even for what it backdates to before it', async () => {
    const { acme, kofi, bob, all, round } = await company('acme-backdate');
    await acme.companyAction({ action: 'settings', outside: true, directs: 'all', public: false, chats: false });
    syncAll(all);
    await round();
    // A modified client: Kofi's key signs a public post dated a year before the policy.
    const { event, body } = signEventV2(kofi.identity, undefined, { kind: 'weave.post', space: 'public', n: kofi.replica.number(kofi.identity.did) + 1, time: new Date(Date.now() - 365 * day).toISOString(), body: { text: 'old news, honest' } });
    const result = bob.replica.ingest({ e: event, ...(body !== undefined ? { b: body } : {}) });
    expect(result.status).not.toBe('accepted');
  });

  it('keeps company accounts to the company’s policy, on their own nodes and on everyone else’s', async () => {
    const { acme, lena, kofi, bob, all, round } = await company('acme-policy');
    const bobsGroup = await bob.createGroup('Bobs');
    const bobsInvite = await bob.invite(bobsGroup.id);
    // Before any policy, a company account goes where it likes: other people's groups, friends outside.
    await kofi.joinSpace(bobsInvite);
    for (const [a, b] of [[lena, bob], [bob, lena], [lena, kofi], [kofi, lena]] as const) await a.setEdge({ edge: 'follow', who: b.identity.author, on: true });
    syncAll(all);

    await acme.companyAction({ action: 'settings', outside: false, directs: 'company', public: false, chats: true });
    // Bob learns the policy; Kofi hasn't yet, so his node doesn't stop him, but Bob's does.
    sync(acme, bob);
    await kofi.setEdge({ edge: 'follow', who: bob.identity.author, on: true });
    sync(kofi, bob);
    expect((await bob.profile(kofi.identity.author)).followsMe).toBe(false);

    syncAll(all);
    expect((await lena.company())?.policy).toMatchObject({ outside: false, directs: 'company', public: false, chats: true });
    await expect(lena.createGroup('Side project')).rejects.toThrow(/stay in the company's spaces/);
    await expect(lena.joinSpace(await bob.invite(bobsGroup.id))).rejects.toThrow(/stay in the company's spaces/);
    await expect(kofi.say({ space: 'Bobs', text: 'still here?' })).rejects.toThrow(/stay in the company's spaces/);
    await expect(kofi.setEdge({ edge: 'follow', who: bob.identity.author, on: true })).rejects.toThrow(/don't post publicly/);
    await kofi.setEdge({ edge: 'follow', who: acme.identity.author, on: true });
    const withBob = await lena.openChat(bob.identity.author);
    await expect(lena.say({ space: withBob.id, text: 'hi Bob' })).rejects.toThrow(/only with colleagues/);
    const withKofi = await lena.openChat(kofi.identity.author);
    await expect(lena.say({ space: withKofi.id, text: 'hi Kofi' })).rejects.toThrow(/company chats/);
    // Leaving is always allowed.
    await kofi.leave('Bobs');

    // A company chat instead: the company makes it, keeps the two in it, under its keys.
    await lena.companyAction({ action: 'chat', with: 'Kofi' });
    await round();
    await round();
    expect((await kofi.spaces('group')).map((s) => s.name)).toContain('Lena & Kofi');
    await lena.say({ space: 'Lena & Kofi', text: 'hi Kofi' });
    syncAll(all);
    await kofi.unlockSpace('Lena & Kofi');
    expect((await kofi.messages('Lena & Kofi')).map((m) => m.text)).toEqual(['hi Kofi']);
    expect((await acme.company())?.chats).toEqual([expect.objectContaining({ name: 'Lena & Kofi', people: ['Lena', 'Kofi'] })]);
    // Bob isn't a colleague: no company chat with him.
    await lena.companyAction({ action: 'chat', with: bob.identity.author });
    await round();
    expect((await acme.company())?.requests.at(-1)).toMatchObject({ action: 'chat', done: true, error: expect.stringMatching(/colleagues/) });
    for (const node of all) await node.close();
  });

  it('holds company spaces to a minimum and a maximum, and audits deletions', async () => {
    const { acme, lena, kofi, all, round } = await company('acme-retention');
    await acme.companyAction({ action: 'space', kind: 'project', name: 'Roadmap' });
    await settle();
    await acme.companyAction({ action: 'map', group: 'employees', space: 'Roadmap' });
    await round();
    expect((await kofi.spaces('project')).map((s) => s.name)).toEqual(['Roadmap']);
    // Lena administers the company, so she maintains its projects. A rule from before the minimum:
    await lena.setBoardRule({ space: 'Roadmap', board: 'ideas', keepDays: 10 });
    const post = await kofi.submit({ space: 'Roadmap', board: 'ideas', title: 'Faster builds' });
    syncAll(all);

    await acme.companyAction({ action: 'settings', retention: { minDays: 30 } });
    syncAll(all);
    // Nothing goes sooner than the minimum: lifetimes, rules and shredding.
    const lifetime = (await lena.post(post.id)).lifetime as { until: string; floor?: string };
    expect(Date.parse(lifetime.until)).toBeGreaterThan(Date.now() + 29 * day);
    expect(lifetime.floor).toBeDefined();
    await expect(lena.setBoardRule({ space: 'Roadmap', board: 'ideas', keepDays: 7 })).rejects.toThrow(/at least 30 days/);
    await expect(acme.shred({ space: 'Roadmap', before: new Date().toISOString() })).rejects.toThrow(/at least 30 days/);
    await expect(acme.companyAction({ action: 'settings', retention: { maxDays: 7 } })).rejects.toThrow(/minimum is longer/);

    // Deleting only hides a post, and the audit shows who did it.
    await kofi.deletePost({ post: post.id });
    syncAll(all);
    expect((await acme.audit({ space: 'Roadmap' })).some((l) => l.kind === 'weave.post.delete' && l.byName === 'Kofi')).toBe(true);

    // A maximum: the company's node shreds what's older, chat included.
    await acme.companyAction({ action: 'settings', retention: { minDays: null, maxDays: 1 } });
    await lena.say({ space: 'Roadmap', text: 'from long ago' });
    syncAll(all);
    await acme.removeMember('Roadmap', 'Kofi'); // a new key: the old one has ended
    syncAll(all);
    acme.clock = () => Date.now() + 3 * day;
    await acme.reconcile(); // shreds
    await acme.reconcile(); // and, as every member does, lets the keys go
    syncAll(all);
    // (Three days on, Lena and Kofi haven't signed in again: the company has let them go. Its own copy is what's left.)
    expect((await acme.messages('Roadmap')).map((m) => m.text)).not.toContain('from long ago');
    expect((await acme.audit({ space: 'Roadmap' })).some((l) => l.kind === 'weave.space.shred')).toBe(true);
    for (const node of all) await node.close();
  });

  it('gives a project its own retention, and the rest keep the company’s', async () => {
    const { acme, lena, kofi, all, round } = await company('acme-own-retention');
    for (const name of ['Roadmap', 'Design']) await acme.companyAction({ action: 'space', kind: 'project', name });
    await settle();
    for (const space of ['Roadmap', 'Design']) await acme.companyAction({ action: 'map', group: 'employees', space });
    await round();
    const roadmap = (await acme.company())!.spaces.find((s) => s.name === 'Roadmap')!;

    // The company keeps things at least 30 days; Roadmap at most one day, with no minimum.
    await acme.companyAction({ action: 'settings', retention: { minDays: 30 } });
    await acme.companyAction({ action: 'settings', retention: { space: 'Roadmap', minDays: null, maxDays: 1 } });
    expect((await acme.company())!.retention).toEqual({ minDays: 30 });
    expect((await acme.company())!.spaceRetention).toEqual({ [roadmap.id]: { maxDays: 1 } });
    await expect(acme.companyAction({ action: 'settings', retention: { space: 'Design', minDays: 10, maxDays: 5 } })).rejects.toThrow(/minimum is longer/);
    syncAll(all);
    // Design keeps the company's minimum; Roadmap doesn't have one.
    await expect(acme.shred({ space: 'Design', before: new Date().toISOString() })).rejects.toThrow(/at least 30 days/);

    await lena.say({ space: 'Roadmap', text: 'roadmap long ago' });
    await lena.say({ space: 'Design', text: 'design long ago' });
    syncAll(all);
    for (const space of ['Roadmap', 'Design']) await acme.removeMember(space, 'Kofi'); // new keys: the old ones have ended
    syncAll(all);
    acme.clock = () => Date.now() + 3 * day;
    await acme.reconcile();
    await acme.reconcile();
    expect((await acme.messages('Roadmap')).map((m) => m.text)).not.toContain('roadmap long ago');
    expect((await acme.messages('Design')).map((m) => m.text)).toContain('design long ago');

    // Back to the company's.
    await acme.companyAction({ action: 'settings', retention: { space: 'Roadmap', minDays: null, maxDays: null } });
    expect((await acme.company())!.spaceRetention).toEqual({});
    for (const node of all) await node.close();
    void kofi;
  });
});
