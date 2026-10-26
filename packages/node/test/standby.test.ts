import { cpSync, rmSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { loadConfig, resolveHome, saveConfig, WeaveNode } from '../src/index.ts';
import { people, sync } from './helpers/people.ts';

/*
 * Regression tests from the pre-release review, each reproducing an issue (its
 * id in the test's name) and checking it stays fixed.
 * They guard companies.ts: a promoted standby server's generation.
 */

const { person, home: newHome, nodes } = people('standby');

describe('a promoted standby fences off the old server (nQ9JHlUV)', () => {
  it('the old server stands down when it hears of the newer generation', async () => {
    const old = person('Acme server');
    await old.close();
    // A copy of its home, as a standby restored from a backup has.
    const dirB = newHome();
    rmSync(dirB, { recursive: true, force: true });
    cpSync(old.home.dir, dirB, { recursive: true });
    // As weave-server promote does on the copy.
    const home = resolveHome(dirB);
    saveConfig(home, { ...loadConfig(home), generation: 1 });
    const promoted = WeaveNode.open(dirB);
    nodes.push(promoted);
    await promoted.reconcile();
    const back = WeaveNode.open(old.home.dir);
    nodes.push(back);
    sync(promoted, back);
    expect(back.config.standby).toBe(true);
    await expect(back.setProfile({ name: 'still me?' })).rejects.toThrow(/standby/);
    await promoted.setProfile({ name: 'Acme server 2' });
  });
});
