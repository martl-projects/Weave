import { existsSync, mkdtempSync, rmSync } from 'node:fs';
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

function dir(): string {
  const made = mkdtempSync(join(tmpdir(), 'weave-company-'));
  dirs.push(made);
  return made;
}
const person = (name: string) => WeaveNode.init(name, dir());
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
};
const settle = () => new Promise((r) => setTimeout(r, 300));

/** The company's own node: Acme, under Vault, vouching through the OIDC stand-in; admins are the "weave-admins" sign-in group. */
async function company(key: string) {
  vault.createKey(key);
  const acme = person('Acme');
  acme.kmsCredentials = { token: vault.rootToken };
  await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key, jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
  await settle();
  return acme;
}

// Many sync and reconcile rounds against the HTTP stand-ins: slow on CI runners.
describe('company accounts', { timeout: 120_000 }, () => {
  it('sets up accounts the company owns: no words shown, spaces from sign-in groups, admins, starting setup', async () => {
    const acme = await company('acme-accounts');
    const ceo = person('Ceo');
    await acme.companyAction({ action: 'start', contacts: [await ceo.contactLink()] });
    await acme.companyAction({ action: 'space', kind: 'group', name: 'Engineers' });
    await acme.companyAction({ action: 'space', kind: 'project', name: 'Roadmap' });
    await settle();
    await acme.companyAction({ action: 'map', group: 'engineering', space: 'Engineers' });
    const link = await acme.enrollLink();
    expect(link).toMatch(/^weave:enroll:/);

    const lenaDir = dir();
    const lena = await WeaveNode.enroll(link, lenaDir, { idToken: oidc.token({ sub: 'lena@acme', email: 'lena@acme.example', groups: ['employees', 'engineering', 'weave-admins'] }), name: 'Lena' });
    const kofi = await WeaveNode.enroll(link, dir(), { idToken: oidc.token({ sub: 'kofi@acme', email: 'kofi@acme.example', groups: ['employees'] }) });
    const all = [acme, ceo, lena, kofi];
    // The words wait, sealed, until the company group is here; then they go to the company and are deleted.
    expect(existsSync(join(lenaDir, 'enroll.json'))).toBe(true);
    syncAll(all);
    for (const node of [lena, kofi]) await node.reconcile();
    await settle();
    syncAll(all);
    expect(existsSync(join(lenaDir, 'enroll.json'))).toBe(false);
    // The company vouches for them, then puts them where their sign-in groups say.
    await acme.reconcile();
    syncAll(all);
    await acme.reconcile();
    syncAll(all);

    expect((await lena.whoami()).company).toMatchObject({ did: acme.identity.author, name: 'Acme' });
    expect((await kofi.whoami()).name).toBe('kofi');
    expect((await lena.spaces()).map((s) => s.name).sort()).toEqual(['Acme', 'Engineers', 'Roadmap']);
    expect((await kofi.spaces()).map((s) => s.name).sort()).toEqual(['Acme']);
    expect((await acme.members('Roadmap')).find((m) => m.name === 'Lena')).toMatchObject({ maintainer: true, company: 'Acme' });
    // The company's starting setup, not the app's bundle.
    expect((await lena.profile(ceo.identity.author)).contact).toBe(true);
    // Both members read the company spaces under the company's key service.
    await lena.say({ space: 'Engineers', text: 'hello engineers' });
    syncAll(all);
    expect((await acme.messages('Engineers')).map((m) => m.text)).toContain('hello engineers');

    // An admin asks the company; the company's node does it. Others can't ask.
    expect((await lena.company())?.admin).toBe(true);
    await lena.companyAction({ action: 'map', group: 'employees', space: 'Roadmap' });
    await expect(kofi.companyAction({ action: 'map', group: 'employees', space: 'Engineers' })).rejects.toThrow(/admins/);
    syncAll(all);
    await acme.reconcile();
    syncAll(all);
    expect((await kofi.spaces()).map((s) => s.name).sort()).toEqual(['Acme', 'Roadmap']);
    const info = await acme.company();
    expect(info?.requests).toEqual([expect.objectContaining({ action: 'map', byName: 'Lena', done: true })]);
    expect(info?.maps.map((m) => `${m.group}→${m.spaceName}`).sort()).toEqual(['employees→Roadmap', 'engineering→Engineers']);
    const audit = await acme.audit({ space: 'Acme' });
    expect(audit.some((l) => l.kind === 'weave.org.request' && l.byName === 'Lena')).toBe(true);
    for (const node of all) await node.close();
  });

  it('recovers a company-owned identity on a new computer without showing the words, and freezes it when someone leaves', async () => {
    const acme = await company('acme-recovery');
    const link = await acme.enrollLink();
    const kofi = await WeaveNode.enroll(link, dir(), { idToken: oidc.token({ sub: 'kofi@acme', groups: ['employees'] }), name: 'Kofi' });
    const lena = await WeaveNode.enroll(link, dir(), { idToken: oidc.token({ sub: 'lena@acme', groups: ['employees'] }), name: 'Lena' });
    const all = [acme, kofi, lena];
    syncAll(all);
    for (const node of [kofi, lena]) await node.reconcile();
    await settle();
    syncAll(all);
    await acme.reconcile();
    syncAll(all);

    // Words of a company-owned identity are never shown, not even to the company.
    await expect(acme.openEscrow({ space: 'Acme', person: 'Kofi' })).rejects.toThrow(/belongs to the company/);
    const laptop = dir();
    const request = WeaveNode.recoveryRequest(laptop);
    const answer = await acme.openEscrow({ space: 'Acme', person: 'Kofi', for: request });
    expect(answer).toMatch(/^weave:recovery:/);
    await expect(WeaveNode.recover(answer, (WeaveNode.recoveryRequest(dir()), dirs.at(-1)), { events: kofi.replica.events() })).rejects.toThrow(/another computer/);
    const kofi2 = await WeaveNode.recover(answer, laptop, { events: kofi.replica.events() });
    expect((await kofi2.whoami()).did).toBe(kofi.identity.author);
    expect((await acme.audit({ space: 'Acme' })).some((l) => l.kind === 'weave.org.escrow.opened')).toBe(true);
    await kofi2.close();

    // Kofi leaves: the company freezes the identity. What it signs afterwards counts nowhere; its history stays.
    await acme.companyAction({ action: 'freeze', person: 'Kofi' });
    await kofi.setProfile({ name: 'Not Kofi' });
    syncAll(all);
    expect((await lena.profile(kofi.identity.author)).name).toBe('Kofi');
    expect((await lena.profile(kofi.identity.author)).company).toMatchObject({ name: 'Acme', frozen: true });
    expect((await lena.members('Acme')).map((m) => m.name).sort()).toEqual(['Acme', 'Lena']);
    // Only the company the identity names can freeze it.
    const other = await company('other-co');
    sync(lena, other);
    await expect(other.companyAction({ action: 'freeze', person: lena.identity.author })).rejects.toThrow(/isn't an identity this company owns/);
    for (const node of [...all, other]) await node.close();
  });

  it('links a private account with a company account: both sides, the company’s say, history after a freeze', async () => {
    const acme = await company('acme-links');
    const martl = person('martl');
    const { node: work } = WeaveNode.create('martl @ Acme', dir(), { org: acme.identity.author });
    const carol = person('Carol');
    const all = [acme, martl, work, carol];
    syncAll(all);

    // One side says so: pending; both: linked, and shown on the profile with the company.
    await work.link({ who: martl.identity.author });
    syncAll(all);
    expect(await martl.links()).toEqual([expect.objectContaining({ did: work.identity.author, state: 'asked' })]);
    await martl.link({ who: work.identity.author });
    syncAll(all);
    expect(await carol.links(martl.identity.author)).toEqual([expect.objectContaining({ did: work.identity.author, state: 'linked', company: { did: acme.identity.author, name: 'Acme' } })]);
    expect((await carol.profile(martl.identity.author)).links.map((l) => l.name)).toEqual(['martl @ Acme']);

    // Sealed into a space: only its members see it.
    await martl.createGroup('Friends');
    await carol.joinSpace(await martl.invite('Friends'));
    syncAll(all);
    await martl.link({ who: carol.identity.author, space: 'Friends' });
    await carol.link({ who: martl.identity.author, space: 'Friends' });
    syncAll(all);
    expect((await martl.links()).find((l) => l.did === carol.identity.author)).toMatchObject({ state: 'linked', space: 'Friends' });
    expect((await acme.links(martl.identity.author)).map((l) => l.did)).toEqual([work.identity.author]);

    // The company turns linking off: its accounts' links stop counting, everywhere.
    await acme.companyAction({ action: 'settings', links: false });
    syncAll(all);
    expect((await carol.links(martl.identity.author)).find((l) => l.did === work.identity.author)?.state).toBe('refused');
    await acme.companyAction({ action: 'settings', links: true });
    syncAll(all);
    expect((await carol.links(martl.identity.author)).find((l) => l.did === work.identity.author)?.state).toBe('linked');

    // After a freeze the link stays, as history up to then.
    await acme.companyAction({ action: 'freeze', person: work.identity.author });
    syncAll(all);
    const link = (await carol.links(martl.identity.author)).find((l) => l.did === work.identity.author);
    expect(link).toMatchObject({ state: 'linked' });
    expect(link?.until).toBeDefined();
    // Either side ends it.
    await martl.link({ who: carol.identity.author, space: 'Friends', on: false });
    syncAll(all);
    expect((await carol.links()).find((l) => l.did === martl.identity.author)?.state).toBe('waiting');
    for (const node of all) await node.close();
  });
});
