// A company on one computer, to rehearse a pilot (or to show it): stand-ins
// for the company's sign-in and Vault, a local network, Weave Server, and the
// Weave app (in a browser) for an employee. Everything lives in .dev/company-demo.
//
//   node scripts/company-demo.ts standins        the sign-in (port 7701, with a page to pick who signs in),
//                                                Vault (7702) and a local DHT; keep it running
//   node scripts/company-demo.ts init            set up Acme with Weave Server (apps/server/dist, built first)
//   node scripts/company-demo.ts server          run it: admin console on http://localhost:7730
//   node scripts/company-demo.ts app <name>      the Weave app for an employee, on http://127.0.0.1:8771;
//                                                when it signs in, the sign-in address lands in signin-url.txt

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..');
const dir = join(root, '.dev', 'company-demo');
mkdirSync(dir, { recursive: true });
const stateFile = join(dir, 'standins.json');
const server = join(root, 'apps', 'server', 'dist', 'weave-server.mjs');
const cli = join(root, 'packages', 'cli', 'src', 'main.ts');
const [command, name = 'kofi'] = process.argv.slice(2);

const state = () => {
  if (!existsSync(stateFile)) throw new Error('start the stand-ins first: node scripts/company-demo.ts standins');
  return JSON.parse(readFileSync(stateFile, 'utf8')) as { issuer: string; vault: string; token: string; bootstrap: string };
};

if (command === 'standins') {
  const { OidcStub, VaultStub } = await import('../packages/node/test/helpers/stubs.ts');
  const createTestnet = (await import('hyperdht/testnet.js')).default as (n: number) => Promise<{ bootstrap: Array<{ host: string; port: number }> }>;
  const oidc = await new OidcStub().start(7701);
  oidc.people = [
    { sub: 'lena', email: 'lena@acme.example', name: 'Lena Brandt', groups: ['employees', 'engineering', 'weave-admins'] },
    { sub: 'kofi', email: 'kofi@acme.example', name: 'Kofi Mensah', groups: ['employees', 'engineering'] },
    { sub: 'ada', email: 'ada@acme.example', name: 'Ada Novak', groups: ['employees', 'leadership'] },
  ];
  const vault = await new VaultStub(oidc).start(7702);
  vault.createKey('acme');
  const testnet = await createTestnet(3);
  const [first] = testnet.bootstrap;
  writeFileSync(stateFile, JSON.stringify({ issuer: oidc.issuer, vault: vault.address, token: vault.rootToken, bootstrap: `${first.host}:${first.port}` }, null, 2));
  console.log(`stand-ins running: sign-in ${oidc.issuer}, Vault ${vault.address}, local network ${first.host}:${first.port}`);
  await new Promise(() => {});
}

if (command === 'init') {
  const s = state();
  const home = join(dir, 'server');
  const env = { ...process.env, WEAVE_HOME: home, WEAVE_VAULT_TOKEN: s.token, WEAVE_KEYSTORE: 'file' };
  // On the local network, not the public one.
  execFileSync(process.execPath, [cli, '--home', home, 'bootstrap', s.bootstrap], { stdio: 'inherit', env });
  execFileSync(
    process.execPath,
    [server, 'init', '--no-input', '--name', 'Acme', '--vault', s.vault, '--vault-key', 'acme', '--issuer', s.issuer, '--client-id', 'weave-app', '--admins', 'weave-admins', '--console-url', 'http://localhost:7730', '--scim', '7720'],
    { stdio: 'inherit', env },
  );
}

if (command === 'server') {
  const s = state();
  const child = spawn(process.execPath, [server, 'run'], { stdio: 'inherit', env: { ...process.env, WEAVE_HOME: join(dir, 'server'), WEAVE_VAULT_TOKEN: s.token, WEAVE_KEYSTORE: 'file' } });
  child.on('exit', (code) => process.exit(code ?? 0));
}

if (command === 'app') {
  const home = join(dir, name);
  const opener = join(dir, 'open-signin.mjs');
  // The "browser": writes the sign-in address down, to open it by hand (or in a test browser).
  writeFileSync(opener, `import { writeFileSync } from 'node:fs';\nwriteFileSync(${JSON.stringify(join(dir, 'signin-url.txt'))}, process.argv[2]);\n`);
  const child = spawn(process.execPath, [join(root, 'apps', 'desktop', 'dev-web.ts'), '--home', home, '--port', '8771'], {
    stdio: 'inherit',
    env: { ...process.env, BROWSER: `"${process.execPath}" "${opener}"`, WEAVE_KEYSTORE: 'file' },
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}
