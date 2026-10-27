import { mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { browserSignIn, isWebAddress, openInBrowser } from '../src/signin.ts';
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

describe('what may open in the browser', () => {
  it('only web pages: https, or http on this computer', () => {
    for (const ok of ['https://login.example.com/authorize?x=1', 'http://127.0.0.1:5000/callback', 'http://localhost:3000', 'http://[::1]:80/', 'http://weave.localhost:7710/x']) expect(isWebAddress(ok)).toBe(true);
    for (const bad of ['file:///C:/Windows/System32/calc.exe', 'file://attacker/share/x.exe', '\\\\attacker\\share\\x.exe', 'http://login.example.com', 'javascript:alert(1)', 'ms-settings:', 'C:\\x.exe', 'not a url']) expect(isWebAddress(bad)).toBe(false);
  });

  it("refuses to hand anything else to the system's URL handler", () => {
    expect(() => openInBrowser('file://attacker/share/x.exe')).toThrow(/only https/);
  });

  it("doesn't follow a company sign-in whose discovery names a file or share as its sign-in page", async () => {
    const evil = createServer((_req, res) => res.end(JSON.stringify({ authorization_endpoint: 'file://attacker/share/x.exe', token_endpoint: 'https://attacker.example/token' })));
    await new Promise<void>((resolve) => evil.listen(0, '127.0.0.1', resolve));
    try {
      const opened: string[] = [];
      const issuer = `http://127.0.0.1:${(evil.address() as AddressInfo).port}`;
      await expect(browserSignIn({ issuer, clientId: 'weave-app' }, (url) => void opened.push(url))).rejects.toThrow(/isn't an https address/);
      await expect(browserSignIn({ issuer: 'file://attacker/share', clientId: 'weave-app' }, (url) => void opened.push(url))).rejects.toThrow(/must be an https address/);
      expect(opened).toEqual([]);
    } finally {
      evil.close();
    }
  });
});

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

  it('reaches Azure Key Vault as the person, with a token from their own sign-in, until Entra blocks them', async () => {
    const azure = await new AzureStub(oidc).start();
    try {
      azure.createKey('acme');
      const acme = WeaveNode.init('Acme', dir());
      // The company's server: its own app's secret.
      acme.kmsCredentials = { azureClientSecret: azure.secret };
      await acme.createCompany({ name: 'Acme', provider: { kind: 'azure', vault: azure.url, key: 'acme', tenant: 'acme', clientId: 'weave-server', authority: azure.url }, issuer: oidc.issuer, audience: 'weave-app', admins: 'weave-admins' });
      await settle();
      await acme.say({ space: 'Acme', text: 'welcome' });

      // An employee signs in in the browser; their node gets Key Vault tokens issued to them, from that sign-in.
      oidc.loginAs = { sub: 'kofi-oid', email: 'kofi@acme.example', name: 'Kofi Mensah', groups: ['employees'] };
      const kofi = await WeaveNode.enroll(await acme.enrollLink(), dir(), { open: browser });
      const all = [acme, kofi];
      syncAll(all);
      await kofi.reconcile();
      await settle();
      syncAll(all);
      await acme.reconcile();
      syncAll(all);
      await kofi.reconcile();
      expect(oidc.delegations).toBeGreaterThan(0);
      expect(azure.log.some((l) => l.op === 'unwrapkey' && l.sub === 'kofi-oid')).toBe(true);
      expect((await kofi.messages('Acme')).map((m) => m.text)).toContain('welcome');

      // Blocked in Entra: no more tokens for Key Vault, so once the key's time and the offline allowance (8 hours) are up, nothing opens.
      oidc.disabled.add('kofi-oid');
      azure.disable('kofi-oid');
      kofi.clock = () => Date.now() + 9 * 3_600_000;
      await kofi.reconcile();
      expect((await kofi.messages('Acme')).map((m) => m.text)).not.toContain('welcome');
      expect((await kofi.spaces('group'))[0].managed?.problem).toMatch(/sign in again|refused/);
      for (const node of all) await node.close();
    } finally {
      await azure.stop();
    }
  });
});
