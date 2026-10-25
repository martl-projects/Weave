import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, afterEach, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores, resolveHome } from '../src/index.ts';
import { forgetVaults, keystoresHere, moveHomeKey } from '../src/vault.ts';

/*
 * Hardware keystores (stage 17). The TPM is the real one, on Windows. The Secure Enclave and YubiKey run through
 * stand-ins for weave-se and ykman (test/helpers): the node's half (key agreement, sealing, asking again) is
 * what's tested; the hardware's half is untried here.
 */

const dirs: string[] = [];
const env = { ...process.env };
afterEach(() => {
  for (const name of ['WEAVE_KEYSTORE', 'WEAVE_SECURE_ENCLAVE_HELPER', 'WEAVE_YKMAN', 'FAKE_YUBIKEY_ABSENT', 'FAKE_YUBIKEY_SECRET', 'FAKE_SE_ABSENT']) {
    if (env[name] === undefined) delete process.env[name];
    else process.env[name] = env[name];
  }
});
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function dir(): string {
  const made = mkdtempSync(join(tmpdir(), 'weave-hw-'));
  dirs.push(made);
  return made;
}
const helper = (name: string) => JSON.stringify([process.execPath, join(import.meta.dirname, 'helpers', name)]);
const vaultFile = (home: string) => JSON.parse(readFileSync(join(home, 'vault.json'), 'utf8')) as Record<string, unknown>;
const tpmHas = (item: string) =>
  execFileSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `[Security.Cryptography.CngKey]::Exists('${item}', (New-Object Security.Cryptography.CngProvider('Microsoft Platform Crypto Provider')))`], { encoding: 'utf8' }).trim() === 'True';

/** A home with something sealed in it; read back after a "restart" (the vault forgotten), as a new process would. */
async function homeWithSecrets(): Promise<{ home: string; reopen(): Promise<string | undefined> }> {
  const home = dir();
  const node = WeaveNode.init('Hardy', home);
  const did = node.identity.author;
  await node.close();
  return {
    home,
    reopen: async () => {
      forgetVaults();
      const again = WeaveNode.open(home);
      const author = again.identity.author;
      await again.close();
      expect(author).toBe(did);
      return author;
    },
  };
}

describe('hardware keystores', { timeout: 120_000 }, () => {
  // A real TPM: on Windows computers that have one (CI's virtual machines may not, so it's skipped there).
  it.skipIf(process.platform !== 'win32' || !!process.env.CI)('keeps the home key in this computer’s TPM, and lets it go when moving away', async () => {
    const { home, reopen } = await homeWithSecrets();
    expect(keystoresHere().find((k) => k.keystore === 'tpm')?.ready).toBe(true);
    expect(moveHomeKey(resolveHome(home), 'tpm')).toEqual({ from: 'file', to: 'tpm' });
    const stored = vaultFile(home);
    expect(stored).toMatchObject({ keystore: 'tpm', item: expect.stringMatching(/^weave-/) });
    expect(stored.key).not.toBeUndefined();
    expect(tpmHas(stored.item as string)).toBe(true);
    await reopen();
    // Moving away removes the TPM's key.
    expect(moveHomeKey(resolveHome(home), 'file')).toEqual({ from: 'tpm', to: 'file' });
    expect(tpmHas(stored.item as string)).toBe(false);
    await reopen();

    // Asked for when a home is made: in the TPM from the start.
    process.env.WEAVE_KEYSTORE = 'tpm';
    const fresh = dir();
    const node = WeaveNode.init('Fresh', fresh);
    await node.close();
    const made = vaultFile(fresh);
    expect(made.keystore).toBe('tpm');
    forgetVaults();
    await WeaveNode.open(fresh).close();
    moveHomeKey(resolveHome(fresh), 'file');
    expect(tpmHas(made.item as string)).toBe(false);
  });

  it('keeps the home key behind a YubiKey’s challenge-response: without the key (or another one), nothing opens', async () => {
    process.env.WEAVE_YKMAN = helper('fake-ykman.mjs');
    const { home, reopen } = await homeWithSecrets();
    expect(moveHomeKey(resolveHome(home), 'yubikey')).toEqual({ from: 'file', to: 'yubikey' });
    expect(vaultFile(home)).toMatchObject({ keystore: 'yubikey', slot: 2, challenge: expect.stringMatching(/^[0-9a-f]{64}$/), sealed: expect.any(Object) });
    expect(vaultFile(home).key).toBeUndefined();
    await reopen();
    // Unplugged: the home stays shut, and says why.
    process.env.FAKE_YUBIKEY_ABSENT = '1';
    forgetVaults();
    expect(() => WeaveNode.open(home)).toThrow(/YubiKey|ykman/);
    // Another YubiKey answers differently: still shut.
    delete process.env.FAKE_YUBIKEY_ABSENT;
    process.env.FAKE_YUBIKEY_SECRET = 'someone-elses';
    forgetVaults();
    expect(() => WeaveNode.open(home)).toThrow();
    delete process.env.FAKE_YUBIKEY_SECRET;
    await reopen();
    // No YubiKey at all when choosing it: the move is refused and the home stays as it was.
    moveHomeKey(resolveHome(home), 'file');
    process.env.FAKE_YUBIKEY_ABSENT = '1';
    expect(() => moveHomeKey(resolveHome(home), 'yubikey')).toThrow(/a YubiKey/);
    expect(vaultFile(home).keystore).toBe('file');
    expect(keystoresHere().find((k) => k.keystore === 'yubikey')).toMatchObject({ ready: false });
  });

  it('keeps the home key behind a Secure Enclave key agreement (through the weave-se helper)', async () => {
    process.env.WEAVE_SECURE_ENCLAVE_HELPER = helper('fake-se.mjs');
    const { home, reopen } = await homeWithSecrets();
    expect(moveHomeKey(resolveHome(home), 'secure-enclave')).toEqual({ from: 'file', to: 'secure-enclave' });
    expect(vaultFile(home)).toMatchObject({ keystore: 'secure-enclave', blob: expect.any(String), peer: expect.any(String), sealed: expect.any(Object) });
    await reopen();
    // Moving straight on to another keystore works from here too.
    process.env.WEAVE_YKMAN = helper('fake-ykman.mjs');
    expect(moveHomeKey(resolveHome(home), 'yubikey')).toEqual({ from: 'secure-enclave', to: 'yubikey' });
    await reopen();
    // The enclave unreachable when choosing it: refused, nothing changed.
    process.env.FAKE_SE_ABSENT = '1';
    expect(() => moveHomeKey(resolveHome(home), 'secure-enclave')).toThrow(/Secure Enclave/);
    expect(vaultFile(home).keystore).toBe('yubikey');
  });

  it('is offered through the node: where the key can go, and moving it', async () => {
    process.env.WEAVE_YKMAN = helper('fake-ykman.mjs');
    const home = dir();
    const node = WeaveNode.init('Offered', home);
    const options = await node.keystores();
    expect(options.find((o) => o.current)?.keystore).toBe('file');
    expect(options.find((o) => o.keystore === 'yubikey')).toMatchObject({ ready: true, current: false });
    expect(await node.moveHomeKey({ to: 'yubikey' })).toEqual({ from: 'file', to: 'yubikey' });
    expect((await node.status()).keystore).toBe('yubikey');
    expect((await node.keystores()).find((o) => o.current)?.keystore).toBe('yubikey');
    await node.close();
  });
});
