// Measures how Weave copes with a busy home (see docs/v2-stage0.md).
//
//   node scripts/bench.ts seed <dir> <events>   build a home of three people (run with v2 or later)
//   node scripts/bench.ts run <dir>             open a copy of it and time the usual reads and a write
//
// seed leaves <dir>/home: the busy person's home with its logs as JSON lines
// (the format every version reads), so older versions can be measured on the
// same history: copy the script there and run `run` on the same <dir>.
import { cpSync, mkdtempSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { performance } from 'node:perf_hooks';
import { WeaveNode } from '../packages/node/src/index.ts';

const [mode, dir, count] = process.argv.slice(2);

if (mode === 'seed') {
  const n = Number(count ?? 1000);
  rmSync(dir, { recursive: true, force: true });
  const homes = ['martin', 'lena', 'kofi'].map((name) => join(dir, 'build', name));
  const [martin, lena, kofi] = homes.map((home, i) => WeaveNode.init(['Martin', 'Lena', 'Kofi'][i], home));
  const project = await martin.createProject({ name: 'Bench' });
  await lena.joinSpace(await martin.invite('Bench'));
  await kofi.joinSpace(await martin.invite('Bench'));
  const all = [martin, lena, kofi];
  // Each event reaches the others once (the history is written first, then handed over).
  const sync = () => {
    for (const from of all) for (const to of all) if (from !== to) for (const signer of from.replica.store.signers()) for (const e of from.replica.store.range(signer, (to.replica.store.head(signer)?.seq ?? 0) + 1)) to.replica.ingest(e);
  };
  sync();
  // Deterministic, so every run builds the same history.
  let s = 7;
  const random = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32);
  const posts: string[] = [];
  for (let i = 0; i < n; i++) {
    const who = all[Math.floor(random() * 3)];
    const r = random();
    if (r < 0.15 || posts.length === 0) {
      const item = await who.publish({ kind: 'weave.post', space: project.id, body: { title: `Post ${i}`, text: 'x'.repeat(200), board: 'ideas' } });
      posts.push(item.id);
    } else if (r < 0.3) {
      await who.publish({ kind: 'weave.upvote', space: project.id, body: { target: posts[Math.floor(random() * posts.length)], value: 1 } });
    } else {
      await who.publish({ kind: 'weave.msg', space: project.id, body: { text: `message ${i}`, post: posts[Math.floor(random() * posts.length)] } });
    }
  }
  sync();
  for (const node of all) await node.close();
  // Martin's home, with its logs as JSON lines.
  const home = join(dir, 'home');
  cpSync(homes[0], home, { recursive: true });
  for (const f of readdirSync(home).filter((f) => f.startsWith('weave.db'))) rmSync(join(home, f));
  const { SqliteStore } = await import('../packages/node/src/index.ts');
  const store = new SqliteStore(join(homes[0], 'weave.db'), { readOnly: true });
  const { events } = store.exportJsonl(join(home, 'logs'));
  store.close();
  rmSync(join(dir, 'build'), { recursive: true, force: true });
  console.log(`seeded ${dir}/home: ${events} events, ${posts.length} posts`);
} else if (mode === 'run') {
  const copy = mkdtempSync(join(tmpdir(), 'weave-bench-'));
  cpSync(join(dir, 'home'), copy, { recursive: true });
  const time = async <T>(label: string, fn: () => Promise<T> | T): Promise<T> => {
    const t = performance.now();
    const value = await fn();
    console.log(`${label.padEnd(34)} ${(performance.now() - t).toFixed(1).padStart(9)} ms`);
    return value;
  };
  global.gc?.();
  const before = process.memoryUsage().heapUsed;
  // The first open of an older home imports it (v2); time it, then the open that every later start does.
  const first = await time('open (first: imports logs if v2)', () => WeaveNode.open(copy));
  await first.close();
  const node = await time('open', () => WeaveNode.open(copy));
  await time('feed, first', () => node.feed({ limit: 50 }));
  await time('feed, again', () => node.feed({ limit: 50 }));
  const posts = await time('posts of the busy project', () => node.posts({ space: 'Bench' }));
  await time('posts again', () => node.posts({ space: 'Bench' }));
  await time('one post by id', () => node.post(posts[0].id));
  await time('say, then posts again', async () => {
    await node.say({ space: 'Bench', text: 'one more' });
    return node.posts({ space: 'Bench' });
  });
  await time('members', () => node.members('Bench'));
  global.gc?.();
  console.log(`${'heap after reads'.padEnd(34)} ${((process.memoryUsage().heapUsed - before) / 1e6).toFixed(1).padStart(9)} MB`);
  console.log(`${'events'.padEnd(34)} ${String((await node.status()).events).padStart(9)}`);
  await node.close();
  rmSync(copy, { recursive: true, force: true });
} else {
  console.error('usage: node scripts/bench.ts seed <dir> <events> | run <dir>');
  process.exit(1);
}
