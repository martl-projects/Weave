import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores, type FeedItem } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-watch-batch-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

describe('a watched node taking many events at once', () => {
  it("decodes everything once for a peer's batch, not once for each key event in it", async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    // Key events and posts by turns: each key event makes everything decode again, the next time it is needed.
    for (let i = 0; i < 12; i++) {
      await martin.addAgent(`agent${i}`, ['weave.post']);
      await martin.publish({ kind: 'weave.post', body: { title: `post ${i}`, text: 'x' } });
    }
    const batch = martin.replica.events();

    // Catching up on what was written while away: history, not live content counted against its author's budget.
    lena.clock = () => Date.now() + 2 * 3_600_000;
    const seen: FeedItem[] = [];
    const stop = new AbortController();
    const watching = lena.watch((item) => seen.push(item), stop.signal);
    await lena.posts({});
    // Everything decoded reads the whole log, unfiltered: counted here.
    let decodes = 0;
    const events = lena.replica.events.bind(lena.replica);
    lena.replica.events = (filter) => {
      if (!filter) decodes++;
      return events(filter);
    };
    lena.replica.batch(() => {
      for (const event of batch) lena.replica.ingest(event);
    });
    expect(decodes).toBe(0);
    await expect.poll(() => seen.filter((item) => item.kind === 'weave.post').length).toBe(12);
    expect(decodes).toBeLessThanOrEqual(2);
    // In the order they were taken in.
    expect(seen.filter((item) => item.kind === 'weave.post').map((item) => (item.body as { title: string }).title)).toEqual(batch.filter((e) => e.kind === 'weave.post').map((e) => (e.body as { title: string }).title));
    stop.abort();
    await watching;
  });
});
