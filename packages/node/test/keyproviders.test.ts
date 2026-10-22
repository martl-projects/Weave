import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { LocalProvider, VaultTransitProvider } from '../src/keyproviders.ts';
import { resolveHome } from '../src/index.ts';
import { OidcStub, VaultStub } from './helpers/stubs.ts';

const dirs: string[] = [];
let oidc: OidcStub;
let vault: VaultStub;
beforeAll(async () => {
  oidc = await new OidcStub().start();
  vault = await new VaultStub(oidc).start();
});
afterAll(async () => {
  await vault.stop();
  await oidc.stop();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const key = new Uint8Array(32).fill(9);
const ctx = { space: 'project:abc', epoch: 2 };

describe('key providers', () => {
  it('local: wraps with the home vault, bound to space and epoch', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'weave-kp-'));
    dirs.push(dir);
    const local = new LocalProvider(resolveHome(dir));
    const wrapped = await local.wrap(key, ctx);
    expect(await local.unwrap(wrapped, ctx)).toEqual(key);
    await expect(local.unwrap(wrapped, { ...ctx, epoch: 3 })).rejects.toThrow();
  });

  it('vault: Transit with a derivation context, a token or the person’s SSO token, and destroying the key', async () => {
    vault.createKey('weave');
    const spec = { kind: 'vault' as const, address: vault.address, key: 'weave', jwt: { role: 'employees' } };
    const byToken = new VaultTransitProvider(spec, { token: vault.rootToken });
    const wrapped = await byToken.wrap(key, ctx);
    expect(wrapped).toMatch(/^vault:v1:/);
    expect(await byToken.unwrap(wrapped, ctx)).toEqual(key);
    await expect(byToken.unwrap(wrapped, { ...ctx, space: 'project:other' })).rejects.toThrow(/Vault failed/);

    // An employee signs in with their company account.
    const idToken = oidc.token({ sub: 'kofi@acme', groups: ['employees'] });
    const kofi = new VaultTransitProvider(spec, { idToken: () => idToken });
    expect(await kofi.unwrap(wrapped, ctx)).toEqual(key);
    expect(vault.audit.at(-1)).toMatchObject({ op: 'decrypt', sub: 'kofi@acme', context: 'weave/kms/v1:project:abc:2' });
    // Offboarded: Vault refuses.
    vault.disable('kofi@acme');
    await expect(kofi.unwrap(wrapped, ctx)).rejects.toThrow(/refused/);
    await expect(new VaultTransitProvider(spec, { idToken: () => idToken }).unwrap(wrapped, ctx)).rejects.toThrow(/refused the sign-in/);
    // A forged token isn't taken.
    const forged = oidc.token({ sub: 'mallory', signWith: (await import('node:crypto')).generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey });
    await expect(new VaultTransitProvider(spec, { idToken: () => forged }).unwrap(wrapped, ctx)).rejects.toThrow(/refused the sign-in/);

    // Shredding: the key is gone, and with it every wrapped part.
    await byToken.destroy();
    expect(vault.hasKey('weave')).toBe(false);
    await expect(byToken.unwrap(wrapped, ctx)).rejects.toThrow();
  });
});
