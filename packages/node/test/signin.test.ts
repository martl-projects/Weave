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

function dir(): string {
  const made = mkdtempSync(join(tmpdir(), 'weave-signin-'));
  dirs.push(made);
  return made;
}
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
};
const settle = () => new Promise((r) => setTimeout(r, 300));

/** What the system browser does: follow the sign-in page's redirects back to this computer. */
async function browser(url: string): Promise<void> {
  let next = url;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(next, { redirect: 'manual' });
    const to = res.headers.get('location');
    if (!to) return;
    next = new URL(to, next).toString();
  }
}

describe('signing in with a company account', { timeout: 120_000 }, () => {
  it('enrolls through the browser, and stays signed in by itself: tokens renew, the company keeps vouching', async () => {
    vault.createKey('acme-signin');
    const acme = WeaveNode.init('Acme', dir());
    acme.kmsCredentials = { token: vault.rootToken };
    await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-signin', jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave-app', admins: 'weave-admins' });
    await settle();
    // The company vouches for an hour at a time here, so renewing comes due.
    acme.config = { ...acme.config, attestor: { ...acme.config.attestor!, hours: 1 } };

    // The link says where to sign in; the person signs in in the browser, no token by hand.
    oidc.loginAs = { sub: 'lena-oid', email: 'lena@acme.example', name: 'Lena Brandt', groups: ['employees'] };
    const opened: string[] = [];
    const lena = await WeaveNode.enroll(await acme.enrollLink(), dir(), { open: (url) => (opened.push(url), browser(url)) });
    expect(new URL(opened[0]).searchParams.get('client_id')).toBe('weave-app');
    expect(new URL(opened[0]).searchParams.get('code_challenge_method')).toBe('S256');
    expect((await lena.whoami()).name).toBe('Lena Brandt');

    const all = [acme, lena];
    syncAll(all);
    await lena.reconcile();
    await settle();
    syncAll(all);
    await acme.reconcile();
    syncAll(all);
    const first = await lena.signInStatus();
    expect(first).toMatchObject({ company: true, name: 'Acme', account: 'lena@acme.example', renews: true });
    expect(first.vouchedUntil).toBeDefined();

    // An hour on: the token has run out and the vouching nearly has. Lena's node renews both by itself.
    const later = () => Date.now() + 61 * 60_000;
    lena.clock = later;
    oidc.now = later;
    const signIns = () => lena.replica.events((e) => e.author === lena.identity.author).length;
    const before = signIns();
    await lena.reconcile();
    expect(oidc.refreshes).toBe(1);
    expect(signIns()).toBeGreaterThan(before);
    const renewed = await lena.signInStatus();
    expect(Date.parse(renewed.tokenUntil!)).toBeGreaterThan(later());
    expect(renewed.problem).toBeUndefined();
    syncAll(all);
    await acme.reconcile();
    syncAll(all);
    expect((await acme.members('Acme')).find((m) => m.name === 'Lena Brandt')?.attested?.subject).toBe('lena-oid');
    for (const node of all) await node.close();
  });
});
