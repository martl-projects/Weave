import { readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Did, Invite, SpaceKeys } from '@weave/core';
import type { Home } from './home.ts';
import { readSecretJson, writeSecretJson } from './vault.ts';

/** A group's or project's keys plus where we first found its members. */
export interface StoredSpace extends SpaceKeys {
  entry: Invite['entry'];
  /** Keys of the read-limited boards we may read: board → epoch → key. */
  boards?: Record<string, Record<string, string>>;
  /** Who handed us the keys (inviter or giver): the one whose carry of earlier history we take. */
  via?: Did;
  /** Epochs shredded by the space's managers: their keys are gone and never taken again. */
  shredded?: number[];
}

export function loadSpaces(home: Home): StoredSpace[] {
  let files: string[];
  try {
    files = readdirSync(home.groups).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((file) => {
    const space = readSecretJson<StoredSpace>(home, join(home.groups, file))!;
    // Spaces from before groups and projects were told apart were encrypted as groups; read them as such.
    return { ...space, kind: space.kind ?? 'group' };
  });
}

export function saveSpace(home: Home, space: StoredSpace): void {
  writeSecretJson(home, join(home.groups, `${space.id}.json`), space);
}

/** Forget a space's keys on this computer. */
export function removeSpace(home: Home, id: string): void {
  rmSync(join(home.groups, `${id}.json`), { force: true });
}
