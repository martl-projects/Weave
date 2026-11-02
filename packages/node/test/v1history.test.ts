import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { closeOpenStores, SqliteStore, WeaveNode } from '../src/index.ts';

/*
 * E and Liane (2.11.2026): new to Weave, in martl's group Familie, and martl showed as his key, never by his name.
 * His profile is from before v0.4, signed again as v2 with `was` naming the v1 original: a node takes it only with
 * that original, and v1 logs went only to peers for keys that never wrote v2 (and root keys). His device key wrote
 * v2 since, so a node that wasn't there before v0.4 never got the original, and never his name.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
const home = () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-v1history-'));
  dirs.push(dir);
  return dir;
};

describe('someone whose history is from before v0.4', () => {
  it('shows by their name to a node that never saw v0.3', async () => {
    const dir = home();
    // martl as v0.3 wrote him: his name in a v1 profile.
    const before = WeaveNode.init('martl', dir, { writeVersion: 1 });
    await before.close();
    const store = new SqliteStore(join(dir, 'weave.db'));
    store.setMeta('migrated', '');
    store.close();
    // Moved to v0.4 on the next start: everything signed again as v2, the profile with `was`.
    const martl = WeaveNode.open(dir);
    nodes.push(martl);
    await martl.createGroup('Familie');

    const liane = WeaveNode.init('Liane', home());
    nodes.push(liane);
    await liane.joinSpace(await martl.invite('Familie'));
    const [sa, sb] = duplexPair();
    const left = new PeerSession2(martl.replica, sa, { access: martl.sessionAccess() });
    const right = new PeerSession2(liane.replica, sb, { access: liane.sessionAccess() });
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500));
      expect(liane.nameOf(martl.identity.author)).toBe('martl');
      expect((await liane.members('Familie')).map((m) => m.name)).toEqual(expect.arrayContaining(['martl', 'Liane']));
    } finally {
      left.close();
      right.close();
    }
  });
});
