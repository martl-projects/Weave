import { execFileSync } from 'node:child_process';
import { createECDH, hkdfSync, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { b64u, open, seal, type Json, type Sealed } from '@weave/core';
import { readJson, writeJson, type Home } from './home.ts';

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
 * Or held in hardware (stage 17), chosen by the person (weave keystore):
 *
 *   tpm             Windows: an RSA key inside this computer's TPM wraps it (Platform Crypto Provider, through PowerShell)
 *   secure-enclave  macOS: a key inside the Secure Enclave, through the weave-se helper (CryptoKit)
 *   yubikey         a YubiKey's HMAC challenge-response (slot 2), through `ykman`
 *
 * WEAVE_KEYSTORE picks one when a home is made (file on purpose: tests, CI, headless boxes).
 * Each sealed file is bound to its path in the home, so files can't be swapped.
 */

export type Keystore = 'dpapi' | 'keychain' | 'secret-service' | 'file' | 'kms' | HardwareKeystore;
export type HardwareKeystore = 'tpm' | 'secure-enclave' | 'yubikey';
export const HARDWARE_KEYSTORES: readonly HardwareKeystore[] = ['tpm', 'secure-enclave', 'yubikey'];

interface VaultFile {
  v: 1;
  keystore: Keystore;
  /** dpapi, tpm: the home key wrapped; file: the home key itself. */
  key?: string;
  /** keychain, secret-service: the name of the item that holds the home key; tpm: the name of the TPM key. */
  item?: string;
  /** secure-enclave: the enclave key (only that enclave can use it) and the other half of the key agreement. */
  blob?: string;
  peer?: string;
  /** yubikey: the challenge and the slot answering it. */
  challenge?: string;
  slot?: number;
  /** secure-enclave, yubikey: the home key, sealed with what the hardware gives back. */
  sealed?: Sealed;
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
  if (stored.keystore === 'kms') throw new Error(`this Weave home's key is in the company's key service: unlock it first (weave-server does, with its key service's settings)`);
  try {
    if (stored.keystore === 'file') return { keystore: 'file', key: b64u.decode(stored.key!), warning: FILE_WARNING };
    return { keystore: stored.keystore, key: b64u.decode(unwrap(stored)) };
  } catch (error) {
    throw new Error(
      `this Weave home (${home.dir}) is locked to the computer and user it was made on (${stored.keystore}), and can't be opened here: ${(error as Error).message.split('\n')[0]}. ` +
        'Set up this computer from your recovery words instead (weave restore).',
    );
  }
}

/** A company server's home (stage 14): how its key is held in the company's key service, if it is. */
export function homeKeyService(home: Home): { provider: Json; wrapped: string; context: string } | undefined {
  const stored = readJson<VaultFile>(vaultPath(home));
  return stored?.keystore === 'kms' && stored.provider && stored.wrapped && stored.context ? { provider: stored.provider, wrapped: stored.wrapped, context: stored.context } : undefined;
}

/** Use this home key from now on in this process (unlocked from the company's key service). */
export function useHomeKey(home: Home, key: Uint8Array): void {
  vaults.set(home.dir, { keystore: 'kms', key });
}

/** Hand the home key to the company's key service: vault.json then holds only what it wrapped. */
export function keepHomeKeyIn(home: Home, provider: Json, wrapped: string, context: string): void {
  writeJson(vaultPath(home), { v: 1, keystore: 'kms', provider, wrapped, context } satisfies VaultFile);
  vaults.set(home.dir, { keystore: 'kms', key: vaultOf(home).key });
}

const FILE_WARNING = 'your keys are not protected by the operating system: anyone who copies your Weave folder can use them';

function createVault(home: Home): Vault {
  const key = new Uint8Array(randomBytes(32));
  const asked = process.env.WEAVE_KEYSTORE;
  // Hardware, if asked for: it must work, or there's no home (better than silently less protection).
  if (asked && (HARDWARE_KEYSTORES as readonly string[]).includes(asked)) {
    const stored = wrapChecked(asked as HardwareKeystore, key);
    writeJson(vaultPath(home), stored);
    return { keystore: stored.keystore, key };
  }
  const wanted = asked === 'file' ? 'file' : osKeystore();
  if (wanted !== 'file') {
    try {
      const item = `weave-${b64u.encode(randomBytes(9))}`;
      const stored = wrap(wanted, b64u.encode(key), item);
      if (b64u.encode(b64u.decode(unwrap(stored))) !== b64u.encode(key)) throw new Error('the keystore gave back something else');
      writeJson(vaultPath(home), stored);
      return { keystore: wanted, key };
    } catch (error) {
      const warning = `${FILE_WARNING} (${wanted} failed: ${(error as Error).message.split('\n')[0]})`;
      writeJson(vaultPath(home), { v: 1, keystore: 'file', key: b64u.encode(key) } satisfies VaultFile);
      return { keystore: 'file', key, warning };
    }
  }
  writeJson(vaultPath(home), { v: 1, keystore: 'file', key: b64u.encode(key) } satisfies VaultFile);
  return { keystore: 'file', key, ...(process.env.WEAVE_KEYSTORE === 'file' ? {} : { warning: FILE_WARNING }) };
}

const osKeystore = (): Keystore => (process.platform === 'win32' ? 'dpapi' : process.platform === 'darwin' ? 'keychain' : process.platform === 'linux' ? 'secret-service' : 'file');

const run = (cmd: string, args: string[], input: string): string => {
  try {
    return execFileSync(cmd, args, { input, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'], windowsHide: true, timeout: 20_000 }).trim();
  } catch (error) {
    // What the program said (its last words on stderr), rather than the command line it was given.
    const said = String((error as { stderr?: unknown }).stderr ?? '').split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !/^(At line|\+|CategoryInfo|FullyQualifiedErrorId)/.test(l));
    throw new Error(said[0] ?? (error as Error).message.split('\n')[0]);
  }
};

const DPAPI = (fn: 'Protect' | 'Unprotect') =>
  `Add-Type -AssemblyName System.Security; $in=[Console]::In.ReadToEnd().Trim(); [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::${fn}([Convert]::FromBase64String($in), $null, 'CurrentUser'))`;

// ---------------------------------------------------------------- hardware (stage 17)

/** TPM: an RSA key made inside this computer's TPM (never exportable) wraps the home key with RSA-OAEP. */
const TPM = (fn: 'Create' | 'Wrap' | 'Unwrap' | 'Delete') =>
  [
    "$ErrorActionPreference='Stop'; $in=[Console]::In.ReadToEnd().Trim().Split('|'); $p=New-Object Security.Cryptography.CngProvider('Microsoft Platform Crypto Provider')",
    fn === 'Create'
      ? "$c=New-Object Security.Cryptography.CngKeyCreationParameters; $c.Provider=$p; $c.ExportPolicy=[Security.Cryptography.CngExportPolicies]::None; $c.Parameters.Add((New-Object Security.Cryptography.CngProperty('Length',[BitConverter]::GetBytes(2048),[Security.Cryptography.CngPropertyOptions]::None))); $k=[Security.Cryptography.CngKey]::Create([Security.Cryptography.CngAlgorithm]::Rsa,$in[0],$c)"
      : '$k=[Security.Cryptography.CngKey]::Open($in[0],$p)',
    fn === 'Create'
      ? "'made'"
      : fn === 'Delete'
        ? '$k.Delete()'
        : fn === 'Unwrap'
          ? '$r=New-Object Security.Cryptography.RSACng($k); [Convert]::ToBase64String($r.Decrypt([Convert]::FromBase64String($in[1]),[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256))'
          : '$r=New-Object Security.Cryptography.RSACng($k); [Convert]::ToBase64String($r.Encrypt([Convert]::FromBase64String($in[1]),[Security.Cryptography.RSAEncryptionPadding]::OaepSHA256))',
  ].join('; ');
const powershell = (script: string, input: string) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], input);

/** A helper program, from a setting: a path, or a JSON list of a program and its first arguments (tests use stand-ins). */
function helper(setting: string | undefined, fallback: string[]): [string, string[]] {
  if (setting?.trim().startsWith('[')) {
    const [cmd, ...args] = JSON.parse(setting) as string[];
    return [cmd, args];
  }
  if (setting) return [setting, []];
  const found = fallback.find((f) => existsSync(f));
  if (!found) throw new Error(`not found: ${fallback[0] ?? 'the helper'}`);
  return [found, []];
}

/** The Secure Enclave helper (weave-se, built for macOS with the app): next to the app, or WEAVE_SECURE_ENCLAVE_HELPER. */
const secureEnclave = () => {
  if (process.platform !== 'darwin' && !process.env.WEAVE_SECURE_ENCLAVE_HELPER) throw new Error('the Secure Enclave is on Macs');
  const resources = (process as { resourcesPath?: string }).resourcesPath;
  // The app's Resources (the daemon runs as the app's own Node, Contents/MacOS/Weave), or installed by hand.
  return helper(process.env.WEAVE_SECURE_ENCLAVE_HELPER, [...(resources ? [join(resources, 'weave-se')] : []), join(dirname(process.execPath), '..', 'Resources', 'weave-se'), '/usr/local/bin/weave-se']);
};

/** YubiKey Manager's command line: WEAVE_YKMAN, or where its installers put it. */
const ykman = () =>
  helper(process.env.WEAVE_YKMAN, process.platform === 'win32' ? ['C:\\Program Files\\Yubico\\YubiKey Manager\\ykman.exe', 'C:\\Program Files\\Yubico\\YubiKey Manager CLI\\ykman.exe'] : ['/usr/local/bin/ykman', '/opt/homebrew/bin/ykman', '/usr/bin/ykman']);

/** What the hardware gives back, turned into the key that seals the home key. */
const sealingKey = (secret: Buffer, keystore: HardwareKeystore) => new Uint8Array(hkdfSync('sha256', secret, Buffer.alloc(0), `weave/vault/${keystore}/v1`, 32));

/** A hardware keystore takes the home key; checked by asking for it back. */
function wrapChecked(keystore: HardwareKeystore, key: Uint8Array): VaultFile {
  const stored = wrapHardware(keystore, key);
  try {
    if (b64u.encode(b64u.decode(unwrap(stored))) !== b64u.encode(key)) throw new Error('the keystore gave back something else');
  } catch (error) {
    forgetKeystore(stored);
    throw new Error(`${KEYSTORE_NAMES[keystore]} didn't give the key back: ${(error as Error).message.split('\n')[0]}`);
  }
  return stored;
}

function wrapHardware(keystore: HardwareKeystore, key: Uint8Array): VaultFile {
  const std = Buffer.from(key).toString('base64');
  try {
    switch (keystore) {
      case 'tpm': {
        if (process.platform !== 'win32') throw new Error('the TPM is used through Windows here');
        const item = `weave-${b64u.encode(randomBytes(9))}`;
        powershell(TPM('Create'), `${item}|`);
        return { v: 1, keystore, item, key: powershell(TPM('Wrap'), `${item}|${std}`) };
      }
      case 'secure-enclave': {
        const [cmd, args] = secureEnclave();
        const made = JSON.parse(run(cmd, [...args, 'create'], '')) as { blob: string; publicKey: string };
        // The key agreement's other half is made here, used once and dropped; only the enclave can do it again.
        const ecdh = createECDH('prime256v1');
        ecdh.generateKeys();
        const secret = ecdh.computeSecret(Buffer.from(made.publicKey, 'base64'));
        return { v: 1, keystore, blob: made.blob, peer: ecdh.getPublicKey('base64'), sealed: seal(sealingKey(secret, keystore), std, 'weave/vault/home-key') };
      }
      case 'yubikey': {
        const slot = Number(process.env.WEAVE_YUBIKEY_SLOT ?? 2);
        const challenge = randomBytes(32).toString('hex');
        return { v: 1, keystore, slot, challenge, sealed: seal(sealingKey(yubikeyAnswer(slot, challenge), keystore), std, 'weave/vault/home-key') };
      }
    }
  } catch (error) {
    throw new Error(`${KEYSTORE_NAMES[keystore]}: ${(error as Error).message.split('\n')[0]}`);
  }
}

function yubikeyAnswer(slot: number, challenge: string): Buffer {
  const [cmd, args] = ykman();
  const answer = run(cmd, [...args, 'otp', 'calculate', String(slot), challenge], '');
  if (!/^[0-9a-f]{40}$/i.test(answer)) throw new Error(`the YubiKey didn't answer (slot ${slot} needs challenge-response: ykman otp chalresp --generate ${slot})`);
  return Buffer.from(answer, 'hex');
}

/** What a keystore held for this home, removed (after moving to another). Best effort: the home key itself lives on. */
function forgetKeystore(stored: VaultFile): void {
  try {
    if (stored.keystore === 'tpm' && stored.item) powershell(TPM('Delete'), `${stored.item}|`);
    else if (stored.keystore === 'keychain' && stored.item) run('security', ['delete-generic-password', '-a', stored.item, '-s', 'Weave'], '');
    else if (stored.keystore === 'secret-service' && stored.item) run('secret-tool', ['clear', 'service', 'weave', 'home', stored.item], '');
  } catch {
    // Gone already, or not reachable: nothing more to do.
  }
}

export const KEYSTORE_NAMES: Record<Keystore, string> = {
  dpapi: 'Windows (DPAPI)',
  keychain: 'the macOS Keychain',
  'secret-service': 'the Secret Service',
  file: 'nothing (a file in the home)',
  kms: "the company's key service",
  tpm: "this computer's TPM",
  'secure-enclave': "this Mac's Secure Enclave",
  yubikey: 'a YubiKey',
};

/**
 * Hold this home's key somewhere else (stage 17): the operating system's keystore, a hardware one, or a file.
 * The home key stays the same, so nothing else changes; what the old keystore held for it is removed.
 */
export function moveHomeKey(home: Home, to: Exclude<Keystore, 'kms'> | 'os'): { from: Keystore; to: Keystore } {
  const current = readJson<VaultFile>(vaultPath(home));
  if (current?.keystore === 'kms') throw new Error("this home's key is in the company's key service (a company server's)");
  const key = vaultOf(home).key;
  const target = to === 'os' ? osKeystore() : to;
  if (current?.keystore === target) return { from: target, to: target };
  let stored: VaultFile;
  if ((HARDWARE_KEYSTORES as readonly string[]).includes(target)) stored = wrapChecked(target as HardwareKeystore, key);
  else if (target === 'file') stored = { v: 1, keystore: 'file', key: b64u.encode(key) };
  else {
    stored = wrap(target, b64u.encode(key), `weave-${b64u.encode(randomBytes(9))}`);
    if (b64u.encode(b64u.decode(unwrap(stored))) !== b64u.encode(key)) throw new Error(`${KEYSTORE_NAMES[target]} gave back something else`);
  }
  writeJson(vaultPath(home), stored);
  if (current) forgetKeystore(current);
  vaults.set(home.dir, { keystore: target, key, ...(target === 'file' ? { warning: FILE_WARNING } : {}) });
  return { from: current?.keystore ?? target, to: target };
}

/** Which keystores this computer offers: the operating system's, and the hardware ones that are here. */
export function keystoresHere(): Array<{ keystore: Keystore; name: string; ready: boolean; why?: string }> {
  const out: Array<{ keystore: Keystore; name: string; ready: boolean; why?: string }> = [{ keystore: osKeystore(), name: KEYSTORE_NAMES[osKeystore()], ready: true }];
  const check = (keystore: HardwareKeystore, probe: () => void) => {
    try {
      probe();
      out.push({ keystore, name: KEYSTORE_NAMES[keystore], ready: true });
    } catch (error) {
      out.push({ keystore, name: KEYSTORE_NAMES[keystore], ready: false, why: (error as Error).message.split('\n')[0] });
    }
  };
  check('tpm', () => {
    if (process.platform !== 'win32') throw new Error('Windows only, here');
    powershell("$ErrorActionPreference='Stop'; $null=[Security.Cryptography.CngKey]::Exists('weave-probe', (New-Object Security.Cryptography.CngProvider('Microsoft Platform Crypto Provider'))); 'ok'", '');
  });
  check('secure-enclave', () => void secureEnclave());
  check('yubikey', () => {
    const [cmd, args] = ykman();
    run(cmd, [...args, 'info'], '');
  });
  return out;
}

/** Hand the home key (base64url) to the keystore; secrets go through stdin, never the command line. */
function wrap(keystore: Keystore, key: string, item: string): VaultFile {
  const std = Buffer.from(b64u.decode(key)).toString('base64');
  switch (keystore) {
    case 'dpapi':
      return { v: 1, keystore, key: run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DPAPI('Protect')], std) };
    case 'keychain':
      run('security', ['-i'], `add-generic-password -U -a ${item} -s Weave -w ${std}\n`);
      return { v: 1, keystore, item };
    case 'secret-service':
      run('secret-tool', ['store', '--label=Weave home key', 'service', 'weave', 'home', item], std);
      return { v: 1, keystore, item };
    default:
      throw new Error(`no keystore ${keystore}`);
  }
}

/** The home key back from the keystore, base64url. */
function unwrap(stored: VaultFile): string {
  const std = (() => {
    switch (stored.keystore) {
      case 'dpapi':
        return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', DPAPI('Unprotect')], stored.key!);
      case 'keychain':
        return run('security', ['find-generic-password', '-a', stored.item!, '-s', 'Weave', '-w'], '');
      case 'secret-service':
        return run('secret-tool', ['lookup', 'service', 'weave', 'home', stored.item!], '');
      case 'tpm':
        return powershell(TPM('Unwrap'), `${stored.item}|${stored.key}`);
      case 'secure-enclave': {
        const [cmd, args] = secureEnclave();
        const secret = Buffer.from(run(cmd, [...args, 'agree'], JSON.stringify({ blob: stored.blob, peer: stored.peer })), 'base64');
        return open(sealingKey(secret, 'secure-enclave'), stored.sealed!, 'weave/vault/home-key') as string;
      }
      case 'yubikey':
        return open(sealingKey(yubikeyAnswer(stored.slot ?? 2, stored.challenge!), 'yubikey'), stored.sealed!, 'weave/vault/home-key') as string;
      default:
        throw new Error(`no keystore ${stored.keystore}`);
    }
  })();
  if (!std) throw new Error('the keystore has no key for it');
  return b64u.encode(new Uint8Array(Buffer.from(std, 'base64')));
}

const context = (home: Home, path: string) => `weave/vault/v1:${relative(home.dir, path).replaceAll('\\', '/')}`;

const isSealed = (value: unknown): value is SealedFile => !!value && typeof value === 'object' && (value as SealedFile).weaveSealed === 1;

/** Read a file of secrets: sealed ones are opened; one still in the clear (from before) is read as it is and sealed. */
export function readSecretJson<T>(home: Home, path: string): T | undefined {
  const stored = readJson<unknown>(path);
  if (stored === undefined) return undefined;
  if (isSealed(stored)) return open(vaultOf(home).key, stored, context(home, path)) as unknown as T;
  writeSecretJson(home, path, stored);
  return stored as T;
}

export function writeSecretJson(home: Home, path: string, value: unknown): void {
  const sealed = seal(vaultOf(home).key, value as Json, context(home, path));
  writeJson(path, { weaveSealed: 1, ...sealed } satisfies SealedFile);
}

/** For tests: forget opened vaults, as a new process would. */
export function forgetVaults(): void {
  vaults.clear();
}
