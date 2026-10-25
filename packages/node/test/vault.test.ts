import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { b64u } from '@weave/core';
import { closeOpenStores, resolveHome, WeaveNode } from '../src/index.ts';
import { forgetVaults, readSecretJson, vaultOf } from '../src/vault.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});
const temp = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-vault-'));
  dirs.push(dir);
  return dir;
};

describe('keys at rest', () => {
  it('seals every file with a secret key, and opens them again in a new process', async () => {
    const dir = temp();
    const node = WeaveNode.init('Martin', dir);
    await node.createProject({ name: 'Weave' });
    await node.addAgent('helper', ['weave.post']);
    const did = node.identity.did;
    await node.close();
    const home = resolveHome(dir);
    const files = [home.identity, home.encryption, ...readdirSync(home.groups).map((f) => join(home.groups, f)), ...readdirSync(home.agents).map((f) => join(home.agents, f))];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      expect(text).toContain('"weaveSealed": 1');
      expect(text).not.toMatch(/secretKey|"keys"/);
    }
    forgetVaults();
    const again = WeaveNode.open(dir);
    expect(again.identity.did).toBe(did);
    expect((await again.spaces('project')).map((s) => s.name)).toEqual(['Weave']);
    expect((await again.status()).keystore).toBe('file');
    await again.close();
  });

  it('seals files from before when it reads them', async () => {
    const dir = temp();
    const node = WeaveNode.init('Martin', dir);
    const home = resolveHome(dir);
    const plain = readSecretJson<Record<string, unknown>>(home, home.identity)!;
    await node.close();
    // As an older Weave left it: in the clear, a GitHub token too.
    writeFileSync(home.identity, JSON.stringify(plain));
    writeFileSync(join(dir, 'github.json'), JSON.stringify({ token: 'gho_secret', login: 'martl' }));
    forgetVaults();
    const again = WeaveNode.open(dir);
    expect(again.identity.did).toBe(plain.did);
    expect(readFileSync(home.identity, 'utf8')).toContain('"weaveSealed": 1');
    expect(readFileSync(join(dir, 'github.json'), 'utf8')).not.toContain('gho_secret');
    await again.close();
  });

  it('refuses a copied home whose keystore holds another key, and files swapped between places', async () => {
    const dir = temp();
    const node = WeaveNode.init('Martin', dir);
    await node.addAgent('one', ['weave.post']);
    await node.addAgent('two', ['weave.msg']);
    await node.close();
    // Another computer: its keystore gives back a different home key.
    const copy = temp();
    cpSync(dir, copy, { recursive: true });
    const vault = JSON.parse(readFileSync(join(copy, 'vault.json'), 'utf8'));
    writeFileSync(join(copy, 'vault.json'), JSON.stringify({ ...vault, keystore: 'dpapi', key: b64u.encode(new Uint8Array(32)) }));
    forgetVaults();
    expect(() => WeaveNode.open(copy)).toThrow(/locked to the computer and user it was made on.*recovery words/);
    // One agent's file put in the other's place doesn't open.
    const agents = resolveHome(dir).agents;
    cpSync(join(agents, 'one.json'), join(agents, 'two.json'));
    forgetVaults();
    expect(() => WeaveNode.open(dir)).toThrow();
  });

  it('wraps the home key with the operating system’s keystore', () => {
    const dir = temp();
    const before = process.env.WEAVE_KEYSTORE;
    delete process.env.WEAVE_KEYSTORE;
    try {
      const home = resolveHome(dir);
      const vault = vaultOf(home);
      const expected = { win32: 'dpapi', darwin: 'keychain', linux: 'secret-service' }[process.platform as string];
      // Where the keystore isn't there (a Linux box without Secret Service), Weave says so.
      if (vault.keystore === 'file') expect(vault.warning).toMatch(/not protected/);
      else expect(vault.keystore).toBe(expected);
      const stored = readFileSync(join(dir, 'vault.json'), 'utf8');
      if (vault.keystore !== 'file') expect(stored).not.toContain(b64u.encode(vault.key));
      forgetVaults();
      expect(b64u.encode(vaultOf(home).key)).toBe(b64u.encode(vault.key));
    } finally {
      if (before !== undefined) process.env.WEAVE_KEYSTORE = before;
      forgetVaults();
    }
  });
});
