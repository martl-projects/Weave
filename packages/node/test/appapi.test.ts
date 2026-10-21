import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer, request, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { loadConfig, resolveHome, saveConfig, WeaveNode, closeOpenStores } from '../src/index.ts';

// The SDK as apps use it: plain CommonJS.
const sdk = createRequire(import.meta.url)('../../sdk/src/index.cjs') as typeof import('../../sdk/src/index.d.cts');

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

async function until<T>(get: () => Promise<T> | T, timeoutMs = 30_000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await get();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

const getJson = (port: number, path: string) =>
  new Promise<unknown>((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, agent: false }, (res) => {
      let body = '';
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve(JSON.parse(body)));
    });
    req.on('error', reject);
    req.end();
  });

describe('the app API and SDK', () => {
  let testnet: Testnet;
  let app: Server;
  let appPort: number;
  let weave: InstanceType<typeof sdk.Weave> | undefined;
  const nodes: WeaveNode[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
    // The "app": answers every request with who sent it, as Weave tells it.
    app = createServer((req, res) => {
      weave!.who(req).then(
        (who) => res.end(JSON.stringify(who ?? null)),
        (error: Error) => res.end(JSON.stringify({ error: error.message })),
      );
    });
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    appPort = (app.address() as { port: number }).port;
  });

  afterAll(async () => {
    for (const node of nodes) await node.close();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await testnet.destroy();
  });

  function person(name: string): WeaveNode {
    const dir = mkdtempSync(join(tmpdir(), 'weave-appapi-'));
    dirs.push(dir);
    const node = WeaveNode.init(name, dir);
    const home = resolveHome(dir);
    node.config = { ...loadConfig(home), bootstrap: testnet.bootstrap };
    saveConfig(home, node.config);
    nodes.push(node);
    return node;
  }

  it('tells the app who is behind each connection, and what they may do', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Gameshow' });
    await martin.createGroup('Supporters');
    await martin.publishApp({ project: 'Gameshow', manifest: { app: 'quizshow', name: 'Quiz', services: [{ id: 'show', port: appPort }] } });
    await lena.joinSpace(await martin.invite('Gameshow'));
    await lena.joinSpace(await martin.invite('Supporters'));
    await martin.goOnline();
    await lena.goOnline();

    const env = await martin.appEnv('Gameshow');
    expect(env.WEAVE_API).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
    expect(sdk.connect({})).toBeUndefined();
    weave = sdk.connect(env);

    const hosted = await martin.hostRoom({ project: 'Gameshow', name: 'Saturday show' });
    const seen = await until(async () => (await lena.rooms('Gameshow'))[0]);
    await lena.joinRoom(seen.id);
    const url = await until(async () => (await lena.rooms('Gameshow'))[0].url);

    // Lena, through the room: the app learns it's her, not just "127.0.0.1".
    expect(await getJson(Number(new URL(url).port), '/play')).toEqual({
      did: lena.identity.author,
      name: 'Lena',
      host: false,
      member: true,
      maintainer: false,
      room: { id: hosted.id, name: 'Saturday show' },
    });
    // The host's own browser, straight to the app: the host.
    expect(await getJson(appPort, '/host')).toMatchObject({ did: martin.identity.author, host: true, maintainer: true });
    // Someone on the network, not through Weave: nobody Weave knows.
    expect(await weave!.who({ address: '192.168.1.20', port: 50000 })).toBeUndefined();

    const project = await weave!.project();
    expect(project).toMatchObject({ name: 'Gameshow', host: { did: martin.identity.author, name: 'Martin' }, rooms: [{ id: hosted.id, name: 'Saturday show' }] });
    expect(project.rooms[0].people.map((p) => p.name).sort()).toEqual(['Lena', 'Martin']);
    expect(project.groups.map((g) => g.name)).toEqual(['Supporters']);

    const access = await until(async () => {
      const a = await weave!.access(lena.identity.author, { group: 'Supporters' });
      return a.groups.length ? a : undefined;
    });
    expect(access).toMatchObject({ did: lena.identity.author, member: true, groups: [{ name: 'Supporters' }] });
    await expect(weave!.access(lena.identity.author, { group: 'Somebody else’s group' })).rejects.toMatchObject({ status: 404 });

    // Another token gets nothing.
    await expect(new sdk.Weave({ api: env.WEAVE_API, token: 'not-the-token' }).me()).rejects.toMatchObject({ status: 401 });
  }, 90_000);
});
