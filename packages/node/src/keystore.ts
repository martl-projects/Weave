import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { b64u, createIdentity, createSubKey, didFromPublicKey, type Did, type SigningIdentity } from '@weave/core';
import { readJson, writeJson, type Home } from './home.ts';

interface StoredKey {
  author: Did;
  did: Did;
  publicKey: string;
  secretKey: string;
  name?: string;
  permissions?: string[];
}

export interface AgentKey extends SigningIdentity {
  name: string;
  permissions: string[];
}

const toStored = (identity: SigningIdentity, extra: Partial<StoredKey> = {}): StoredKey => ({
  author: identity.author,
  did: identity.did,
  publicKey: b64u.encode(identity.keys.publicKey),
  secretKey: b64u.encode(identity.keys.secretKey),
  ...extra,
});

function fromStored(stored: StoredKey): SigningIdentity {
  const keys = { publicKey: b64u.decode(stored.publicKey), secretKey: b64u.decode(stored.secretKey) };
  if (didFromPublicKey(keys.publicKey) !== stored.did) throw new Error(`key file for ${stored.did} is corrupt`);
  return { author: stored.author, did: stored.did, keys };
}

export function loadIdentity(home: Home): SigningIdentity | undefined {
  const stored = readJson<StoredKey>(home.identity);
  return stored && fromStored(stored);
}

export function createAndSaveIdentity(home: Home): SigningIdentity {
  if (loadIdentity(home)) throw new Error(`an identity already exists in ${home.dir}`);
  const identity = createIdentity();
  writeJson(home.identity, toStored(identity));
  return identity;
}

const AGENT_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;

export function createAndSaveAgent(home: Home, author: Did, name: string, permissions: string[]): AgentKey {
  if (!AGENT_NAME.test(name)) throw new Error('agent names use lowercase letters, digits and dashes');
  if (loadAgents(home).some((a) => a.name === name)) throw new Error(`agent "${name}" already exists`);
  const key = createSubKey(author);
  writeJson(join(home.agents, `${name}.json`), toStored(key, { name, permissions }));
  return { ...key, name, permissions };
}

export function loadAgents(home: Home): AgentKey[] {
  let files: string[];
  try {
    files = readdirSync(home.agents).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((file) => {
    const stored = readJson<StoredKey>(join(home.agents, file))!;
    return { ...fromStored(stored), name: stored.name ?? file.replace(/\.json$/, ''), permissions: stored.permissions ?? [] };
  });
}
