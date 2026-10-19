import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Invite, SpaceKeys } from '@weave/core';
import { readJson, writeJson, type Home } from './home.ts';

/** A group's or project's keys plus where we first found its members. */
export interface StoredSpace extends SpaceKeys {
  entry: Invite['entry'];
  /** Keys of the read-limited boards we may read: board → epoch → key. */
  boards?: Record<string, Record<string, string>>;
}

export function loadSpaces(home: Home): StoredSpace[] {
  let files: string[];
  try {
    files = readdirSync(home.groups).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((file) => {
    const space = readJson<StoredSpace>(join(home.groups, file))!;
    // Spaces from before groups and projects were told apart were encrypted as groups; read them as such.
    return { ...space, kind: space.kind ?? 'group' };
  });
}

export function saveSpace(home: Home, space: StoredSpace): void {
  writeJson(join(home.groups, `${space.id}.json`), space);
}

/** Forget a space's keys on this computer. */
export function removeSpace(home: Home, id: string): void {
  rmSync(join(home.groups, `${id}.json`), { force: true });
}
