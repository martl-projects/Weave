import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { KIND_KMS, sealFor } from '@weave/core';
import { WeaveNode, closeOpenStores, loadSpaces, signInNonce } from '../src/index.ts';
import { AzureStub, OidcStub, VaultStub } from './helpers/stubs.ts';

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

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-managed-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const minute = 60_000;
const texts = async (node: WeaveNode) => (await node.feed({ space: 'Acme', kinds: ['weave.msg'] })).map((i) => (i.body as { text: string }).text).sort();

/** A company project: Martin owns it with an operator token; Lena and Kofi sign in with their company accounts. */
async function company(key: string, graceHours: number) {
  vault.createKey(key);
  const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
  martin.kmsCredentials = { token: vault.rootToken };
  lena.kmsCredentials = { idToken: () => oidc.token({ sub: `lena-${key}`, groups: ['employees'] }) };
  kofi.kmsCredentials = { idToken: () => oidc.token({ sub: `kofi-${key}`, groups: ['employees'] }) };
  const all = [martin, lena, kofi];
  const syncAll = () => {
    for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
  };
  await martin.createProject({ name: 'Acme' });
  for (const node of [lena, kofi]) await node.joinSpace(await martin.invite('Acme'));
  syncAll();
  await martin.say({ space: 'Acme', text: 'before it was managed' });
  await martin.manageSpace({ space: 'Acme', provider: { kind: 'vault', address: vault.address, key, jwt: { role: 'employees' } }, graceHours });
  // The company half is wrapped by Vault and published in the background.
  await new Promise((r) => setTimeout(r, 300));
  syncAll();
  for (const node of all) await node.reconcile();
  await martin.say({ space: 'Acme', text: 'the plan' });
  syncAll();
  return { martin, lena, kofi, all, syncAll };
}

// Many sync and reconcile rounds against the HTTP stand-ins: slow on CI runners.
describe('managed spaces', { timeout: 120_000 }, () => {
  it('needs the company key service to read, and stops when it refuses: offboarding and shredding', async () => {
    const { martin, lena, kofi, all, syncAll } = await company('acme', 0);
    expect((await martin.spaces('project'))[0].managed).toMatchObject({ unlocked: true, ttlMinutes: 15, graceHours: 0 });
    for (const node of all) expect(await texts(node)).toEqual(['before it was managed', 'the plan']);

    // Kofi leaves the company: Vault refuses him; once his unlocked key's 15 minutes are up, he reads nothing managed.
    vault.disable('kofi-acme');
    kofi.clock = () => Date.now() + 20 * minute;
    await kofi.reconcile();
    expect(await texts(kofi)).toEqual(['before it was managed']);
    expect((await kofi.spaces('project'))[0].managed?.problem).toMatch(/refused/);
    expect(await texts(lena)).toEqual(['before it was managed', 'the plan']);

    // The owner destroys the company key: every copy of what it covered is unreadable, Martin's too.
    await martin.destroyCompanyKey('Acme');
    lena.clock = () => Date.now() + 20 * minute;
    await lena.reconcile();
    expect(await texts(lena)).toEqual(['before it was managed']);
    expect(await texts(martin)).toEqual(['before it was managed']);
    void syncAll;
    for (const node of all) await node.close();
  });

  it('keeps working offline within the grace, and not after', async () => {
    const { lena, all } = await company('acme-grace', 8);
    expect(await texts(lena)).toEqual(['before it was managed', 'the plan']);
    // Vault out of reach (wrong address), 20 minutes on: the memory TTL is over, the grace on disk isn't.
    lena.kmsCredentials = { token: 'nothing' };
    lena.clock = () => Date.now() + 20 * minute;
    await lena.reconcile();
    expect(await texts(lena)).toEqual(['before it was managed', 'the plan']);
    lena.clock = () => Date.now() + 9 * 60 * minute;
    await lena.reconcile();
    expect(await texts(lena)).toEqual(['before it was managed']);
    for (const node of all) await node.close();
  });

  it('admits only people the company vouches for: sign-in through an attestor, and offboarding when it lapses', async () => {
    vault.createKey('acme-sso');
    const [martin, attestor, lena, kofi] = [person('Martin'), person('Acme sign-in'), person('Lena'), person('Kofi')];
    const all = [martin, attestor, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    martin.kmsCredentials = { token: vault.rootToken };
    attestor.kmsCredentials = { token: vault.rootToken };
    attestor.config = { ...attestor.config, attestor: { issuer: oidc.issuer, audience: 'weave' } };
    await martin.createProject({ name: 'Acme' });
    for (const node of [attestor, lena, kofi]) await node.joinSpace(await martin.invite('Acme'));
    syncAll();
    await martin.manageSpace({ space: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-sso', jwt: { role: 'employees' } }, attestor: attestor.identity.author });
    await new Promise((r) => setTimeout(r, 300));
    syncAll();

    // Lena signs in with her company account (its nonce names her identity); a forged token gets nothing.
    const lenasToken = oidc.token({ sub: 'lena@acme', email: 'lena@acme.example', groups: ['employees'], nonce: signInNonce(lena.identity.author, 'lena-salt') });
    await lena.signIn({ space: 'Acme', idToken: lenasToken, salt: 'lena-salt' });
    const { generateKeyPairSync } = await import('node:crypto');
    kofi.kmsCredentials = { token: vault.rootToken };
    await kofi.signIn({ space: 'Acme', idToken: oidc.token({ sub: 'kofi@acme', signWith: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }) });
    syncAll();
    await attestor.reconcile();
    syncAll();
    const attested = new Map((await martin.members('Acme')).map((m) => [m.name, m.attested]));
    expect(attested.get('Lena')).toMatchObject({ subject: 'lena@acme', email: 'lena@acme.example', groups: ['employees'] });
    expect(attested.get('Kofi')).toBeUndefined();

    // Kofi got hold of Lena's token (0siqvEzB: the key service sees it too): handed in as his, it vouches for nobody,
    // whether with her salt, with his own, or a token without a nonce at all.
    for (const [idToken, salt] of [[lenasToken, 'lena-salt'], [lenasToken, 'kofi-salt'], [oidc.token({ sub: 'lena@acme', groups: ['employees', 'weave-admins'] }), undefined]] as const) {
      await kofi.signIn({ space: 'Acme', idToken, ...(salt ? { salt } : {}) });
      syncAll();
      await attestor.reconcile();
      syncAll();
      expect((await martin.members('Acme')).find((m) => m.name === 'Kofi')?.attested).toBeUndefined();
    }
    // Lena's own renewal with a refreshed token (no nonce) still holds: it renews who was vouched for already.
    await lena.signIn({ space: 'Acme', idToken: oidc.token({ sub: 'lena@acme', email: 'lena@acme.example', groups: ['employees'] }) });
    syncAll();
    await attestor.reconcile();
    syncAll();
    expect((await martin.members('Acme')).find((m) => m.name === 'Lena')?.attested).toMatchObject({ subject: 'lena@acme' });

    // Two hours on: Kofi, never vouched for, is removed; Lena stays while her attestation holds.
    martin.clock = () => Date.now() + 2 * 3_600_000;
    await martin.reconcile();
    syncAll();
    expect((await martin.members('Acme')).map((m) => m.name).sort()).toEqual(['Acme sign-in', 'Lena', 'Martin']);
    // A day on without signing in again: Lena too.
    martin.clock = () => Date.now() + 25 * 3_600_000;
    await martin.reconcile();
    expect((await martin.members('Acme')).map((m) => m.name).sort()).toEqual(['Acme sign-in', 'Martin']);
    for (const node of all) await node.close();
  });

  it('lets only approved agents act in a company space, and keeps it out of other agents’ sight', async () => {
    vault.createKey('acme-agents');
    const [martin, lena] = [person('Martin'), person('Lena')];
    for (const node of [martin, lena]) node.kmsCredentials = { token: vault.rootToken };
    await martin.createProject({ name: 'Acme' });
    await lena.joinSpace(await martin.invite('Acme'));
    sync(martin, lena);
    sync(lena, martin);
    await martin.manageSpace({ space: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-agents' } });
    await new Promise((r) => setTimeout(r, 300));
    sync(martin, lena);
    await lena.reconcile();
    await lena.addAgent('helper', ['weave.msg']);
    sync(lena, martin);
    await expect(lena.say({ space: 'Acme', text: 'from the helper', as: 'helper' })).rejects.toThrow(/isn't approved/);
    expect((await lena.agentBlocked('helper')).map((s) => s.name)).toEqual(['Acme']);
    await expect(martin.approveAgent({ space: 'Acme', agent: 'Lena/helper' })).resolves.toMatchObject({ managed: { agents: ['Lena/helper'] } });
    await expect(lena.approveAgent({ space: 'Acme', agent: 'Lena/helper' })).rejects.toThrow(/manage/);
    sync(martin, lena);
    expect(await lena.agentBlocked('helper')).toEqual([]);
    await lena.say({ space: 'Acme', text: 'from the helper', as: 'helper' });
    sync(lena, martin);
    expect((await texts(martin)).includes('from the helper')).toBe(true);
    // No longer approved: what it writes from now on doesn't count, and the space is out of its sight again.
    await martin.approveAgent({ space: 'Acme', agent: 'Lena/helper', on: false });
    sync(martin, lena);
    expect((await lena.agentBlocked('helper')).map((s) => s.name)).toEqual(['Acme']);
    for (const node of [martin, lena]) await node.close();
  });

  it('keeps an employee’s recovery words with the company: only its key service opens them, for those who manage the space', async () => {
    vault.createKey('acme-escrow');
    const martin = person('Martin');
    const lenaMade = WeaveNode.create('Lena', mkdtempSync(join(tmpdir(), 'weave-managed-')));
    const lena = lenaMade.node;
    const kofi = person('Kofi');
    for (const node of [martin, lena, kofi]) node.kmsCredentials = { token: vault.rootToken };
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
    };
    await martin.createProject({ name: 'Acme' });
    for (const node of [lena, kofi]) await node.joinSpace(await martin.invite('Acme'));
    syncAll();
    await martin.manageSpace({ space: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-escrow' } });
    await new Promise((r) => setTimeout(r, 300));
    syncAll();
    for (const node of all) await node.reconcile();

    await expect(lena.escrowRecovery({ space: 'Acme', words: martin.identity.author })).rejects.toThrow();
    await lena.escrowRecovery({ space: 'Acme', words: lenaMade.words });
    syncAll();
    // Members see that it exists, not the words.
    expect(JSON.stringify(kofi.replica.events())).not.toContain(lenaMade.words.split(' ')[0] + ' ' + lenaMade.words.split(' ')[1]);
    await expect(kofi.openEscrow({ space: 'Acme', person: 'Lena' })).rejects.toThrow(/manage/);
    // Not even a maintainer with full key service rights (XyMStMvo): the key service's part alone opens nothing.
    await martin.setMaintainer({ project: 'Acme', who: 'Kofi', on: true });
    syncAll();
    await expect(kofi.openEscrow({ space: 'Acme', person: 'Lena' })).rejects.toThrow(/only Martin opens recovery words/);
    const words = await martin.openEscrow({ space: 'Acme', person: 'Lena' });
    expect(words).toBe(lenaMade.words.trim().toLowerCase().split(/\s+/).join(' '));
    // Lena's laptop is lost: the words set up a new one.
    const again = await WeaveNode.restore(words, mkdtempSync(join(tmpdir(), 'weave-managed-')), { events: martin.replica.events((r) => r.scope === 'public' || r.v === 1) });
    expect(again.identity.author).toBe(lena.identity.author);
    // The audit says who did what, without secrets.
    const audit = await martin.audit({ space: 'Acme' });
    const kinds = audit.map((l) => l.kind);
    for (const kind of ['weave.space.create', 'weave.space.join', 'weave.space.managed', 'weave.space.rekey', 'weave.space.kms', 'weave.org.escrow', 'weave.org.escrow.opened']) expect(kinds).toContain(kind);
    expect(audit.find((l) => l.kind === 'weave.org.escrow.opened')).toMatchObject({ byName: 'Martin', detail: { person: lena.identity.author } });
    expect(JSON.stringify(audit)).not.toMatch(/"(wrapped|boxes|ct|nonce)"/);
    expect(audit.map((l) => l.time)).toEqual([...audit.map((l) => l.time)].sort());
    // Without the company's key service, nobody opens it.
    await martin.destroyCompanyKey('Acme');
    await expect(martin.openEscrow({ space: 'Acme', person: 'Lena' })).rejects.toThrow();
    for (const node of [...all, again]) await node.close();
  });

  it('works the same with Azure Key Vault: employees through Entra, offboarding at the end of the TTL', async () => {
    const azure = await new AzureStub(oidc).start();
    try {
      azure.createKey('acme');
      const [martin, lena] = [person('Martin'), person('Lena')];
      martin.kmsCredentials = { azureClientSecret: azure.secret };
      lena.kmsCredentials = { delegated: async () => oidc.token({ sub: 'lena@acme', aud: 'https://vault.azure.net' }) };
      await martin.createProject({ name: 'Acme' });
      await lena.joinSpace(await martin.invite('Acme'));
      sync(martin, lena);
      sync(lena, martin);
      await martin.manageSpace({ space: 'Acme', provider: { kind: 'azure', vault: azure.url, key: 'acme', tenant: 'acme', clientId: 'weave', authority: azure.url }, graceHours: 0 });
      await new Promise((r) => setTimeout(r, 300));
      sync(martin, lena);
      await lena.reconcile();
      await martin.say({ space: 'Acme', text: 'on azure' });
      sync(martin, lena);
      expect(await texts(lena)).toContain('on azure');
      expect((await martin.spaces('project'))[0].managed?.provider).toMatch(/Azure Key Vault/);
      azure.disable('lena@acme');
      lena.clock = () => Date.now() + 20 * minute;
      await lena.reconcile();
      expect(await texts(lena)).not.toContain('on azure');
      for (const node of [martin, lena]) await node.close();
    } finally {
      await azure.stop();
    }
  });
});

describe('company halves: who publishes them, the gap before one arrives, and a restart before it is published', { timeout: 120_000 }, () => {
  const settle = () => new Promise((r) => setTimeout(r, 300));

  it("a member's planted half for the next epoch doesn't lock everyone out (WUCPqIBs)", async () => {
    const { martin, lena, kofi, syncAll } = await company('acme-kms', 0);
    const space = loadSpaces(kofi.home).find((s) => s.name === 'Acme')!;
    const next = Math.max(...Object.keys(space.keys).map(Number)) + 1;
    kofi.replica.write(kofi.identity, sealFor(space, { kind: KIND_KMS, body: { epoch: next, wrapped: 'vault:v1:' + Buffer.alloc(48, 7).toString('base64') } }));
    syncAll();
    await martin.removeMember('Acme', 'Kofi');
    await martin.say({ space: 'Acme', text: 'after kofi left' });
    await settle();
    syncAll();
    await lena.reconcile();
    expect(await texts(lena)).toContain('after kofi left');
    expect((await lena.spaces('project'))[0].managed?.problem).toBeUndefined();
  });

  it('nothing is written with the Weave half alone before a new epoch has its company half (yHsKySEi)', async () => {
    vault.createKey('acme-gap');
    const [martin, lena] = [person('Martin'), person('Lena')];
    martin.kmsCredentials = { token: vault.rootToken };
    lena.kmsCredentials = { idToken: () => oidc.token({ sub: 'lena-gap', groups: ['employees'] }) };
    await martin.createProject({ name: 'Acme' });
    await lena.joinSpace(await martin.invite('Acme'));
    sync(martin, lena);
    sync(lena, martin);
    await martin.manageSpace({ space: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-gap', jwt: { role: 'employees' } } });
    sync(martin, lena); // the rekey, not yet the half
    await expect(lena.say({ space: 'Acme', text: 'written in the gap' })).rejects.toThrow(/locked/);
    await settle();
    sync(martin, lena);
    await lena.reconcile();
    await lena.say({ space: 'Acme', text: 'written once it unlocked' });
    sync(lena, martin);
    expect(await texts(martin)).toContain('written once it unlocked');
    for (const node of [martin, lena]) await node.close();
  });

  it('a half the key service refused to wrap is kept over a restart and published then (AsPMzM8O)', async () => {
    const { martin, lena, all, syncAll } = await company('acme-lost', 0);
    martin.kmsCredentials = { token: 'expired' };
    await martin.removeMember('Acme', 'Kofi');
    await martin.say({ space: 'Acme', text: 'written after the rotation' });
    await settle();
    expect((await martin.spaces('project'))[0].managed?.problem).toMatch(/wrap/);
    const dir = martin.home.dir;
    await martin.close();
    const again = WeaveNode.open(dir);
    again.kmsCredentials = { token: vault.rootToken };
    await again.reconcile();
    expect((await again.spaces('project'))[0].managed?.problem).toBeUndefined();
    expect(await texts(again)).toContain('written after the rotation');
    for (const node of all.filter((n) => n !== martin)) {
      sync(again, node);
      sync(node, again);
    }
    void syncAll;
    await lena.reconcile();
    expect(await texts(lena)).toContain('written after the rotation');
    await again.close();
  });
});
