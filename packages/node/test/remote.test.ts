import { mkdtempSync, rmSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import HyperDHT from 'hyperdht';
import { connectTo, loadConfig, openTunnel, pairWith, PHONE_METHODS, resolveHome, RPC_METHODS, saveConfig, WeaveNode, type Dialer, type PostInfo, type RpcMethod, type Tunnel, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

async function until<T>(get: () => Promise<T> | T, timeoutMs = 20_000): Promise<NonNullable<T>> {
  const start = Date.now();
  for (;;) {
    const value = await get();
    if (value) return value as NonNullable<T>;
    if (Date.now() - start > timeoutMs) throw new Error('timed out');
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
}

describe('phones using a node remotely', () => {
  let testnet: Testnet;
  let node: WeaveNode;
  let dht: HyperDHT;

  beforeAll(async () => {
    testnet = await createTestnet(3);
    const dir = mkdtempSync(join(tmpdir(), 'weave-remote-'));
    dirs.push(dir);
    node = WeaveNode.init('martl', dir);
    node.config = { ...loadConfig(resolveHome(dir)), bootstrap: testnet.bootstrap };
    saveConfig(resolveHome(dir), node.config);
    await node.goOnline();
    // The phone: just a DHT to connect through, and its own key pair.
    dht = new HyperDHT({ bootstrap: testnet.bootstrap });
  });

  afterAll(async () => {
    await node.close();
    await dht.destroy();
    await testnet.destroy();
  });

  it('pairs a phone with a code, serves its calls and events, and forgets it when unpaired', async () => {
    await node.createProject({ name: 'Weave' });
    const phoneKeys = HyperDHT.keyPair();
    const dialer = dht as unknown as Dialer;

    const { link } = await node.pairPhone();
    expect(link).toMatch(/^weave:phone:/);
    const { node: paired, session } = await pairWith(dialer, link, phoneKeys, "martl's iPhone");
    expect(paired.name).toBe('martl');
    expect((await node.phones()).map((p) => [p.name, !!p.lastSeen])).toEqual([["martl's iPhone", true]]);

    // The phone uses the node like the desktop app does; the node signs what it posts.
    expect(await session.call<{ name: string }>('whoami')).toMatchObject({ name: 'martl', did: node.identity.author });
    const seen: string[] = [];
    session.onEvent((item) => seen.push(item.kind));
    const post = await session.call<PostInfo>('submit', { space: 'Weave', board: 'ideas', title: 'Posted from my phone' });
    expect(post).toMatchObject({ title: 'Posted from my phone', by: { did: node.identity.author } });
    await until(() => seen.length > 0);
    await expect(session.call('revokeKey', { key: 'x' })).rejects.toThrow(/a phone can't do revokeKey/);
    await expect(session.call('pairPhone')).rejects.toThrow(/a phone can't do pairPhone/);
    await expect(session.call('destroyCompanyKey', {})).rejects.toThrow(/a phone can't do destroyCompanyKey/);
    await expect(session.call('websiteEnv', 'x')).rejects.toThrow(/a phone can't do websiteEnv/);

    // A code works once; a stranger's key is turned away at the door.
    await expect(pairWith(dialer, link, HyperDHT.keyPair(), 'Thief')).rejects.toThrow();
    await expect(connectTo(dialer, paired, HyperDHT.keyPair())).rejects.toThrow();

    // The paired phone comes back later without a code.
    session.close();
    const again = await connectTo(dialer, paired, phoneKeys);
    expect((await again.call<PostInfo[]>('posts', { space: 'Weave', board: 'ideas' })).map((p) => p.title)).toEqual(['Posted from my phone']);

    // Unpaired: cut off at once, and refused from then on.
    const closed = new Promise<void>((resolve) => again.onClose(resolve));
    await node.unpairPhone((await node.phones())[0].key);
    await closed;
    expect(await node.phones()).toEqual([]);
    await expect(connectTo(dialer, paired, phoneKeys)).rejects.toThrow();
  }, 60_000);
});

/** Send a raw HTTP/1.0 request down a connection; what came back before it closed. */
/** An HTTP request through a tunnel, and its whole answer ('' when the computer refused the tunnel). */
async function fetchThrough(opening: Promise<Tunnel>, path: string): Promise<string> {
  const tunnel = await opening.catch(() => undefined);
  if (!tunnel) return '';
  const { socket, rest } = tunnel;
  return new Promise((resolve) => {
    let got = rest.toString('utf8');
    socket.on('data', (chunk: Buffer) => (got += chunk.toString('utf8')));
    socket.on('error', () => {});
    socket.on('close', () => resolve(got));
    socket.write(`GET ${path} HTTP/1.0\r\nHost: 127.0.0.1\r\n\r\n`);
  });
}

describe('a phone playing in a room its computer joined', () => {
  let testnet: Testnet;
  let app: Server;
  let appPort: number;
  let dht: HyperDHT;
  const nodes: WeaveNode[] = [];

  beforeAll(async () => {
    testnet = await createTestnet(3);
    app = createServer((req, res) => res.end(`the host's app, at ${req.url}`));
    await new Promise<void>((resolve) => app.listen(0, '127.0.0.1', () => resolve()));
    appPort = (app.address() as { port: number }).port;
    dht = new HyperDHT({ bootstrap: testnet.bootstrap });
  });

  afterAll(async () => {
    for (const node of nodes) await node.close();
    await dht.destroy();
    await new Promise<void>((resolve) => app.close(() => resolve()));
    await testnet.destroy();
  });

  function person(name: string): WeaveNode {
    const dir = mkdtempSync(join(tmpdir(), 'weave-remote-room-'));
    dirs.push(dir);
    const node = WeaveNode.init(name, dir);
    node.config = { ...loadConfig(resolveHome(dir)), bootstrap: testnet.bootstrap };
    saveConfig(resolveHome(dir), node.config);
    nodes.push(node);
    return node;
  }

  it("reaches that room's app through the computer, and nothing else", async () => {
    const host = person('Lena');
    const computer = person('martl');
    await host.createProject({ name: 'Pferderennen' });
    await computer.joinSpace(await host.invite('Pferderennen'));
    await host.goOnline();
    await computer.goOnline();
    await host.addService({ builtin: 'website', spaces: ['Pferderennen'] });
    const room = await host.openWebsite({ project: 'Pferderennen', name: 'Derby', port: appPort, pages: { joiner: { path: '/play', label: 'Play' } } });
    await until(async () => (await computer.websites('Pferderennen')).length);

    const phoneKeys = HyperDHT.keyPair();
    const dialer = dht as unknown as Dialer;
    const { node: paired, session } = await pairWith(dialer, (await computer.pairPhone()).link, phoneKeys, 'iPhone');

    // Not joined yet: the computer has no way into the room, so neither has the phone.
    expect(await fetchThrough(openTunnel(dialer, paired, phoneKeys, room.id), '/play')).toBe('');

    // Joined (from the phone, as it's allowed to): each connection reaches the host's app, through the computer's tunnel.
    await session.call('visitWebsite', room.id);
    await until(async () => (await computer.websites('Pferderennen'))[0].url);
    expect(await fetchThrough(openTunnel(dialer, paired, phoneKeys, room.id), '/play')).toMatch(/^HTTP\/1\.1 200[\s\S]*the host's app, at \/play$/);
    // The host sees the computer's person in the room, as ever: the phone is that person.
    expect((await host.websites('Pferderennen'))[0].peers.map((p) => p.name).sort()).toEqual(['Lena', 'martl']);

    // A key that isn't paired is turned away; a room that doesn't exist reaches nothing.
    expect(await fetchThrough(openTunnel(dialer, paired, HyperDHT.keyPair(), room.id), '/play')).toBe('');
    expect(await fetchThrough(openTunnel(dialer, paired, phoneKeys, 'no-such-room'), '/play')).toBe('');

    // A room the computer hosts itself: the phone reaches its app directly, as the host opens it.
    await computer.createProject({ name: 'Solitaire' });
    await computer.addService({ builtin: 'website', spaces: ['Solitaire'] });
    const own = await computer.openWebsite({ project: 'Solitaire', name: 'Alone', port: appPort });
    expect(await fetchThrough(openTunnel(dialer, paired, phoneKeys, own.id), '/')).toMatch(/the host's app, at \/$/);

    // Left on the computer: the way in is gone.
    await session.call('leaveWebsite', room.id);
    expect(await fetchThrough(openTunnel(dialer, paired, phoneKeys, room.id), '/play')).toBe('');

    // Unpaired while a tunnel is open: it's cut at once.
    await session.call('visitWebsite', room.id);
    await until(async () => (await computer.websites('Pferderennen'))[0].url);
    const { socket: open } = await openTunnel(dialer, paired, phoneKeys, room.id);
    const cut = new Promise<void>((resolve) => open.on('close', () => resolve()));
    open.on('error', () => {});
    open.write('GET /play HTTP/1.1\r\nHost: 127.0.0.1\r\n\r\n');
    await new Promise<void>((resolve) => open.once('data', () => resolve()));
    await computer.unpairPhone((await computer.phones())[0].key);
    await cut;
    session.close();
  }, 90_000);
});

describe('what a phone may call', () => {
  it('is a list of known methods, and leaves keys, exports, agents, company setup, apps and GitHub to the computer', () => {
    for (const method of PHONE_METHODS) expect(RPC_METHODS).toContain(method);
    const computerOnly: RpcMethod[] = [
      'addAgent', 'updateAgent', 'approveAgent', 'answerPermission', 'requestPermission', 'connectHarness', 'join', 'revokeKey', 'rotateRoot',
      'moveHomeKey', 'keystores', 'destroyCompanyKey', 'escrowRecovery', 'openEscrow', 'manageSpace', 'unlockSpace', 'link', 'signIn', 'companySignIn',
      'backup', 'exportSpace', 'createCompany', 'companyAction', 'enrollLink', 'inviteByEmail', 'setScim', 'scim', 'setConsole', 'consoleInfo', 'consoleOperatorLink',
      'addAuditStream', 'removeAuditStream', 'auditStreams', 'setHold', 'linkNode', 'publishApp', 'releaseApp', 'websiteEnv', 'openWebsite', 'addService',
      'setService', 'removeService', 'openInApp', 'linkRepo', 'shareGithub',
      'showGithubOnHub', 'pairPhone', 'phones', 'unpairPhone',
    ];
    for (const method of computerOnly) expect(PHONE_METHODS).not.toContain(method);
  });
});
