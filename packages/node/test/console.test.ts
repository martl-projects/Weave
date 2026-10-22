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

/** Follow a sign-in through the console and the company's sign-in, by hand: the session cookie at the end, or the refusal. */
async function signIn(base: string, start = '/login'): Promise<{ cookie?: string; status: number }> {
  let url = `${base}${start}`;
  for (let hop = 0; hop < 5; hop++) {
    const res = await fetch(url, { redirect: 'manual' });
    const cookie = res.headers.get('set-cookie')?.split(';')[0];
    if (cookie?.startsWith('weave_console=')) return { cookie, status: res.status };
    if (res.status !== 302) return { status: res.status };
    url = new URL(res.headers.get('location')!, url).toString();
  }
  return { status: 0 };
}

describe('the admin console', { timeout: 120_000 }, () => {
  it('lets the company’s admins in with their company sign-in, and records what they do', async () => {
    vault.createKey('acme-console');
    const dir = mkdtempSync(join(tmpdir(), 'weave-console-'));
    dirs.push(dir);
    const acme = WeaveNode.init('Acme', dir);
    acme.kmsCredentials = { token: vault.rootToken };
    await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-console', jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
    await new Promise((r) => setTimeout(r, 300));
    const info = await acme.setConsole({ on: true, port: 0, clientId: 'weave-console' });
    const base = info.url!;

    // Not signed in: nothing.
    expect((await fetch(`${base}/api/company`)).status).toBe(401);
    // Someone who isn't an admin signs in: refused.
    oidc.loginAs = { sub: 'pat', email: 'pat@acme.example', groups: ['employees'] };
    expect((await signIn(base)).status).toBe(403);
    // An admin: in.
    oidc.loginAs = { sub: 'kim', email: 'kim@acme.example', name: 'Kim', groups: ['employees', 'weave-admins'] };
    const { cookie } = await signIn(base);
    expect(cookie).toBeTruthy();
    const get = async (path: string) => (await fetch(`${base}/api${path}`, { headers: { cookie: cookie! } })).json();
    const post = (path: string, body: unknown, header = true) => fetch(`${base}/api${path}`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json', ...(header ? { 'x-weave-console': '1' } : {}) }, body: JSON.stringify(body) });
    expect(await get('/me')).toMatchObject({ subject: 'kim', email: 'kim@acme.example', name: 'Kim' });
    expect(await get('/company')).toMatchObject({ name: 'Acme', admins: 'weave-admins' });

    // Changes need the console's own header (no other site can send it).
    expect((await post('/action', { action: 'space', kind: 'project', name: 'Roadmap' }, false)).status).toBe(403);
    expect((await post('/action', { action: 'space', kind: 'project', name: 'Roadmap' })).status).toBe(200);
    await new Promise((r) => setTimeout(r, 300));
    const company = (await get('/company')) as { spaces: Array<{ id: string; name: string }> };
    const roadmap = company.spaces.find((s) => s.name === 'Roadmap')!;
    expect((await post('/action', { action: 'map', group: 'engineering', space: roadmap.id })).status).toBe(200);
    expect((await post('/enroll-link', { days: 7 })).status).toBe(200);

    // The audit says who did it in the console.
    const audit = ((await get('/audit')) as { lines: Array<{ kind: string; detail: { subject?: string; action?: string } }> }).lines;
    expect(audit.filter((l) => l.kind === 'weave.org.console').map((l) => `${l.detail.subject}:${l.detail.action}`).sort()).toEqual(['kim:enroll-link', 'kim:map', 'kim:space']);
    expect(((await get('/spaces')) as Array<{ name: string }>).map((s) => s.name).sort()).toEqual(['Acme', 'Roadmap']);

    // The operator link lets one person in, once.
    const link = new URL(info.operatorLink!);
    const operator = await signIn(base, `${link.pathname}${link.search}`);
    expect(operator.cookie).toBeTruthy();
    expect((await signIn(base, `${link.pathname}${link.search}`)).status).toBe(403);

    await fetch(`${base}/logout`, { headers: { cookie: cookie! }, redirect: 'manual' });
    expect((await fetch(`${base}/api/company`, { headers: { cookie: cookie! } })).status).toBe(401);
    await acme.close();
  });
});
