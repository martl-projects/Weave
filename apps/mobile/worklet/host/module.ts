import * as sqlite from 'bare-sqlite';

/*
 * node:module on Bare, as far as the node uses it: its store asks for node:sqlite with a require of its own
 * (packages/node/src/sqlitestore.ts), and bare-sqlite's DatabaseSync is that one's.
 */

export function createRequire(_from: string | URL) {
  return (name: string): unknown => {
    if (name === 'node:sqlite') return sqlite;
    throw new Error(`${name} isn't there on a phone`);
  };
}

export default { createRequire };
