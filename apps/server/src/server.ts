// Weave Server: a company's own Weave node, for a server or a container.
//
//   weave-server init        set the company up (a few questions; or flags and WEAVE_* settings)
//   weave-server run         run it: the node, the admin console, SCIM, the audit streams
//   weave-server link        a new enrollment link for colleagues
//   weave-server operator    a one-time link into the admin console
//   weave-server status      what it runs, and where
//
// Its home is WEAVE_HOME (/data in the container). The key service's secret
// comes from WEAVE_VAULT_TOKEN, or WEAVE_AZURE_CLIENT_SECRET for Azure Key
// Vault, never from a file. See docs/weave-server.md.

import { homedir } from 'node:os';
import { join } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { parseArgs } from 'node:util';
import { connectDaemon, resolveHome, startDaemon, WeaveNode, type CreateCompanyInput } from '@weave/node';

declare const WEAVE_VERSION: string | undefined;
const VERSION = typeof WEAVE_VERSION === 'string' ? WEAVE_VERSION : 'dev';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    home: { type: 'string' },
    name: { type: 'string' },
    vault: { type: 'string' },
    'vault-key': { type: 'string' },
    'vault-role': { type: 'string' },
    'azure-vault': { type: 'string' },
    'azure-key': { type: 'string' },
    'azure-tenant': { type: 'string' },
    'azure-client-id': { type: 'string' },
    issuer: { type: 'string' },
    'client-id': { type: 'string' },
    admins: { type: 'string' },
    'console-port': { type: 'string' },
    'console-url': { type: 'string' },
    'console-client-id': { type: 'string' },
    scim: { type: 'string' },
    'no-input': { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});
const command = positionals[0] ?? 'run';
// Its own home, never a person's ~/.weave (in the container: /data).
const home = resolveHome(values.home ?? process.env.WEAVE_HOME ?? join(homedir(), '.weave-server'));

const HELP = `weave-server ${VERSION}: a company's own Weave node

  weave-server init        set the company up (asks; or flags, see docs/weave-server.md)
  weave-server run         run the node, the admin console and SCIM (the default)
  weave-server link        a new enrollment link for colleagues
  weave-server operator    a one-time link into the admin console
  weave-server status      what it runs, and where

  home: ${home.dir} (WEAVE_HOME)`;

/** One answer: a flag, else a WEAVE_* setting, else asked (unless --no-input), else the default. */
async function answer(ask: ReturnType<typeof createInterface> | undefined, question: string, given: string | undefined, fallback?: string): Promise<string> {
  if (given) return given;
  if (!ask) {
    if (fallback !== undefined) return fallback;
    throw new Error(`missing: ${question} (give it as a flag; see weave-server --help)`);
  }
  const reply = (await ask.question(`${question}${fallback ? ` [${fallback}]` : ''}: `)).trim();
  if (reply) return reply;
  if (fallback !== undefined) return fallback;
  return answer(ask, question, undefined, fallback);
}

async function init(): Promise<void> {
  const env = process.env;
  const ask = values['no-input'] || !process.stdin.isTTY ? undefined : createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`Setting up a company's Weave in ${home.dir}\n`);
    const name = await answer(ask, "The company's name", values.name ?? env.WEAVE_COMPANY);
    const kind = values.vault ? 'vault' : values['azure-vault'] ? 'azure' : await answer(ask, 'Its key service: vault or azure', env.WEAVE_KEY_SERVICE, 'vault');
    let provider: CreateCompanyInput['provider'];
    if (kind === 'azure') {
      provider = {
        kind: 'azure',
        vault: await answer(ask, 'Azure Key Vault address (https://….vault.azure.net)', values['azure-vault'] ?? env.WEAVE_AZURE_VAULT),
        key: await answer(ask, 'Its RSA key', values['azure-key'] ?? env.WEAVE_AZURE_KEY, 'weave'),
        tenant: await answer(ask, 'Entra tenant id', values['azure-tenant'] ?? env.WEAVE_AZURE_TENANT),
        clientId: await answer(ask, "This server's Entra app (client) id", values['azure-client-id'] ?? env.WEAVE_AZURE_CLIENT_ID),
      };
      if (!env.WEAVE_AZURE_CLIENT_SECRET && !env.WEAVE_AZURE_TOKEN) throw new Error("set WEAVE_AZURE_CLIENT_SECRET (this server's Entra app secret) first");
    } else {
      provider = {
        kind: 'vault',
        address: await answer(ask, 'Vault address', values.vault ?? env.WEAVE_VAULT_ADDR),
        key: await answer(ask, 'Its transit key (created with derived=true)', values['vault-key'] ?? env.WEAVE_VAULT_KEY, 'weave'),
        jwt: { role: await answer(ask, "Vault's JWT role for employees", values['vault-role'] ?? env.WEAVE_VAULT_ROLE, 'employees') },
      };
      if (!env.WEAVE_VAULT_TOKEN) throw new Error("set WEAVE_VAULT_TOKEN (this server's Vault token) first");
    }
    const issuer = await answer(ask, "The company sign-in's issuer (e.g. https://login.microsoftonline.com/<tenant>/v2.0)", values.issuer ?? env.WEAVE_ISSUER);
    const clientId = await answer(ask, "Weave's app registration (client id) with that sign-in", values['client-id'] ?? env.WEAVE_CLIENT_ID);
    const admins = await answer(ask, "The sign-in group of the company's admins", values.admins ?? env.WEAVE_ADMINS, 'weave-admins');
    const consolePort = Number(await answer(ask, 'Admin console port', values['console-port'] ?? env.WEAVE_CONSOLE_PORT, '7730'));
    const consoleUrl = await answer(ask, "The admin console's public address (its sign-in returns to <address>/callback)", values['console-url'] ?? env.WEAVE_CONSOLE_URL, `http://localhost:${consolePort}`);
    const consoleClient = await answer(ask, "The admin console's app registration (client id)", values['console-client-id'] ?? env.WEAVE_CONSOLE_CLIENT_ID, clientId);
    const scim = await answer(ask, 'SCIM port for your user management (or "off")', values.scim ?? env.WEAVE_SCIM_PORT, '7720');
    ask?.close();

    const { node, words } = WeaveNode.create(name, home.dir);
    try {
      const company = await node.createCompany({ name, provider, issuer, audience: clientId, admins });
      const consoleInfo = await node.setConsole({ on: true, port: consolePort, url: consoleUrl, clientId: consoleClient, ...(env.WEAVE_CONSOLE_CLIENT_SECRET ? { clientSecret: env.WEAVE_CONSOLE_CLIENT_SECRET } : {}) });
      const scimInfo = scim !== 'off' ? await node.setScim({ on: true, port: Number(scim) }) : undefined;
      const link = await node.enrollLink({ days: 30 });
      console.log(
        [
          '',
          `${company.name} is set up.`,
          '',
          "The company's own recovery words. They are the company: print them and lock them away (they are shown only now):",
          '',
          `  ${words}`,
          '',
          `Admin console: ${consoleInfo.url}  (admins in "${admins}" sign in with their company account)`,
          `  add ${consoleUrl}/callback as a redirect address of the app registration ${consoleClient}`,
          ...(scimInfo ? [`SCIM: port ${scimInfo.port}, path /scim/v2, bearer token (shown once): ${scimInfo.token}`] : []),
          '',
          'Enrollment link for colleagues (valid 30 days; the console makes new ones):',
          `  ${link}`,
          '',
          'Now run: weave-server run   (then weave-server operator for a one-time link into the console)',
        ].join('\n'),
      );
    } finally {
      await node.close();
    }
  } finally {
    ask?.close();
  }
}

async function run(): Promise<void> {
  const daemon = await startDaemon(home.dir);
  const company = await daemon.node.company();
  if (!company) console.warn('weave-server: no company here yet (weave-server init first)');
  const consoleInfo = await daemon.node.consoleInfo();
  const scim = await daemon.node.scim();
  console.log(`weave-server ${VERSION} for ${company?.name ?? '(no company)'}`);
  console.log(`  home ${home.dir}`);
  if (consoleInfo.on) console.log(`  admin console ${consoleInfo.url} (health: /healthz)`);
  if (scim.on) console.log(`  SCIM port ${scim.port}, /scim/v2`);
  const stop = async () => {
    await daemon.stop();
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
  await new Promise(() => {}); // until stopped
}

async function client() {
  const c = await connectDaemon(home);
  if (!c) throw new Error(`weave-server isn't running for ${home.dir} (weave-server run)`);
  return c;
}

async function main(): Promise<void> {
  if (values.help || command === 'help') return void console.log(HELP);
  switch (command) {
    case 'init':
      return init();
    case 'run':
      return run();
    case 'link':
      return void console.log(await (await client()).enrollLink({ days: 30 }));
    case 'operator':
      return void console.log(await (await client()).consoleOperatorLink());
    case 'status': {
      const c = await client();
      const [company, consoleInfo, scim] = await Promise.all([c.company(), c.consoleInfo(), c.scim()]);
      return void console.log(
        [
          `${company?.name ?? '(no company)'}: ${company?.spaces.length ?? 0} projects and groups, ${company?.maps.length ?? 0} mappings`,
          `  admin console ${consoleInfo.on ? consoleInfo.url : 'off'}`,
          `  SCIM ${scim.on ? `port ${scim.port}, ${scim.users.length} users` : 'off'}`,
        ].join('\n'),
      );
    }
    default:
      throw new Error(`unknown command: ${command}\n\n${HELP}`);
  }
}

main().catch((error: Error) => {
  console.error(`weave-server: ${error.message}`);
  process.exit(1);
});
