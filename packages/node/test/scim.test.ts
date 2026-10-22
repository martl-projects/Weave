import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { forgetMachinePolicy } from '../src/machine.ts';
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
  const made = mkdtempSync(join(tmpdir(), 'weave-scim-'));
  dirs.push(made);
  return made;
}
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
};
const settle = () => new Promise((r) => setTimeout(r, 300));

async function company(key: string) {
  vault.createKey(key);
  const acme = WeaveNode.init('Acme', dir());
  acme.kmsCredentials = { token: vault.rootToken };
  await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key, jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
  await settle();
  return acme;
}

/** Enroll and get vouched for; `before` runs on the new node first (device credentials). */
async function enroll(acme: WeaveNode, people: Array<{ name: string; sub: string; email: string; before?: (node: WeaveNode) => void }>, others: WeaveNode[] = []) {
  const link = await acme.enrollLink();
  const nodes: WeaveNode[] = [];
  for (const p of people) {
    const node = await WeaveNode.enroll(link, dir(), { idToken: oidc.token({ sub: p.sub, email: p.email, groups: ['employees'] }), name: p.name });
    p.before?.(node);
    nodes.push(node);
  }
  const all = [acme, ...nodes, ...others];
  syncAll(all);
  for (const node of nodes) await node.reconcile();
  await settle();
  syncAll(all);
  await acme.reconcile();
  syncAll(all);
  return { nodes, all };
}

describe('the company in its user management and device management', { timeout: 120_000 }, () => {
  it('takes SCIM from the user management: groups at once, deactivated people out at once, deleted accounts frozen', async () => {
    const acme = await company('acme-scim');
    await acme.companyAction({ action: 'space', kind: 'group', name: 'Engineers' });
    await settle();
    await acme.companyAction({ action: 'map', group: 'engineering', space: 'Engineers' });
    const {
      nodes: [lena, kofi],
      all,
    } = await enroll(acme, [
      { name: 'Lena', sub: 'lena-oid', email: 'lena@acme.example' },
      { name: 'Kofi', sub: 'kofi-oid', email: 'kofi@acme.example' },
    ]);
    expect((await acme.members('Acme')).map((m) => m.name).sort()).toEqual(['Acme', 'Kofi', 'Lena']);

    const scim = await acme.setScim({ on: true, port: 0 });
    expect(scim.token).toBeTruthy();
    const base = `http://127.0.0.1:${scim.port}/scim/v2`;
    const call = async (method: string, path: string, body?: unknown, token = scim.token) => {
      const res = await fetch(`${base}${path}`, { method, headers: { authorization: `Bearer ${token}`, 'content-type': 'application/scim+json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
      return { status: res.status, body: res.status === 204 ? undefined : ((await res.json()) as Record<string, unknown>) };
    };
    expect((await call('GET', '/Users', undefined, 'wrong')).status).toBe(401);

    // Entra provisions: users (matched by object id or email), then a group.
    const lenaUser = await call('POST', '/Users', { schemas: ['urn:ietf:params:scim:schemas:core:2.0:User'], userName: 'lena@acme.example', externalId: 'lena-oid', active: true, emails: [{ value: 'lena@acme.example', primary: true }] });
    expect(lenaUser.status).toBe(201);
    const kofiUser = await call('POST', '/Users', { userName: 'kofi@acme.example', active: true, emails: [{ value: 'kofi@acme.example' }] });
    expect((await call('GET', '/Users?filter=' + encodeURIComponent('userName eq "KOFI@acme.example"'))).body?.totalResults).toBe(1);
    await call('POST', '/Groups', { displayName: 'engineering', members: [{ value: lenaUser.body!.id }] });
    syncAll(all);
    expect((await acme.members('Engineers')).map((m) => m.name).sort()).toEqual(['Acme', 'Lena']);
    expect((await acme.members('Acme')).find((m) => m.name === 'Lena')?.attested?.groups).toEqual(['engineering']);

    // Kofi is deactivated: out of every company space now, not when his day runs out.
    const patched = await call('PATCH', `/Users/${kofiUser.body!.id}`, { schemas: ['urn:ietf:params:scim:api:messages:2.0:PatchOp'], Operations: [{ op: 'Replace', path: 'active', value: 'False' }] });
    expect(patched.body?.active).toBe(false);
    expect((await acme.members('Acme')).map((m) => m.name).sort()).toEqual(['Acme', 'Lena']);

    // Lena's account is deleted: she's out, and her company-owned identity is frozen.
    expect((await call('DELETE', `/Users/${lenaUser.body!.id}`)).status).toBe(204);
    expect((await acme.members('Acme')).map((m) => m.name)).toEqual(['Acme']);
    syncAll(all);
    expect((await kofi.profile(lena.identity.author)).company).toMatchObject({ frozen: true });
    expect((await acme.scim()).users.map((u) => `${u.userName}:${u.active}`)).toEqual(['kofi@acme.example:false']);
    for (const node of all) await node.close();
  });

  const openssl = (() => {
    try {
      execFileSync('openssl', ['version'], { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  })();

  it.skipIf(!openssl)('vouches only for sign-ins from the company’s own computers', async () => {
    // The company's device authority and one company laptop, as device management would issue them.
    const certs = dir();
    const at = (f: string) => join(certs, f);
    const ssl = (...args: string[]) => execFileSync('openssl', args, { stdio: 'ignore' });
    ssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', at('ca.key'), '-out', at('ca.pem'), '-days', '2', '-subj', '/CN=Acme Devices', '-addext', 'basicConstraints=critical,CA:TRUE', '-addext', 'keyUsage=critical,keyCertSign');
    ssl('req', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', at('laptop.key'), '-out', at('laptop.csr'), '-subj', '/CN=ACME-LAPTOP-7');
    ssl('x509', '-req', '-in', at('laptop.csr'), '-CA', at('ca.pem'), '-CAkey', at('ca.key'), '-CAcreateserial', '-out', at('laptop.pem'), '-days', '2');
    // And a laptop from somewhere else.
    ssl('req', '-x509', '-newkey', 'ec', '-pkeyopt', 'ec_paramgen_curve:P-256', '-nodes', '-keyout', at('home.key'), '-out', at('home.pem'), '-days', '2', '-subj', '/CN=HOME-PC');

    const acme = await company('acme-devices');
    await expect(acme.companyAction({ action: 'settings', deviceCA: readFileSync(at('laptop.pem'), 'utf8') })).rejects.toThrow(/certificate authority/);
    await acme.companyAction({ action: 'settings', deviceCA: readFileSync(at('ca.pem'), 'utf8') });
    const { all } = await enroll(acme, [
      { name: 'Lena', sub: 'lena', email: 'lena@acme.example', before: (n) => (n.deviceCredentials = { cert: readFileSync(at('laptop.pem'), 'utf8'), key: readFileSync(at('laptop.key'), 'utf8') }) },
      { name: 'Kofi', sub: 'kofi', email: 'kofi@acme.example', before: (n) => (n.deviceCredentials = { cert: readFileSync(at('home.pem'), 'utf8'), key: readFileSync(at('home.key'), 'utf8') }) },
      { name: 'Ade', sub: 'ade', email: 'ade@acme.example' },
    ]);
    const members = await acme.members('Acme');
    expect(members.find((m) => m.name === 'Lena')?.attested?.device?.subject).toMatch(/ACME-LAPTOP-7/);
    expect(members.find((m) => m.name === 'Kofi')?.attested).toBeUndefined();
    expect(members.find((m) => m.name === 'Ade')?.attested).toBeUndefined();
    for (const node of all) await node.close();
  });

  it('follows the computer’s managed settings: company accounts only, of the companies named', async () => {
    const acme = await company('acme-managed');
    const other = await company('other-managed');
    const policy = join(dir(), 'weave.policy.json');
    writeFileSync(policy, JSON.stringify({ companyOnly: true, companies: [acme.identity.author], updates: false }));
    process.env.WEAVE_POLICY = policy;
    forgetMachinePolicy();
    try {
      expect(() => WeaveNode.init('Private me', dir())).toThrow(/only company accounts/);
      const lena = await WeaveNode.enroll(await acme.enrollLink(), dir(), { idToken: oidc.token({ sub: 'lena' }), name: 'Lena' });
      expect((await lena.whoami()).company?.did).toBe(acme.identity.author);
      expect((await lena.updateCheck({ current: '0.1.0' })).latest).toBeUndefined();
      await expect(WeaveNode.enroll(await other.enrollLink(), dir(), { idToken: oidc.token({ sub: 'x' }) })).rejects.toThrow(/another company/);
      for (const node of [acme, lena, other]) await node.close();
    } finally {
      delete process.env.WEAVE_POLICY;
      forgetMachinePolicy();
    }
  });
});
