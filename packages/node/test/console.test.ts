import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { OidcStub, SmtpStub, VaultStub } from './helpers/stubs.ts';

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

  it('sends invitations by email, from the console and for everyone the user management adds; the link in it enrolls', async () => {
    const mail = await new SmtpStub().start();
    process.env.WEAVE_SMTP_URL = mail.url;
    process.env.WEAVE_SMTP_FROM = 'weave@acme.example';
    try {
      vault.createKey('acme-invite');
      const dir = mkdtempSync(join(tmpdir(), 'weave-invite-'));
      dirs.push(dir);
      const acme = WeaveNode.init('Acme', dir);
      acme.kmsCredentials = { token: vault.rootToken };
      await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-invite', jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
      await new Promise((r) => setTimeout(r, 300));
      // Without the console there's no page for the invitation to open.
      await expect(acme.inviteByEmail({ to: 'noah@acme.example' })).rejects.toThrow(/turn it on first/);
      const info = await acme.setConsole({ on: true, port: 0, clientId: 'weave-console' });
      const base = info.url!;
      oidc.loginAs = { sub: 'kim', email: 'kim@acme.example', name: 'Kim', groups: ['employees', 'weave-admins'] };
      const { cookie } = await signIn(base);
      const post = (path: string, body: unknown) => fetch(`${base}/api${path}`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json', 'x-weave-console': '1' }, body: JSON.stringify(body) });

      // From the console.
      expect((await post('/invite', { email: 'not an address' })).status).toBe(500);
      const sent = await post('/invite', { email: 'noah@acme.example' });
      expect(sent.status).toBe(200);
      expect(mail.messages).toHaveLength(1);
      const [first] = mail.messages;
      expect(first).toMatchObject({ from: 'weave@acme.example', to: ['noah@acme.example'], user: 'weave@acme.example' });
      expect(first.data).toMatch(/Subject: Join Acme on Weave/);
      expect(first.text).toMatch(/^Kim invites you to Acme on Weave/);
      const joinUrl = /https?:\/\/\S+\/join#weave:enroll:[A-Za-z0-9_-]+/.exec(first.text)![0];
      expect(joinUrl.startsWith(`${base}/join#`)).toBe(true);
      // The page it opens: public, no session needed; the link itself stays in the fragment.
      const page = await fetch(joinUrl.split('#')[0]);
      expect(page.status).toBe(200);
      expect(await page.text()).toMatch(/Join Acme on Weave[^]*Open Weave/);

      // The link in it sets the account up.
      const link = joinUrl.split('#')[1];
      const noah = await WeaveNode.enroll(link, mkdtempSync(join(tmpdir(), 'weave-invite-noah-')), { idToken: ({ nonce }) => oidc.token({ nonce, sub: 'noah', email: 'noah@acme.example', groups: ['employees'] }), name: 'Noah' });
      // A company-owned identity: the company it belongs to is in its inception.
      expect(noah.replica.authority.keys(noah.identity.author).org).toBe(acme.identity.author);
      await noah.close();

      // For everyone the user management adds, once SCIM sends invitations.
      const scim = await acme.setScim({ on: true, port: 0, invite: true });
      expect(scim.invite).toBe(true);
      const created = await acme.scimRequest(
        { method: 'POST', path: '/Users', query: new URLSearchParams(), base: 'http://acme/scim/v2', body: { userName: 'ada@acme.example', emails: [{ value: 'ada@acme.example', primary: true }], active: true } },
        `Bearer ${scim.token}`,
      );
      expect(created.status).toBe(201);
      for (let i = 0; i < 50 && mail.messages.length < 2; i++) await new Promise((r) => setTimeout(r, 100));
      expect(mail.messages[1]).toMatchObject({ to: ['ada@acme.example'] });
      expect(mail.messages[1].text).toMatch(/^You are invited to Acme on Weave/);
      // Someone added as inactive gets nothing.
      await acme.scimRequest({ method: 'POST', path: '/Users', query: new URLSearchParams(), base: 'http://acme/scim/v2', body: { userName: 'ex@acme.example', active: false } }, `Bearer ${scim.token}`);
      await new Promise((r) => setTimeout(r, 300));
      expect(mail.messages).toHaveLength(2);

      // The audit says who invited whom.
      await new Promise((r) => setTimeout(r, 300));
      const audit = await acme.audit({ space: (await acme.company())!.group.id });
      const invites = audit.filter((l) => l.kind === 'weave.org.console' && (l.detail as { action?: string }).action === 'invite').map((l) => `${(l.detail as { subject: string }).subject}:${(l.detail as { email: string }).email}`);
      expect(invites.sort()).toEqual(['kim:noah@acme.example', 'kim:not an address', 'scim:ada@acme.example']);
      await acme.close();
    } finally {
      delete process.env.WEAVE_SMTP_URL;
      delete process.env.WEAVE_SMTP_FROM;
      await mail.stop();
    }
  });

  it('gives auditors and the helpdesk their own roles, approves agents, and searches the audit by person, date and words', async () => {
    vault.createKey('acme-roles');
    const dir = mkdtempSync(join(tmpdir(), 'weave-roles-'));
    dirs.push(dir);
    const acme = WeaveNode.init('Acme', dir);
    acme.kmsCredentials = { token: vault.rootToken };
    await acme.createCompany({ name: 'Acme', provider: { kind: 'vault', address: vault.address, key: 'acme-roles', jwt: { role: 'employees' } }, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
    await new Promise((r) => setTimeout(r, 300));
    await acme.companyAction({ action: 'settings', auditors: 'weave-auditors', helpdesk: 'weave-helpdesk' });
    expect(await acme.company()).toMatchObject({ admins: 'weave-admins', auditors: 'weave-auditors', helpdesk: 'weave-helpdesk' });

    // Noah enrolls, and his node gets an agent.
    const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
    const noah = await WeaveNode.enroll(await acme.enrollLink(), mkdtempSync(join(tmpdir(), 'weave-roles-noah-')), { idToken: ({ nonce }) => oidc.token({ nonce, sub: 'noah', email: 'noah@acme.example', groups: ['employees'] }), name: 'Noah' });
    const both = async () => {
      sync(acme, noah);
      sync(noah, acme);
      await noah.reconcile();
      await new Promise((r) => setTimeout(r, 300));
      sync(noah, acme);
      await acme.reconcile();
      sync(acme, noah);
    };
    await both();
    await noah.addAgent('helper', ['weave.msg']);
    sync(noah, acme);

    const info = await acme.setConsole({ on: true, port: 0, clientId: 'weave-console' });
    const base = info.url!;
    const as = async (who: { sub: string; email: string; name: string; groups: string[] }) => {
      oidc.loginAs = who;
      const { cookie, status } = await signIn(base);
      return {
        status,
        get: (path: string) => fetch(`${base}/api${path}`, { headers: { cookie: cookie! } }),
        post: (path: string, body: unknown) => fetch(`${base}/api${path}`, { method: 'POST', headers: { cookie: cookie!, 'content-type': 'application/json', 'x-weave-console': '1' }, body: JSON.stringify(body) }),
      };
    };
    // Someone in none of the three groups: refused.
    expect((await as({ sub: 'pat', email: 'pat@acme.example', name: 'Pat', groups: ['employees'] })).status).toBe(403);

    // The admin approves Noah's agent in the company group.
    const kim = await as({ sub: 'kim', email: 'kim@acme.example', name: 'Kim', groups: ['weave-admins'] });
    const agents = (await (await kim.get('/agents')).json()) as Array<{ did: string; name: string; personName: string; spaces: Array<{ id: string; name: string; approved: boolean }> }>;
    expect(agents).toEqual([expect.objectContaining({ name: 'helper', personName: 'Noah', spaces: [expect.objectContaining({ name: 'Acme', approved: false })] })]);
    expect((await noah.agentBlocked('helper')).map((s) => s.name)).toEqual(['Acme']);
    expect((await kim.post('/agent', { space: agents[0].spaces[0].id, agent: agents[0].did })).status).toBe(200);
    expect(((await (await kim.get('/agents')).json()) as typeof agents)[0].spaces[0].approved).toBe(true);
    sync(acme, noah);
    expect(await noah.agentBlocked('helper')).toEqual([]);

    // An auditor reads everything and changes nothing.
    const ada = await as({ sub: 'ada', email: 'ada@acme.example', name: 'Ada', groups: ['weave-auditors'] });
    expect(await (await ada.get('/me')).json()).toMatchObject({ role: 'auditor' });
    for (const path of ['/company', '/members', '/agents', '/devices', '/audit', '/scim', '/streams']) expect((await ada.get(path)).status, path).toBe(200);
    expect((await ada.post('/agent', { space: agents[0].spaces[0].id, agent: agents[0].did, on: false })).status).toBe(403);
    expect((await ada.post('/enroll-link', {})).status).toBe(403);
    expect((await ada.post('/action', { action: 'space', kind: 'project', name: 'Sneaky' })).status).toBe(403);

    // The helpdesk sets people up, and sees nothing else.
    const hal = await as({ sub: 'hal', email: 'hal@acme.example', name: 'Hal', groups: ['weave-helpdesk'] });
    expect(await (await hal.get('/me')).json()).toMatchObject({ role: 'helpdesk' });
    expect((await hal.get('/members')).status).toBe(200);
    expect((await hal.get('/devices')).status).toBe(200);
    expect((await hal.post('/enroll-link', { days: 7 })).status).toBe(200);
    for (const path of ['/audit', '/agents', '/scim', '/streams']) expect((await hal.get(path)).status, path).toBe(403);
    expect((await hal.post('/action', { action: 'freeze', person: noah.identity.author })).status).toBe(403);
    // An admin's identity (the company's own included) is recovered by an admin, never the helpdesk (oreXqcSP).
    expect((await hal.post('/recovery', { person: acme.identity.author, request: 'x' })).status).toBe(403);

    // Searching the audit: by person, by words, by date.
    type Lines = { lines: Array<{ kind: string; by: string; detail: Record<string, unknown> }> };
    const search = async (query: string) => ((await (await kim.get(`/audit?${query}`)).json()) as Lines).lines;
    const noahs = await search(`person=${encodeURIComponent(noah.identity.author)}`);
    expect(noahs.length).toBeGreaterThan(0);
    expect(noahs.every((l) => l.by === noah.identity.author || JSON.stringify(l.detail).includes(noah.identity.author) || JSON.stringify(l.detail).includes('noah'))).toBe(true);
    expect(noahs.some((l) => l.kind === 'weave.org.console' && l.detail.action === 'agent-on')).toBe(false); // Kim did that, about the agent
    expect((await search('q=agent-on')).map((l) => `${l.detail.subject}:${l.detail.action}`)).toEqual(['kim:agent-on']);
    expect((await search('q=helpdesk%20enroll-link')).map((l) => `${l.detail.subject}:${l.detail.role}`)).toEqual(['hal:helpdesk']);
    const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    expect(await search(`since=2020-01-01&until=${yesterday}`)).toEqual([]);
    expect((await search(`since=${new Date().toISOString().slice(0, 10)}`)).length).toBeGreaterThan(0);

    await noah.close();
    await acme.close();
  });
});
