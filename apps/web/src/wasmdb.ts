import sqlite3InitModule, { type Database } from '@sqlite.org/sqlite-wasm';
import type { SqlDatabase, SqlStatement, SqlValue } from '@weave/node/web';

/*
 * A database on OPFS, for a Worker. The SAH pool VFS needs no cross-origin isolation and is synchronous once it is open,
 * which LogStore needs. It lets one tab at a time hold the files, so the caller takes a lock first.
 */

/** The pool holds its files open, so a Worker opens it once. */
let opening: ReturnType<typeof openPool> | undefined;
const openPool = async () => (await sqlite3InitModule()).installOpfsSAHPoolVfs({ name: 'weave' });

export async function openWasmDatabase(name: string): Promise<SqlDatabase> {
  const pool = await (opening ??= openPool());
  return wasmDatabase(new pool.OpfsSAHPoolDb(`/${name}`));
}

/** The part of sqlite-wasm's database the store uses, wherever its files are. */
type WasmDb = Pick<Database, 'exec' | 'close' | 'prepare'>;

export function wasmDatabase(db: WasmDb): SqlDatabase {
  return {
    exec: (sql) => void db.exec(sql),
    close: () => void db.close(),
    prepare(sql): SqlStatement {
      const statement = db.prepare(sql);
      /** Bind, do `work`, and leave the statement ready for the next time, whatever happened. */
      const using = <T>(values: SqlValue[], work: () => T): T => {
        try {
          if (values.length) statement.bind(values);
          return work();
        } finally {
          statement.reset(true);
        }
      };
      return {
        run: (...values) => using(values, () => void statement.step()),
        get: (...values) => using(values, () => (statement.step() ? statement.get({}) : undefined)),
        all: (...values) =>
          using(values, () => {
            const rows: unknown[] = [];
            while (statement.step()) rows.push(statement.get({}));
            return rows;
          }),
      };
    },
  };
}
