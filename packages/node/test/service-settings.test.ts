import { createHash } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { checkManifest, KIND_SERVICE_SETTING, resolveNet, serviceSettingsOf, type Did, type Entry } from '@weave/core';
import { startApi } from '../src/api.ts';
import { WeaveNode, closeOpenStores } from '../src/index.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * A service's settings kept in its space by the maintainers: any of them sets what it needs, a secret blind (only the
 * service can read it back), a sign-in through the provider's page; the node running it renews the sign-in and hands
 * the service a current token. Members who aren't maintainers can't change them.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-service-settings-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};

let component: string;
beforeAll(async () => {
  component = await buildComponent(join(import.meta.dirname, 'helpers', 'wasm-bot.js'), 'service');
}, 180_000);

const OAUTH = { authorize: 'https://provider.test/authorize', token: 'https://provider.test/token', client: 'weave-test', scopes: ['calendar.read'] };

describe('settings kept in a space', () => {
  it('count only from maintainers, the latest per service and name', () => {
    const service = 'did:key:z6MknXmKwnZeniyakNsBzjTgmYMXAct3B9izvVdkzKyCCd5g' as Did;
    const at = (n: number, author: string, body: Record<string, unknown>): Entry => ({ id: `e${n}`, kind: KIND_SERVICE_SETTING, body: { service, ...body } as never, event: { author, time: `2026-10-28T10:0${n}:00Z`, seq: n, signer: author } as never });
    const entries = [at(1, 'did:key:zMartl', { name: 'REGION', value: 'eu-central-1' }), at(2, 'did:key:zLena', { name: 'REGION', value: 'us-east-1' }), at(3, 'did:key:zMartl', { name: 'BUCKET', value: 'weave' }), at(4, 'did:key:zMartl', { name: 'BUCKET' })];
    const kept = serviceSettingsOf(entries, new Set(['did:key:zMartl' as Did]), service);
    expect(kept.map((s) => [s.name, s.value])).toEqual([['REGION', 'eu-central-1']]);
  });

  it('fill the hosts a contract names from them', () => {
    expect(resolveNet(['{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com', 'api.example.com'], { S3_BUCKET: 'Weave-Files', S3_REGION: 'eu-central-1' })).toEqual(['weave-files.s3.eu-central-1.amazonaws.com', 'api.example.com']);
    // Never a wildcard or another host smuggled in, and nothing for a setting that isn't there.
    expect(resolveNet(['{S3_BUCKET}.s3.amazonaws.com'], { S3_BUCKET: '*' })).toEqual([]);
    expect(resolveNet(['{S3_BUCKET}.s3.amazonaws.com'], { S3_BUCKET: 'evil.com/x' })).toEqual([]);
    expect(resolveNet(['{S3_BUCKET}.s3.amazonaws.com'], {})).toEqual([]);
    const checked = checkManifest({ app: 'files', name: 'Files', service: { reads: 'addressed', writes: [], net: ['{S3_BUCKET}.s3.{S3_REGION}.amazonaws.com'], version: '1.0' }, env: [{ name: 'S3_BUCKET', label: 'Bucket' }, { name: 'CAL', label: 'Calendar', oauth: OAUTH }, { name: 'BAD', label: 'Bad', oauth: { authorize: 'http://x.test/a', token: 'https://x.test/t', client: 'c' } }] });
    expect(checked.problems.join(' ')).toMatch(/env\[2\]: "oauth" names the provider/);
    expect(checked.problems.join(' ')).not.toMatch(/service\.net/);
  });
});

describe('a service whose settings its space keeps', { timeout: 120_000 }, () => {
  it('reads what the maintainers set, a secret blind, and a sign-in kept current', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Weave' });
    await lena.joinSpace(await martl.invite('Weave'));
    sync([martl, lena]);
    // The provider: a token page that grants once, then renews.
    const asked: URLSearchParams[] = [];
    martl.oauthSetup.fetch = async (url, init) => {
      expect(String(url)).toBe(OAUTH.token);
      const params = new URLSearchParams(String(init?.body));
      asked.push(params);
      const body = params.get('grant_type') === 'authorization_code' ? { access_token: 'tok-1', refresh_token: 'r-1', expires_in: 60 } : { access_token: 'tok-2', expires_in: 3600 };
      return new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
    };
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({
        name: 'bot',
        contract: { reads: 'addressed', writes: [], version: '1.0' },
        spaces: ['Weave'],
        wasm: component,
        asks: [{ name: 'GREETING', label: 'Greeting' }, { name: 'API_KEY', label: 'API key', secret: true, optional: true }, { name: 'CAL', label: 'Calendar', oauth: OAUTH }],
        settings: { GREETING: 'hello' },
      });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      sync([martl, lena]);
      let n = 0;
      const ask = async (text: string) => {
        const tag = `${text} #${++n}`;
        await lena.askService({ space: 'Weave', service: 'martl/bot', text: tag.startsWith('setting:') ? text : tag });
        sync([martl, lena]);
        return text;
      };
      const answerTo = async (text: string) => {
        let got: string | undefined;
        await vi.waitFor(
          async () => {
            sync([martl, lena]);
            const requests = await lena.serviceRequests({ space: 'Weave', service: 'martl/bot' });
            got = requests.filter((r) => r.text === text && r.results.length).at(-1)?.results[0].text;
            expect(got).toBeDefined();
          },
          { timeout: 30_000, interval: 200 },
        );
        return got!;
      };

      // Its person's setting, and what its space asks for, as its profile says.
      expect(await answerTo(await ask('setting:GREETING'))).toBe('hello');
      const before = await lena.serviceSettings({ space: 'Weave', service: 'martl/bot' });
      expect(before).toMatchObject({ mayChange: false, missing: ['GREETING', 'CAL'] });
      expect(before.asks.map((a) => a.name)).toEqual(['GREETING', 'API_KEY', 'CAL']);

      // A member who isn't a maintainer can't change them.
      await expect(lena.setServiceSetting({ space: 'Weave', service: 'martl/bot', name: 'GREETING', value: 'hacked' })).rejects.toThrow(/only the maintainers/);

      // A maintainer's setting counts over its person's, and it starts again with it.
      await martl.setServiceSetting({ space: 'Weave', service: 'martl/bot', name: 'GREETING', value: 'servus' });
      sync([martl, lena]);
      await vi.waitFor(async () => expect(await answerTo(await ask('setting:GREETING'))).toBe('servus'), { timeout: 30_000, interval: 500 });

      // A secret: set blind. Nobody reads it back (not even who set it), but the service does.
      const set = await martl.setServiceSetting({ space: 'Weave', service: 'martl/bot', name: 'API_KEY', value: 'sk-secret-123' });
      expect(set.settings.find((s) => s.name === 'API_KEY')).toMatchObject({ secret: true, by: { name: 'martl' } });
      expect(set.settings.find((s) => s.name === 'API_KEY')).not.toHaveProperty('value');
      sync([martl, lena]);
      expect(JSON.stringify(await lena.serviceSettings({ space: 'Weave', service: 'martl/bot' }))).not.toContain('sk-secret');
      await vi.waitFor(async () => expect(await answerTo(await ask('setting:API_KEY'))).toBe('sk-secret-123'), { timeout: 30_000, interval: 500 });
      await expect(martl.setServiceSetting({ space: 'Weave', service: 'martl/bot', name: 'OTHER', value: 'x' })).rejects.toThrow(/doesn't ask for OTHER/);
      await expect(martl.setServiceSetting({ space: 'Weave', service: 'martl/bot', name: 'CAL', value: 'typed' })).rejects.toThrow(/is a sign-in/);

      // A sign-in: the provider's page, back to this computer with a code, exchanged with PKCE, boxed to the service.
      const { id, url } = await martl.startServiceSignIn({ space: 'Weave', service: 'martl/bot', name: 'CAL' });
      const page = new URL(url);
      expect(page.origin + page.pathname).toBe(OAUTH.authorize);
      expect(page.searchParams.get('client_id')).toBe('weave-test');
      expect(page.searchParams.get('scope')).toBe('calendar.read');
      expect(page.searchParams.get('redirect_uri')).toMatch(/^http:\/\/127\.0\.0\.1:\d+\/$/);
      // The provider sends the browser back (a wrong state gets nowhere).
      expect((await fetch(`${page.searchParams.get('redirect_uri')}?code=c-1&state=wrong`)).status).toBe(404);
      await fetch(`${page.searchParams.get('redirect_uri')}?code=c-1&state=${page.searchParams.get('state')}`);
      const signedIn = await martl.finishServiceSignIn({ id });
      expect(signedIn.settings.find((s) => s.name === 'CAL')).toMatchObject({ secret: true, oauth: true });
      expect(signedIn.missing).toEqual([]);
      const exchange = asked[0];
      expect(exchange.get('code')).toBe('c-1');
      expect(createHash('sha256').update(exchange.get('code_verifier')!).digest('base64url')).toBe(page.searchParams.get('code_challenge'));

      // The grant runs out within minutes: the node renews it before handing the service a token.
      sync([martl, lena]);
      await vi.waitFor(async () => expect(await answerTo(await ask('setting:CAL'))).toBe('tok-2'), { timeout: 30_000, interval: 500 });
      expect(asked.find((p) => p.get('grant_type') === 'refresh_token')?.get('refresh_token')).toBe('r-1');
      expect(JSON.stringify(lena.replica.events())).not.toContain('r-1"');
    } finally {
      await martl.removeService('bot').catch(() => {});
      await api.close();
    }
  });

  it('signs a service in with a code: no secret, nothing coming back to this computer', async () => {
    const DEVICE = { device: 'https://provider.test/device', token: 'https://provider.test/token', client: 'weave-test', scopes: ['repo'] };
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createProject({ name: 'Code' });
    await lena.joinSpace(await martl.invite('Code'));
    sync([martl, lena]);
    // The provider: a code, then "not yet" twice and "slower" once before the token; or, the second time, a no.
    const asked: Array<{ url: string; params: URLSearchParams }> = [];
    let declined = false;
    martl.oauthSetup.fetch = async (url, init) => {
      const params = new URLSearchParams(String(init?.body));
      asked.push({ url: String(url), params });
      const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { 'content-type': 'application/json' } });
      if (String(url) === DEVICE.device) return json({ device_code: 'd-1', user_code: 'WDJB-MJHT', verification_uri: 'https://provider.test/login/device', expires_in: 60, interval: 0.01 });
      if (declined) return json({ error: 'access_denied', error_description: 'The user has denied your application access.' });
      const polls = asked.filter((a) => a.url === DEVICE.token).length;
      if (polls <= 2) return json({ error: 'authorization_pending', error_description: 'The authorization request is still pending.' });
      if (polls === 3) return json({ error: 'slow_down', interval: 1 });
      return json({ access_token: 'gho-device', token_type: 'bearer', scope: 'repo' });
    };
    const api = await startApi(martl, 0, { service: (token) => martl.serviceGate(token) });
    martl.runServices({ port: api.port });
    try {
      await martl.addService({ name: 'bot', contract: { reads: 'addressed', writes: [], version: '1.0' }, spaces: ['Code'], wasm: component, asks: [{ name: 'GH', label: 'GitHub', oauth: DEVICE }] });
      await vi.waitFor(async () => expect((await martl.services())[0].running).toBe(true), { timeout: 30_000, interval: 200 });
      // Only maintainers sign it in.
      sync([martl, lena]);
      await expect(lena.startServiceSignIn({ space: 'Code', service: 'martl/bot', name: 'GH' })).rejects.toThrow(/only the maintainers/);

      const started = await martl.startServiceSignIn({ space: 'Code', service: 'martl/bot', name: 'GH' });
      expect(started).toMatchObject({ url: 'https://provider.test/login/device', code: 'WDJB-MJHT' });
      expect(asked[0].params.get('client_id')).toBe('weave-test');
      expect(asked[0].params.get('scope')).toBe('repo');
      const signedIn = await martl.finishServiceSignIn({ id: started.id });
      expect(signedIn.settings.find((x) => x.name === 'GH')).toMatchObject({ secret: true, oauth: true });
      const polls = asked.filter((a) => a.url === DEVICE.token);
      expect(polls.map((p) => p.params.get('grant_type'))).toEqual(Array(4).fill('urn:ietf:params:oauth:grant-type:device_code'));
      expect(polls[0].params.get('device_code')).toBe('d-1');
      expect(polls.every((p) => !p.params.has('client_secret'))).toBe(true);

      // The service gets the token; nobody else reads it.
      sync([martl, lena]);
      await lena.askService({ space: 'Code', service: 'martl/bot', text: 'setting:GH' });
      await vi.waitFor(async () => {
        sync([martl, lena]);
        expect((await lena.serviceRequests({ space: 'Code', service: 'martl/bot' }))[0]?.results[0]?.text).toBe('gho-device');
      }, { timeout: 30_000, interval: 300 });
      expect(JSON.stringify(lena.replica.events())).not.toContain('gho-device');

      // Declined on the provider's page: it says so.
      declined = true;
      const again = await martl.startServiceSignIn({ space: 'Code', service: 'martl/bot', name: 'GH' });
      await expect(martl.finishServiceSignIn({ id: again.id })).rejects.toThrow(/declined/);
    } finally {
      await martl.removeService('bot').catch(() => {});
      await api.close();
    }
  });
});
