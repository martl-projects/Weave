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

import { cpSync, existsSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import {
  connectDaemon,
  loadConfig,
  moveHomeKeyToKeyService,
  resolveHome,
  saveConfig,
  startDaemon,
  WeaveNode,
  type CreateCompanyInput,
} from "@weave/node";

declare const WEAVE_VERSION: string | undefined;
const VERSION = typeof WEAVE_VERSION === "string" ? WEAVE_VERSION : "dev";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    home: { type: "string" },
    name: { type: "string" },
    vault: { type: "string" },
    "vault-key": { type: "string" },
    "vault-role": { type: "string" },
    "azure-vault": { type: "string" },
    "azure-key": { type: "string" },
    "azure-tenant": { type: "string" },
    "azure-client-id": { type: "string" },
    issuer: { type: "string" },
    "client-id": { type: "string" },
    admins: { type: "string" },
    "console-port": { type: "string" },
    "console-url": { type: "string" },
    "console-client-id": { type: "string" },
    scim: { type: "string" },
    "home-key": { type: "string" },
    "no-input": { type: "boolean", default: false },
    standby: { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
  },
});
const command = positionals[0] ?? "run";
// Its own home, never a person's ~/.weave (in the container: /data).
const home = resolveHome(
  values.home ?? process.env.WEAVE_HOME ?? join(homedir(), ".weave-server"),
);

const HELP = `weave-server ${VERSION}: a company's own Weave node

  weave-server init        set the company up (asks; or flags, see docs/weave-server.md)
  weave-server run         run the node, the admin console and SCIM (the default)
  weave-server link        a new enrollment link for colleagues
  weave-server operator    a one-time link into the admin console
  weave-server status      what it runs, and where

  weave-server backup <folder>              a consistent copy of this server's home, while it runs
  weave-server restore <folder> [--standby] set this home up from a backup (--standby: follow the active one, write nothing)
  weave-server promote                      a standby takes over (only once the active server is gone for good)

  home: ${home.dir} (WEAVE_HOME)`;

/** One answer: a flag, else a WEAVE_* setting, else asked (unless --no-input), else the default. */
async function answer(
  ask: ReturnType<typeof createInterface> | undefined,
  question: string,
  given: string | undefined,
  fallback?: string,
): Promise<string> {
  if (given) return given;
  if (!ask) {
    if (fallback !== undefined) return fallback;
    throw new Error(
      `missing: ${question} (give it as a flag; see weave-server --help)`,
    );
  }
  const reply = (
    await ask.question(`${question}${fallback ? ` [${fallback}]` : ""}: `)
  ).trim();
  if (reply) return reply;
  if (fallback !== undefined) return fallback;
  return answer(ask, question, undefined, fallback);
}

async function init(): Promise<void> {
  const env = process.env;
  const ask =
    values["no-input"] || !process.stdin.isTTY
      ? undefined
      : createInterface({ input: process.stdin, output: process.stdout });
  try {
    console.log(`Setting up a company's Weave in ${home.dir}\n`);
    const name = await answer(
      ask,
      "The company's name",
      values.name ?? env.WEAVE_COMPANY,
    );
    const kind = values.vault
      ? "vault"
      : values["azure-vault"]
        ? "azure"
        : await answer(
            ask,
            "Its key service: vault or azure",
            env.WEAVE_KEY_SERVICE,
            "vault",
          );
    let provider: CreateCompanyInput["provider"];
    if (kind === "azure") {
      provider = {
        kind: "azure",
        vault: await answer(
          ask,
          "Azure Key Vault address (https://….vault.azure.net)",
          values["azure-vault"] ?? env.WEAVE_AZURE_VAULT,
        ),
        key: await answer(
          ask,
          "Its RSA key",
          values["azure-key"] ?? env.WEAVE_AZURE_KEY,
          "weave",
        ),
        tenant: await answer(
          ask,
          "Entra tenant id",
          values["azure-tenant"] ?? env.WEAVE_AZURE_TENANT,
        ),
        clientId: await answer(
          ask,
          "This server's Entra app (client) id",
          values["azure-client-id"] ?? env.WEAVE_AZURE_CLIENT_ID,
        ),
      };
      if (!env.WEAVE_AZURE_CLIENT_SECRET && !env.WEAVE_AZURE_TOKEN)
        throw new Error(
          "set WEAVE_AZURE_CLIENT_SECRET (this server's Entra app secret) first",
        );
    } else {
      provider = {
        kind: "vault",
        address: await answer(
          ask,
          "Vault address",
          values.vault ?? env.WEAVE_VAULT_ADDR,
        ),
        key: await answer(
          ask,
          "Its transit key (created with derived=true)",
          values["vault-key"] ?? env.WEAVE_VAULT_KEY,
          "weave",
        ),
        jwt: {
          role: await answer(
            ask,
            "Vault's JWT role for employees",
            values["vault-role"] ?? env.WEAVE_VAULT_ROLE,
            "employees",
          ),
        },
      };
      if (!env.WEAVE_VAULT_TOKEN)
        throw new Error(
          "set WEAVE_VAULT_TOKEN (this server's Vault token) first",
        );
    }
    const issuer = await answer(
      ask,
      "The company sign-in's issuer (e.g. https://login.microsoftonline.com/<tenant>/v2.0)",
      values.issuer ?? env.WEAVE_ISSUER,
    );
    const clientId = await answer(
      ask,
      "Weave's app registration (client id) with that sign-in",
      values["client-id"] ?? env.WEAVE_CLIENT_ID,
    );
    const admins = await answer(
      ask,
      "The sign-in group of the company's admins",
      values.admins ?? env.WEAVE_ADMINS,
      "weave-admins",
    );
    const consolePort = Number(
      await answer(
        ask,
        "Admin console port",
        values["console-port"] ?? env.WEAVE_CONSOLE_PORT,
        "7730",
      ),
    );
    const consoleUrl = await answer(
      ask,
      "The admin console's public address (its sign-in returns to <address>/callback)",
      values["console-url"] ?? env.WEAVE_CONSOLE_URL,
      `http://localhost:${consolePort}`,
    );
    const consoleClient = await answer(
      ask,
      "The admin console's app registration (client id)",
      values["console-client-id"] ?? env.WEAVE_CONSOLE_CLIENT_ID,
      clientId,
    );
    const scim = await answer(
      ask,
      'SCIM port for your user management (or "off")',
      values.scim ?? env.WEAVE_SCIM_PORT,
      "7720",
    );
    ask?.close();

    const { node, words } = WeaveNode.create(name, home.dir);
    try {
      const company = await node.createCompany({
        name,
        provider,
        issuer,
        audience: clientId,
        admins,
      });
      // The server's own home key goes into the company's key service too: a copied volume or backup opens nothing (--home-key local keeps it here).
      if ((values["home-key"] ?? env.WEAVE_HOME_KEY) !== "local")
        await moveHomeKeyToKeyService(home, provider as never);
      const consoleInfo = await node.setConsole({
        on: true,
        port: consolePort,
        url: consoleUrl,
        clientId: consoleClient,
        ...(env.WEAVE_CONSOLE_CLIENT_SECRET
          ? { clientSecret: env.WEAVE_CONSOLE_CLIENT_SECRET }
          : {}),
      });
      // With a mail server (WEAVE_SMTP_URL), people the user management adds get their invitation by email.
      const scimInfo =
        scim !== "off"
          ? await node.setScim({
              on: true,
              port: Number(scim),
              ...(env.WEAVE_SMTP_URL ? { invite: true } : {}),
            })
          : undefined;
      const link = await node.enrollLink({ days: 30 });
      console.log(
        [
          "",
          `${company.name} is set up.`,
          "",
          "The company's own recovery words. They are the company: print them and lock them away (they are shown only now):",
          "",
          `  ${words}`,
          "",
          `This server's own keys are sealed with a key held by ${kind === "azure" ? "Azure Key Vault" : "Vault"}: it starts only with access to it.`,
          `Admin console: ${consoleInfo.url}  (admins in "${admins}" sign in with their company account)`,
          `  add ${consoleUrl}/callback as a redirect address of the app registration ${consoleClient}`,
          ...(scimInfo
            ? [
                `SCIM: port ${scimInfo.port}, path /scim/v2, bearer token (shown once): ${scimInfo.token}`,
              ]
            : []),
          ...(scimInfo?.invite
            ? [
                "  people your user management adds get their invitation by email",
              ]
            : []),
          ...(env.WEAVE_SMTP_URL
            ? []
            : [
                "Invitations by email: give this server a mail server (WEAVE_SMTP_URL, WEAVE_SMTP_FROM)",
              ]),
          "",
          "Enrollment link for colleagues (valid 30 days; the console makes new ones):",
          `  ${link}`,
          "",
          "Now run: weave-server run   (then weave-server operator for a one-time link into the console)",
        ].join("\n"),
      );
    } finally {
      await node.close();
    }
  } finally {
    ask?.close();
  }
}

/** Set this home up from a backup folder: as the server, or as a standby that only follows it. */
async function restore(from: string | undefined): Promise<void> {
  if (!from || !existsSync(from))
    throw new Error("usage: weave-server restore <backup folder> [--standby]");
  if (existsSync(home.dir) && readdirSync(home.dir).length)
    throw new Error(`${home.dir} isn't empty: restore into a new home`);
  cpSync(from, home.dir, { recursive: true });
  const config = loadConfig(home);
  if (values.standby) config.standby = true;
  else delete config.standby;
  saveConfig(home, config);
  console.log(
    values.standby
      ? `${home.dir} is a standby: run it (weave-server run) and it follows the active server, writing nothing. If the active one is gone for good: weave-server promote.`
      : `${home.dir} is restored. Run it (weave-server run) — and only this one: two active servers sign as the same device.`,
  );
}

/** A standby takes over. The active server must be gone: both would sign as the same device. */
async function promote(): Promise<void> {
  if (await connectDaemon(home))
    throw new Error("stop this server first (it is running), then promote it");
  const config = loadConfig(home);
  if (!config.standby) throw new Error(`${home.dir} isn't a standby`);
  delete config.standby;
  saveConfig(home, config);
  console.log(
    `${home.dir} is the active server now. Start it (weave-server run). The old one must never run again as it was: set it up anew as a standby from a backup of this one.`,
  );
}

async function run(): Promise<void> {
  const daemon = await startDaemon(home.dir);
  const company = await daemon.node.company();
  if (!company)
    console.warn("weave-server: no company here yet (weave-server init first)");
  const consoleInfo = await daemon.node.consoleInfo();
  const scim = await daemon.node.scim();
  console.log(
    `weave-server ${VERSION} for ${company?.name ?? "(no company)"}${daemon.node.config.standby ? " — STANDBY: following the active server, writing nothing" : ""}`,
  );
  console.log(`  home ${home.dir}`);
  if (consoleInfo.on)
    console.log(`  admin console ${consoleInfo.url} (health: /healthz)`);
  if (scim.on) console.log(`  SCIM port ${scim.port}, /scim/v2`);
  const stop = async () => {
    await daemon.stop();
    process.exit(0);
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  await new Promise(() => {}); // until stopped
}

async function client() {
  const c = await connectDaemon(home);
  if (!c)
    throw new Error(
      `weave-server isn't running for ${home.dir} (weave-server run)`,
    );
  return c;
}

async function main(): Promise<void> {
  if (values.help || command === "help") return void console.log(HELP);
  switch (command) {
    case "init":
      return init();
    case "run":
      return run();
    case "backup": {
      const to = positionals[1];
      if (!to) throw new Error("usage: weave-server backup <empty folder>");
      const done = await (
        await client()
      ).backup({ to: join(process.env.INIT_CWD ?? process.cwd(), to) });
      return void console.log(
        `backed up ${done.files} files (${(done.bytes / 1048576).toFixed(1)} MB) to ${done.to}${done.note ? `\n  note: ${done.note}` : "\n  it opens only with access to the company's key service"}`,
      );
    }
    case "restore":
      return restore(positionals[1]);
    case "promote":
      return promote();
    case "link":
      return void console.log(await (await client()).enrollLink({ days: 30 }));
    case "operator":
      return void console.log(await (await client()).consoleOperatorLink());
    case "status": {
      const c = await client();
      const [company, consoleInfo, scim] = await Promise.all([
        c.company(),
        c.consoleInfo(),
        c.scim(),
      ]);
      return void console.log(
        [
          `${company?.name ?? "(no company)"}: ${company?.spaces.length ?? 0} projects and groups, ${company?.maps.length ?? 0} mappings`,
          `  admin console ${consoleInfo.on ? consoleInfo.url : "off"}`,
          `  SCIM ${scim.on ? `port ${scim.port}, ${scim.users.length} users` : "off"}`,
        ].join("\n"),
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
