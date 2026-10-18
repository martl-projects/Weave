import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { GroupKeys, Invite } from '@weave/core';
import { readJson, writeJson, type Home } from './home.ts';

/** A group's keys plus where we first found its members. */
export interface StoredGroup extends GroupKeys {
  entry: Invite['entry'];
}

export function loadGroups(home: Home): StoredGroup[] {
  let files: string[];
  try {
    files = readdirSync(home.groups).filter((f) => f.endsWith('.json'));
  } catch {
    return [];
  }
  return files.map((file) => readJson<StoredGroup>(join(home.groups, file))!);
}

export function saveGroup(home: Home, group: StoredGroup): void {
  writeJson(join(home.groups, `${group.id}.json`), group);
}
