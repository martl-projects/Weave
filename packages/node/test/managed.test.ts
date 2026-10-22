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
});
