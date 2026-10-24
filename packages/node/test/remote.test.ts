import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import HyperDHT from 'hyperdht';
import { connectTo, loadConfig, pairWith, PHONE_METHODS, resolveHome, RPC_METHODS, saveConfig, WeaveNode, type Dialer, type PostInfo, type RpcMethod, closeOpenStores } from '../src/index.ts';

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
    await expect(session.call('appEnv', {})).rejects.toThrow(/a phone can't do appEnv/);

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

describe('what a phone may call', () => {
  it('is a list of known methods, and leaves keys, exports, agents, company setup, apps and GitHub to the computer', () => {
    for (const method of PHONE_METHODS) expect(RPC_METHODS).toContain(method);
    const computerOnly: RpcMethod[] = [
      'addAgent', 'updateAgent', 'approveAgent', 'answerPermission', 'requestPermission', 'connectHarness', 'join', 'revokeKey', 'rotateRoot',
      'moveHomeKey', 'keystores', 'destroyCompanyKey', 'escrowRecovery', 'openEscrow', 'manageSpace', 'unlockSpace', 'link', 'signIn', 'companySignIn',
      'backup', 'exportSpace', 'createCompany', 'companyAction', 'enrollLink', 'inviteByEmail', 'setScim', 'scim', 'setConsole', 'consoleInfo', 'consoleOperatorLink',
      'addAuditStream', 'removeAuditStream', 'auditStreams', 'setHold', 'linkNode', 'publishApp', 'releaseApp', 'setAppSetting', 'appEnv', 'hostRoom',
      'setAppFolder', 'installApp', 'launchApp', 'stopApp', 'openInApp', 'connectGithub', 'disconnectGithub', 'setGithubApp', 'linkRepo', 'shareGithub',
      'showGithubOnHub', 'pairPhone', 'phones', 'unpairPhone',
    ];
    for (const method of computerOnly) expect(PHONE_METHODS).not.toContain(method);
  });
});
