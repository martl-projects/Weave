import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AzureKeyVaultProvider, LocalProvider, VaultTransitProvider } from '../src/keyproviders.ts';
import { resolveHome } from '../src/index.ts';
import { AzureStub, OidcStub, VaultStub } from './helpers/stubs.ts';

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

  it('azure: Key Vault RSA wrap bound to space and epoch, Entra sign-in by secret or a token issued to the person, and deleting the key', async () => {
    const azure = await new AzureStub(oidc).start();
    try {
      azure.createKey('weave');
      const spec = { kind: 'azure' as const, vault: azure.url, key: 'weave', tenant: 'acme', clientId: 'weave-app', authority: azure.url };
      const service = new AzureKeyVaultProvider(spec, { azureClientSecret: azure.secret });
      const wrapped = await service.wrap(key, ctx);
      expect(await service.unwrap(wrapped, ctx)).toEqual(key);
      await expect(service.unwrap(wrapped, { ...ctx, epoch: 3 })).rejects.toThrow(/another space or epoch/);
      // An employee, through Entra with their company sign-in (no secret on the laptop).
      // An employee: a Key Vault token issued to them from their own sign-in (delegated), not an app's credentials.
      const asAda = async () => oidc.token({ sub: 'ada@acme', aud: 'https://vault.azure.net' });
      const ada = new AzureKeyVaultProvider(spec, { delegated: asAda });
      expect(await ada.unwrap(wrapped, ctx)).toEqual(key);
      expect(azure.log.at(-1)).toEqual({ op: 'unwrapkey', sub: 'ada@acme' });
      azure.disable('ada@acme');
      await expect(new AzureKeyVaultProvider(spec, { delegated: asAda }).unwrap(wrapped, ctx)).rejects.toThrow(/refused/);
      // A sign-in token alone is no way in: it isn't a Key Vault token.
      const idToken = oidc.token({ sub: 'ada@acme' });
      await expect(new AzureKeyVaultProvider(spec, { idToken: () => idToken }).unwrap(wrapped, ctx)).rejects.toThrow(/sign in with your company in the app/);
      // Deleting the key: nothing opens any more.
      await service.destroy();
      expect(azure.hasKey('weave')).toBe(false);
      await expect(service.unwrap(wrapped, ctx)).rejects.toThrow();
    } finally {
      await azure.stop();
    }
  });
});
