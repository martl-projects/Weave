import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { people } from './helpers/people.ts';

/*
 * A daemon started from a checkout that never built packages/shipped runs without Unread, Websites, GitHub releases
 * and the rest, and nothing said so (1.11.2026: the counts next to places were gone for a day). Its status says it now.
 */

const { person, home } = people('shippedmissing');

describe('a daemon without the services Weave ships', () => {
  it('says so in its status; one with them says nothing', async () => {
    const node = person('Martin');
    node.wasmSetup.shippedDir = join(home(), 'nowhere');
    expect((await node.status()).shippedMissing).toBe(true);
    // A folder with the list of what's shipped (CI never builds packages/shipped/dist).
    const shipped = join(home(), 'shipped');
    mkdirSync(shipped, { recursive: true });
    writeFileSync(join(shipped, 'shipped.json'), '[]');
    node.wasmSetup.shippedDir = shipped;
    expect((await node.status()).shippedMissing).toBeUndefined();
  });
});
