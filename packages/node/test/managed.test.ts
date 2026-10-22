import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
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

describe('managed spaces', () => {
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

    // Lena signs in with her company account; a forged token gets nothing.
    await lena.signIn({ space: 'Acme', idToken: oidc.token({ sub: 'lena@acme', email: 'lena@acme.example', groups: ['employees'] }) });
    const { generateKeyPairSync } = await import('node:crypto');
    kofi.kmsCredentials = { token: vault.rootToken };
    await kofi.signIn({ space: 'Acme', idToken: oidc.token({ sub: 'kofi@acme', signWith: generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey }) });
    syncAll();
    await attestor.reconcile();
    syncAll();
    const attested = new Map((await martin.members('Acme')).map((m) => [m.name, m.attested]));
    expect(attested.get('Lena')).toMatchObject({ subject: 'lena@acme', email: 'lena@acme.example', groups: ['employees'] });
    expect(attested.get('Kofi')).toBeUndefined();

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
});
