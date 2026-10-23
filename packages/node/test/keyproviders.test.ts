import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AwsKmsProvider, AzureKeyVaultProvider, envCredentials, GcpKmsProvider, LocalProvider, signV4, VaultTransitProvider } from '../src/keyproviders.ts';
import { resolveHome } from '../src/index.ts';
import { AwsStub, AzureStub, GcpStub, OidcStub, VaultStub } from './helpers/stubs.ts';

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

  it('signs AWS requests as AWS’s own test suite does (Signature Version 4)', () => {
    const credentials = { accessKeyId: 'AKIDEXAMPLE', secretAccessKey: 'wJalrXUtnFEMI/K7MDENG+bPxRfiCYEXAMPLEKEY' };
    const at = new Date('2015-08-30T12:36:00Z');
    // get-vanilla
    expect(signV4({ method: 'GET', url: 'https://example.amazonaws.com/' }, credentials, 'us-east-1', 'service', at).authorization).toBe(
      'AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/service/aws4_request, SignedHeaders=host;x-amz-date, Signature=5fa00fa31553b73ebf1942676e86291e8372ff2a2260956d9b8aae1d763fbf31',
    );
    // The IAM example from AWS's documentation: a query and a content type.
    expect(
      signV4({ method: 'GET', url: 'https://iam.amazonaws.com/?Action=ListUsers&Version=2010-05-08', headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8' } }, credentials, 'us-east-1', 'iam', at).authorization,
    ).toBe('AWS4-HMAC-SHA256 Credential=AKIDEXAMPLE/20150830/us-east-1/iam/aws4_request, SignedHeaders=content-type;host;x-amz-date, Signature=5d672d79c15b13162d9279b0855cfba6789a8edb4c82c400e06b5924a6f2b5d7');
  });

  it('aws: KMS with the space and epoch as encryption context, the server’s keys or a role taken on with the person’s sign-in, and deleting the key', async () => {
    const aws = await new AwsStub(oidc).start();
    try {
      const alias = aws.createKey('weave');
      const role = aws.createRole('weave-employees');
      const spec = { kind: 'aws' as const, region: aws.region, key: alias, role, endpoint: aws.url, sts: aws.url };
      const server = new AwsKmsProvider(spec, { aws: aws.createUser('weave-server') });
      const wrapped = await server.wrap(key, ctx);
      expect(wrapped).toMatch(/^aws:/);
      expect(await server.unwrap(wrapped, ctx)).toEqual(key);
      // Bound to its space and epoch.
      await expect(server.unwrap(wrapped, { ...ctx, epoch: 3 })).rejects.toThrow(/refused: InvalidCiphertextException/);
      // A wrong secret doesn't sign.
      await expect(new AwsKmsProvider(spec, { aws: { accessKeyId: aws.createUser('x').accessKeyId, secretAccessKey: 'wrong' } }).wrap(key, ctx)).rejects.toThrow(/InvalidSignatureException/);

      // A person: their company sign-in takes on the role, and KMS sees them by name.
      const person = new AwsKmsProvider(spec, { idToken: () => oidc.token({ sub: 'kofi', email: 'kofi@acme.example' }) });
      expect(await person.unwrap(wrapped, ctx)).toEqual(key);
      expect(aws.log.filter((l) => l.op === 'Decrypt').map((l) => l.principal)).toContain('assumed-role/weave-employees/weave-kofi@acme.example');
      expect(aws.log.find((l) => l.op === 'Encrypt')?.context).toBe('weave/kms/v1:project:abc:2');
      // A token for another app, or no role: no.
      await expect(new AwsKmsProvider(spec, { idToken: () => oidc.token({ sub: 'kofi', aud: 'something-else' }) }).unwrap(wrapped, ctx)).rejects.toThrow(/InvalidIdentityToken/);
      await expect(new AwsKmsProvider({ ...spec, role: 'arn:aws:iam::123456789012:role/nope' }, { idToken: () => oidc.token({ sub: 'kofi' }) }).unwrap(wrapped, ctx)).rejects.toThrow(/AccessDenied/);
      await expect(new AwsKmsProvider({ ...spec, role: undefined }, {}).unwrap(wrapped, ctx)).rejects.toThrow(/sign in with your company/);

      // Shredding schedules the key's deletion: nothing opens from then on.
      await server.destroy();
      expect(aws.keyState(alias)).toBe('PendingDeletion');
      await expect(server.unwrap(wrapped, ctx)).rejects.toThrow(/KMSInvalidStateException/);
    } finally {
      await aws.stop();
    }
  });

  it('gcp: Cloud KMS with the space and epoch as authenticated data, a service account or the person’s sign-in through workload identity, and destroying every version', async () => {
    const gcp = await new GcpStub(oidc).start();
    try {
      const path = gcp.createKey('weave');
      const spec = { kind: 'gcp' as const, key: path, workload: gcp.workload, endpoint: gcp.url, sts: `${gcp.url}/v1/token` };
      const account = gcp.createServiceAccount('weave-server');
      const server = new GcpKmsProvider(spec, { gcpServiceAccount: account });
      const wrapped = await server.wrap(key, ctx);
      expect(wrapped).toMatch(/^gcp:/);
      expect(await server.unwrap(wrapped, ctx)).toEqual(key);
      await expect(server.unwrap(wrapped, { ...ctx, space: 'project:other' })).rejects.toThrow(/refused: INVALID_ARGUMENT/);
      // The key file from the environment, as JSON or as a file.
      expect(envCredentials({ WEAVE_GCP_SERVICE_ACCOUNT: JSON.stringify(account) }).gcpServiceAccount?.client_email).toBe(account.client_email);
      // Another key signs nothing.
      await expect(new GcpKmsProvider(spec, { gcpServiceAccount: { ...account, private_key: gcp.createServiceAccount('other').private_key } }).wrap(key, ctx)).rejects.toThrow(/Google refused the service account/);

      // A person, through workload identity: their own principal.
      const person = new GcpKmsProvider(spec, { idToken: () => oidc.token({ sub: 'lena' }) });
      expect(await person.unwrap(wrapped, ctx)).toEqual(key);
      expect(gcp.log.filter((l) => l.op === 'decrypt').map((l) => l.principal)).toContain('principal://iam.googleapis.com/projects/123456/locations/global/workloadIdentityPools/acme/subject/lena');
      gcp.disable('lena');
      await expect(new GcpKmsProvider(spec, { idToken: () => oidc.token({ sub: 'lena' }) }).unwrap(wrapped, ctx)).rejects.toThrow(/Google refused the sign-in/);

      // A rotated key still opens what the older version wrapped; destroying takes every version.
      gcp.rotate(path);
      const newer = await server.wrap(key, ctx);
      expect(await server.unwrap(wrapped, ctx)).toEqual(key);
      expect(await server.unwrap(newer, ctx)).toEqual(key);
      await server.destroy();
      expect(gcp.keyStates(path)).toEqual(['DESTROY_SCHEDULED', 'DESTROY_SCHEDULED']);
      await expect(server.unwrap(newer, ctx)).rejects.toThrow(/FAILED_PRECONDITION/);
    } finally {
      await gcp.stop();
    }
  });
});
