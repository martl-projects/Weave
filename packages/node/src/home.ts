import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * A Weave home directory holds one person's node: identity, agent keys,
 * config and logs. Several homes on one machine are several simulated people.
 *
 *   identity.json   this device's key, acting for the person (old homes: the root key itself)
 *   encryption.json the person's encryption keys, newest last (old homes: none, the root key is used)
 *   agents/*.json   delegated agent keys
 *   groups/*.json   keys of the groups and projects you belong to (secret)
 *   config.json     topics to join, bootstrap nodes
 *   logs/*.jsonl    one append-only file per signing key
 *   blobs/<hash>    encrypted files (images), see @weave/core blobs
 *   daemon.json     port and token of the running daemon
 *   node.lock       pid of the one process writing to this home
 */
export interface Home {
  dir: string;
  identity: string;
  encryption: string;
  agents: string;
  groups: string;
  config: string;
  logs: string;
  blobs: string;
  daemon: string;
  lock: string;
}

export function resolveHome(dir?: string): Home {
  const root = resolve(dir ?? process.env.WEAVE_HOME ?? join(homedir(), '.weave'));
  return {
    dir: root,
    identity: join(root, 'identity.json'),
    encryption: join(root, 'encryption.json'),
    agents: join(root, 'agents'),
    groups: join(root, 'groups'),
    config: join(root, 'config.json'),
    logs: join(root, 'logs'),
    blobs: join(root, 'blobs'),
    daemon: join(root, 'daemon.json'),
    lock: join(root, 'node.lock'),
  };
}

export function readJson<T>(path: string): T | undefined {
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

/** Write via a temp file and rename, so a crash never leaves half a file. */
export function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  const temp = `${path}.tmp`;
  writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  renameSync(temp, path);
}
