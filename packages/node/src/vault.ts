import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { relative } from "node:path";
import { b64u, open, seal, type Json, type Sealed } from "@weave/core";
import { readJson, writeJson, type Home } from "./home.ts";

/*
 * Keys at rest (docs/v2-stage2.md, part 4). Files holding secret keys are
 * sealed with a home key; the home key is wrapped by the operating system's
 * keystore, so a copied home is useless on another computer or as another
 * user:
 *
 *   Windows   DPAPI (current user), through PowerShell
 *   macOS     Keychain, through `security`
 *   Linux     Secret Service, through `secret-tool`
 *   elsewhere the home key in vault.json itself, with a warning
 *
 * WEAVE_KEYSTORE=file picks the last on purpose (tests, CI, headless boxes).
 * Each sealed file is bound to its path in the home, so files can't be swapped.
 */

export type Keystore = "dpapi" | "keychain" | "secret-service" | "file" | "kms";

interface VaultFile {
  v: 1;
  keystore: Keystore;
  /** dpapi: the home key wrapped by DPAPI; file: the home key itself. */
  key?: string;
  /** keychain, secret-service: the name of the item that holds the home key. */
  item?: string;
  /** kms (stage 14): the company's key service that wraps the home key, the wrapped key, and what it's bound to. */
  provider?: Json;
  wrapped?: string;
  context?: string;
}

interface SealedFile extends Sealed {
  weaveSealed: 1;
}

export interface Vault {
  keystore: Keystore;
  /** Why the home key isn't in an OS keystore, if it isn't. */
  warning?: string;
  key: Uint8Array;
}

const vaults = new Map<string, Vault>();
const vaultPath = (home: Home) => `${home.dir}/vault.json`;

/** The home's vault: opened (or made) once per process. */
export function vaultOf(home: Home): Vault {
  const kept = vaults.get(home.dir);
  if (kept) return kept;
  const stored = readJson<VaultFile>(vaultPath(home));
  const vault = stored ? openVault(home, stored) : createVault(home);
  vaults.set(home.dir, vault);
  return vault;
}

function openVault(home: Home, stored: VaultFile): Vault {
  // A company's server: the home key is in the company's key service, unlocked (asynchronously) before anything opens.
  if (stored.keystore === "kms")
    throw new Error(
      `this Weave home's key is in the company's key service: unlock it first (weave-server does, with WEAVE_VAULT_TOKEN or WEAVE_AZURE_CLIENT_SECRET set)`,
    );
  try {
    if (stored.keystore === "file")
      return {
        keystore: "file",
        key: b64u.decode(stored.key!),
        warning: FILE_WARNING,
      };
    return { keystore: stored.keystore, key: b64u.decode(unwrap(stored)) };
  } catch (error) {
    throw new Error(
      `this Weave home (${home.dir}) is locked to the computer and user it was made on (${stored.keystore}), and can't be opened here: ${(error as Error).message.split("\n")[0]}. ` +
        "Set up this computer from your recovery words instead (weave restore).",
    );
  }
}

/** A company server's home (stage 14): how its key is held in the company's key service, if it is. */
export function homeKeyService(
  home: Home,
): { provider: Json; wrapped: string; context: string } | undefined {
  const stored = readJson<VaultFile>(vaultPath(home));
  return stored?.keystore === "kms" &&
    stored.provider &&
    stored.wrapped &&
    stored.context
    ? {
        provider: stored.provider,
        wrapped: stored.wrapped,
        context: stored.context,
      }
    : undefined;
}

/** Use this home key from now on in this process (unlocked from the company's key service). */
export function useHomeKey(home: Home, key: Uint8Array): void {
  vaults.set(home.dir, { keystore: "kms", key });
}

/** Hand the home key to the company's key service: vault.json then holds only what it wrapped. */
export function keepHomeKeyIn(
  home: Home,
  provider: Json,
  wrapped: string,
  context: string,
): void {
  writeJson(vaultPath(home), {
    v: 1,
    keystore: "kms",
    provider,
    wrapped,
    context,
  } satisfies VaultFile);
  vaults.set(home.dir, { keystore: "kms", key: vaultOf(home).key });
}

const FILE_WARNING =
  "your keys are not protected by the operating system: anyone who copies your Weave folder can use them";

function createVault(home: Home): Vault {
  const key = new Uint8Array(randomBytes(32));
  const wanted = process.env.WEAVE_KEYSTORE === "file" ? "file" : osKeystore();
  if (wanted !== "file") {
    try {
      const item = `weave-${b64u.encode(randomBytes(9))}`;
      const stored = wrap(wanted, b64u.encode(key), item);
      if (b64u.encode(b64u.decode(unwrap(stored))) !== b64u.encode(key))
        throw new Error("the keystore gave back something else");
      writeJson(vaultPath(home), stored);
      return { keystore: wanted, key };
    } catch (error) {
      const warning = `${FILE_WARNING} (${wanted} failed: ${(error as Error).message.split("\n")[0]})`;
      writeJson(vaultPath(home), {
        v: 1,
        keystore: "file",
        key: b64u.encode(key),
      } satisfies VaultFile);
      return { keystore: "file", key, warning };
    }
  }
  writeJson(vaultPath(home), {
    v: 1,
    keystore: "file",
    key: b64u.encode(key),
  } satisfies VaultFile);
  return {
    keystore: "file",
    key,
    ...(process.env.WEAVE_KEYSTORE === "file" ? {} : { warning: FILE_WARNING }),
  };
}

const osKeystore = (): Keystore =>
  process.platform === "win32"
    ? "dpapi"
    : process.platform === "darwin"
      ? "keychain"
      : process.platform === "linux"
        ? "secret-service"
        : "file";

const run = (cmd: string, args: string[], input: string): string =>
  execFileSync(cmd, args, {
    input,
    encoding: "utf8",
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
    timeout: 20_000,
  }).trim();

const DPAPI = (fn: "Protect" | "Unprotect") =>
  `Add-Type -AssemblyName System.Security; $in=[Console]::In.ReadToEnd().Trim(); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${fn}([Convert]::FromBase64String($in), $null, 'CurrentUser'))`;

/** Hand the home key (base64url) to the keystore; secrets go through stdin, never the command line. */
function wrap(keystore: Keystore, key: string, item: string): VaultFile {
  const std = Buffer.from(b64u.decode(key)).toString("base64");
  switch (keystore) {
    case "dpapi":
      return {
        v: 1,
        keystore,
        key: run(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", DPAPI("Protect")],
          std,
        ),
      };
    case "keychain":
      run(
        "security",
        ["-i"],
        `add-generic-password -U -a ${item} -s Weave -w ${std}\n`,
      );
      return { v: 1, keystore, item };
    case "secret-service":
      run(
        "secret-tool",
        ["store", "--label=Weave home key", "service", "weave", "home", item],
        std,
      );
      return { v: 1, keystore, item };
    default:
      throw new Error(`no keystore ${keystore}`);
  }
}

/** The home key back from the keystore, base64url. */
function unwrap(stored: VaultFile): string {
  const std = (() => {
    switch (stored.keystore) {
      case "dpapi":
        return run(
          "powershell.exe",
          ["-NoProfile", "-NonInteractive", "-Command", DPAPI("Unprotect")],
          stored.key!,
        );
      case "keychain":
        return run(
          "security",
          ["find-generic-password", "-a", stored.item!, "-s", "Weave", "-w"],
          "",
        );
      case "secret-service":
        return run(
          "secret-tool",
          ["lookup", "service", "weave", "home", stored.item!],
          "",
        );
      default:
        throw new Error(`no keystore ${stored.keystore}`);
    }
  })();
  if (!std) throw new Error("the keystore has no key for it");
  return b64u.encode(new Uint8Array(Buffer.from(std, "base64")));
}

const context = (home: Home, path: string) =>
  `weave/vault/v1:${relative(home.dir, path).replaceAll("\\", "/")}`;

const isSealed = (value: unknown): value is SealedFile =>
  !!value &&
  typeof value === "object" &&
  (value as SealedFile).weaveSealed === 1;

/** Read a file of secrets: sealed ones are opened; one still in the clear (from before) is read as it is and sealed. */
export function readSecretJson<T>(home: Home, path: string): T | undefined {
  const stored = readJson<unknown>(path);
  if (stored === undefined) return undefined;
  if (isSealed(stored))
    return open(vaultOf(home).key, stored, context(home, path)) as unknown as T;
  writeSecretJson(home, path, stored);
  return stored as T;
}

export function writeSecretJson(
  home: Home,
  path: string,
  value: unknown,
): void {
  const sealed = seal(vaultOf(home).key, value as Json, context(home, path));
  writeJson(path, { weaveSealed: 1, ...sealed } satisfies SealedFile);
}

/** For tests: forget opened vaults, as a new process would. */
export function forgetVaults(): void {
  vaults.clear();
}
