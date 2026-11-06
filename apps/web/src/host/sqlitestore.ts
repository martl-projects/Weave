import { SqlStore } from '@weave/node/web';
import type { WeaveEvent } from '@weave/core';

/* In place of packages/node/src/sqlitestore.ts: a home's store is the one the Worker opened on OPFS. */

let store: SqliteStore | undefined;

/** The store's class by the name the node knows it under. */
export class SqliteStore extends SqlStore {}

/** Use this store for the home the Worker is about to open. */
export function useStore(database: ConstructorParameters<typeof SqlStore>[0]): void {
  store = new SqliteStore(database);
}

export function openStore(): { store: SqliteStore; imported?: number; warning?: string } {
  if (!store) throw new Error('no store yet: useStore comes first');
  return { store };
}

export const closeOpenStores = (): void => store?.close();
export const readJsonlLogs = (): WeaveEvent[] => [];
