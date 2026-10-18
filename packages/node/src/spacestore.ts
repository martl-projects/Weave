import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { Invite, SpaceKeys } from '@weave/core';
import { readJson, writeJson, type Home } from './home.ts';

/** A group's or project's keys plus where we first found its members. */
export interface StoredSpace extends SpaceKeys {
  entry: Invite['entry'];
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
    // Spaces from before groups and projects were told apart were what projects are now.
    return { ...space, kind: space.kind ?? 'project' };
  });
}

export function saveSpace(home: Home, space: StoredSpace): void {
  writeJson(join(home.groups, `${space.id}.json`), space);
}
