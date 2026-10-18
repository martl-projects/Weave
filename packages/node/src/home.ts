import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';

/**
 * A Weave home directory holds one person's node: identity, agent keys,
 * config and logs. Several homes on one machine are several simulated people.
 *
 *   identity.json   root key (plaintext for now — to be encrypted)
 *   agents/*.json   delegated agent keys
 *   config.json     topics to join, bootstrap nodes
 *   logs/*.jsonl    one append-only file per signing key
 *   daemon.json     port and token of the running daemon
 */
export interface Home {
  dir: string;
  identity: string;
  agents: string;
  config: string;
  logs: string;
  daemon: string;
}

export function resolveHome(dir?: string): Home {
  const root = resolve(dir ?? process.env.WEAVE_HOME ?? join(homedir(), '.weave'));
  return {
    dir: root,
    identity: join(root, 'identity.json'),
    agents: join(root, 'agents'),
    config: join(root, 'config.json'),
    logs: join(root, 'logs'),
    daemon: join(root, 'daemon.json'),
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
