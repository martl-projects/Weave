import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores, moveHomeKeyToKeyService, resolveHome, unlockHomeKey } from '../src/index.ts';
import type { ProviderSpec, VaultCredentials } from '../src/keyproviders.ts';
import { forgetVaults } from '../src/vault.ts';
import { AwsStub, GcpStub, OidcStub } from './helpers/stubs.ts';

/*
 * A company on AWS KMS or Google Cloud KMS (stage 16), end to end: its server signs in with its own credentials,
 * a colleague enrolls with nothing but their company sign-in and reads the company's group, the key service sees
 * them by name, and the server's own home key opens only through the key service.
 */

const dirs: string[] = [];
let oidc: OidcStub;
let aws: AwsStub;
let gcp: GcpStub;
beforeAll(async () => {
  oidc = await new OidcStub().start();
  aws = await new AwsStub(oidc).start();
  gcp = await new GcpStub(oidc).start();
});
afterAll(async () => {
  closeOpenStores();
  await aws.stop();
  await gcp.stop();
  await oidc.stop();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function dir(): string {
  const made = mkdtempSync(join(tmpdir(), 'weave-cloudkms-'));
  dirs.push(made);
  return made;
}
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));
const settle = () => new Promise((r) => setTimeout(r, 300));

async function companyOn(provider: ProviderSpec, server: VaultCredentials, principalOf: () => string[]) {
  const home = dir();
  const acme = WeaveNode.init('Acme', home);
  acme.kmsCredentials = server;
  await acme.createCompany({ name: 'Acme', provider: provider as never, issuer: oidc.issuer, audience: 'weave', admins: 'weave-admins' });
  await settle();
  await acme.say({ space: 'Acme', text: 'welcome to Acme' });

  // Kofi enrolls with his company sign-in only: no keys of the key service on his computer.
  const kofi = await WeaveNode.enroll(await acme.enrollLink(), dir(), { idToken: ({ nonce }) => oidc.token({ nonce, sub: 'kofi', email: 'kofi@acme.example', groups: ['employees'] }), name: 'Kofi' });
  sync(acme, kofi);
  sync(kofi, acme);
  await kofi.reconcile();
  await settle();
  sync(kofi, acme);
  await acme.reconcile();
  sync(acme, kofi);
  await kofi.reconcile();
  expect((await kofi.messages('Acme')).map((m) => m.text)).toContain('welcome to Acme');
  expect(principalOf().length).toBeGreaterThan(0);

  // The server's own home key, into the key service: a copy of the home opens nothing without it.
  await moveHomeKeyToKeyService(resolveHome(home), provider, server);
  await acme.close();
  await kofi.close();
  forgetVaults();
  expect(() => WeaveNode.open(home)).toThrow(/key service/);
  await expect(unlockHomeKey(resolveHome(home), {})).rejects.toThrow(/didn't open it/);
  await unlockHomeKey(resolveHome(home), server);
  const again = WeaveNode.open(home);
  again.kmsCredentials = server;
  expect((await again.company())?.name).toBe('Acme');
  await again.close();
}

describe('a company on a cloud key service', { timeout: 120_000 }, () => {
  it('runs on AWS KMS: the server with its IAM keys, colleagues through the role their sign-in takes on', async () => {
    const key = aws.createKey('acme');
    const role = aws.createRole('weave-employees');
    await companyOn({ kind: 'aws', region: aws.region, key, role, endpoint: aws.url, sts: aws.url }, { aws: aws.createUser('weave-server') }, () =>
      aws.log.filter((l) => l.op === 'Decrypt' && l.principal === 'assumed-role/weave-employees/weave-kofi@acme.example').map((l) => l.principal),
    );
    // Every wrap is bound to its space and epoch.
    expect(aws.log.filter((l) => l.op === 'Encrypt').every((l) => l.context?.startsWith('weave/'))).toBe(true);
  });

  it('runs on Google Cloud KMS: the server with its service account, colleagues through workload identity', async () => {
    const key = gcp.createKey('acme');
    await companyOn({ kind: 'gcp', key, workload: gcp.workload, endpoint: gcp.url, sts: `${gcp.url}/v1/token` }, { gcpServiceAccount: gcp.createServiceAccount('weave-server') }, () =>
      gcp.log.filter((l) => l.op === 'decrypt' && l.principal.endsWith('/subject/kofi')).map((l) => l.principal),
    );
  });
});
