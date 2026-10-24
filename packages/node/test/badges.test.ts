import { mkdtempSync, rmSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { KIND_BADGE, KIND_BADGE_NOTE, KIND_BADGE_TRANSFER } from '@weave/core';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const sdk = createRequire(import.meta.url)('../../sdk/src/index.cjs') as typeof import('../../sdk/src/index.d.cts');

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
afterAll(async () => {
  for (const node of nodes) await node.close();
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-badges-'));
  dirs.push(dir);
  const node = WeaveNode.init(name, dir);
  nodes.push(node);
  return node;
}

/** Copy every event `from` has into `to`, as replication would. */
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

/** Martin maintains Weave and has started a limited series; Lena and Ada know him. */
async function setup(limit = 3) {
  const martin = person('Martin');
  const lena = person('Lena');
  const ada = person('Ada');
  await martin.createProject({ name: 'Weave' });
  const series = await martin.createBadgeSeries({ project: 'Weave', name: 'Super Supporter', symbol: '🌟', description: 'One of the first', limit });
  for (const other of [lena, ada]) {
    sync(other, martin);
    sync(martin, other);
  }
  return { martin, lena, ada, series };
}

describe('badges', () => {
  it('lets a maintainer start a limited series and give numbered badges, checkable by anyone', async () => {
    const { martin, lena, ada, series } = await setup();
    expect(series).toMatchObject({ name: 'Super Supporter', symbol: '🌟', limit: 3, given: 0, broken: false, mine: true, project: { name: 'Weave' } });

    const first = await martin.giveBadge({ series: 'Super Supporter', who: 'Lena', note: 'Backed Weave in its first week' });
    expect(first).toMatchObject({ n: 1, holder: { name: 'Lena' }, issuer: { name: 'Martin' }, series: { name: 'Super Supporter', limit: 3 } });
    await martin.giveBadge({ series: series.id, who: 'Ada' });
    sync(martin, lena);
    sync(martin, ada);

    // Anyone holding Martin's events sees them, and they're Martin's signatures.
    expect((await ada.badges('Lena')).map((b) => [b.series.name, b.n, b.note])).toEqual([['Super Supporter', 1, 'Backed Weave in its first week']]);
    expect((await lena.badges()).map((b) => b.mine)).toEqual([true]);
    expect((await lena.badgeSeries())[0]).toMatchObject({ given: 2, limit: 3, mine: false, issuer: { name: 'Martin' } });

    // Others can't give his badges or change his series, and nobody but maintainers starts one.
    await expect(lena.giveBadge({ series: series.id, who: 'Ada' })).rejects.toThrow(/only Martin/);
    await expect(lena.setBadgeSeries({ series: series.id, name: 'Mine now' })).rejects.toThrow(/only Martin/);
    await lena.joinSpace(await martin.invite('Weave'));
    await expect(lena.createBadgeSeries({ project: 'Weave', name: 'Fake' })).rejects.toThrow(/maintainers/);
  });

  it('stops at the limit, and the limit can never be raised', async () => {
    const { martin, series } = await setup(1);
    await martin.giveBadge({ series: series.id, who: 'Lena' });
    await expect(martin.giveBadge({ series: series.id, who: 'Ada' })).rejects.toThrow(/all 1 of Super Supporter/);
    // A later series event can rename it, but its limit stays the first one.
    martin.replica.write(martin.identity, { kind: 'weave.badge.series', body: { series: series.id, name: 'Renamed', symbol: '', description: '', limit: 100 } });
    expect((await martin.badgeSeries())[0]).toMatchObject({ name: 'Renamed', limit: 1 });
  });

  it('shows an issuer who signs past the limit or a number twice, for good', async () => {
    const { martin, lena, ada, series } = await setup(2);
    await martin.giveBadge({ series: series.id, who: 'Lena' });
    // Martin's node would refuse; a cheating node signs anyway: number 1 again, and number 3 of 2.
    martin.replica.write(martin.identity, { kind: KIND_BADGE, body: { series: series.id, n: 1, to: ada.identity.author } });
    martin.replica.write(martin.identity, { kind: KIND_BADGE, body: { series: series.id, n: 3, to: ada.identity.author } });
    sync(martin, ada);

    const seen = await ada.badgeSeries();
    expect(seen[0]).toMatchObject({ broken: true, given: 0 });
    expect((await ada.badges('Lena'))[0]).toMatchObject({ n: 1, invalid: 'duplicate' });
    expect((await ada.badges()).map((b) => b.invalid).sort()).toEqual(['duplicate', 'over-limit']);
    await expect(martin.giveBadge({ series: series.id, who: 'Ada' })).rejects.toThrow(/broken/);
    // A badge whose number was given twice can't be passed on.
    sync(martin, lena);
    await expect(lena.transferBadge({ badge: (await lena.badges())[0].id, to: 'Ada' })).rejects.toThrow(/isn't valid/);
  });

  it('lets the holder pass a badge on; it keeps its number, and the chain of holders shows', async () => {
    const { martin, lena, ada, series } = await setup();
    const badge = await martin.giveBadge({ series: series.id, who: 'Lena' });
    sync(martin, lena);
    sync(martin, ada);

    await expect(ada.transferBadge({ badge: badge.id, to: 'Ada' })).rejects.toThrow(/don't hold/);
    const passed = await lena.transferBadge({ badge: badge.id.slice(0, 8), to: 'Ada' });
    expect(passed).toMatchObject({ n: 1, holder: { name: 'Ada' }, mine: false });
    sync(lena, ada);
    sync(lena, martin);

    expect(await lena.badges()).toEqual([]);
    const [held] = await ada.badges();
    expect(held.holders.map((h) => h.name)).toEqual(['Lena', 'Ada']);
    expect((await martin.badges('Ada'))[0].id).toBe(badge.id);

    // And on again: Ada passes it back.
    await ada.transferBadge({ badge: badge.id, to: 'Lena' });
    sync(ada, martin);
    expect((await martin.badges('Lena'))[0].holders.map((h) => h.name)).toEqual(['Lena', 'Ada', 'Lena']);
  });

  it("doesn't let a holder pass one badge on twice: the earlier transfer counts, the badge shows as contested", async () => {
    const { martin, lena, ada, series } = await setup();
    const badge = await martin.giveBadge({ series: series.id, who: 'Lena' });
    sync(martin, lena);
    await lena.transferBadge({ badge: badge.id, to: 'Ada' });
    // A cheating node signs a second transfer from the same point, to Martin.
    lena.replica.write(lena.identity, { kind: KIND_BADGE_TRANSFER, body: { badge: badge.id, from: badge.id, to: martin.identity.author } });
    // And someone who never held it tries too.
    martin.replica.write(martin.identity, { kind: KIND_BADGE_TRANSFER, body: { badge: badge.id, from: badge.id, to: martin.identity.author } });
    sync(lena, ada);
    sync(martin, ada);

    const [held] = await ada.badges();
    expect(held).toMatchObject({ holder: { name: 'Ada' }, contested: true });
    expect(await ada.badges('Martin')).toEqual([]);
  });

  it('gives a series its own picture, shown with every badge of it', async () => {
    const { martin, lena, series } = await setup();
    const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    const image = await martin.putBlob({ data: PIXEL, type: 'image/png' });
    await martin.setBadgeSeries({ series: series.id, image });
    await martin.giveBadge({ series: series.id, who: 'Lena' });
    sync(martin, lena);
    expect((await lena.badges())[0].series.image).toBe(image);
    expect((await lena.badgeSeries())[0]).toMatchObject({ image, limit: 3 });
    await expect(martin.setBadgeSeries({ series: series.id, image: 'https://example.com/x.png' })).rejects.toThrow(/uploaded image/);
    await martin.setBadgeSeries({ series: series.id, image: '' }); // removed: the symbol shows again
    expect((await martin.badgeSeries())[0]).not.toHaveProperty('image');
  });

  it("tells the project's app which of its badges someone holds", async () => {
    const { martin, lena, series } = await setup();
    await martin.createProject({ name: 'Gameshow' });
    await martin.createBadgeSeries({ project: 'Gameshow', name: 'Quizmaster', symbol: '🎤' });
    await martin.giveBadge({ series: 'Quizmaster', who: 'Lena', ref: 'post:abc' });
    await martin.giveBadge({ series: series.id, who: 'Lena' });
    await martin.publishApp({ project: 'Gameshow', manifest: { app: 'quizshow', name: 'Quiz', services: [{ id: 'show', port: 4100 }] } });

    const weave = sdk.connect(await martin.appEnv('Gameshow'))!;
    // Only Gameshow's badges: an app reads about its own project.
    expect(await weave.badges(lena.identity.author)).toEqual([
      expect.objectContaining({ series: expect.objectContaining({ name: 'Quizmaster', symbol: '🎤' }), n: 1, ref: 'post:abc', issuer: { did: martin.identity.author, name: 'Martin' } }),
    ]);
    expect(await weave.badges(martin.identity.author)).toEqual([]);
  });

  it("seals a personal note to the one given the badge, until they publish it in words provably the issuer's", async () => {
    const { martin, lena, ada } = await setup();
    const words = 'Lena, you believed in Weave before there was anything to see.\nThank you.';
    const badge = await martin.giveBadge({ series: 'Super Supporter', who: 'Lena', note: 'Backed Weave in its first week', personal: words });
    sync(martin, lena);
    sync(martin, ada);

    // Lena and Martin read it; Ada sees only that there is one. Its text is in no public event.
    expect((await lena.badges())[0].personal).toEqual({ text: words, published: false, mayPublish: true });
    expect((await martin.badges('Lena'))[0].personal).toEqual({ text: words, published: false, mayPublish: false });
    expect((await ada.badges('Lena'))[0].personal).toEqual({ published: false, mayPublish: false });
    expect(JSON.stringify(martin.replica.events())).not.toContain('believed in Weave');
    await expect(ada.publishBadgeNote({ badge: badge.id })).rejects.toThrow(/only the one a badge was given to/);

    // Lena publishes it: everyone reads it, and it's checked against Martin's signed hash.
    await lena.publishBadgeNote({ badge: badge.id });
    sync(lena, ada);
    expect((await ada.badges('Lena'))[0].personal).toEqual({ text: words, published: true, mayPublish: false });

    // Words she makes up don't count: they don't match what Martin signed.
    lena.replica.write(lena.identity, { kind: KIND_BADGE_NOTE, body: { badge: badge.id, text: 'Martin says Lena is the best', salt: 'AAAAAAAAAAAAAAAAAAAAAA', on: true } });
    sync(lena, ada);
    expect((await ada.badges('Lena'))[0].personal).toEqual({ text: words, published: true, mayPublish: false });

    // She can take it back too.
    await lena.publishBadgeNote({ badge: badge.id, on: false });
    sync(lena, ada);
    expect((await ada.badges('Lena'))[0].personal).toEqual({ published: false, mayPublish: false });
    expect((await lena.badges())[0].personal?.text).toBe(words);

    // A badge without one has none; a note too long is refused.
    expect((await martin.giveBadge({ series: 'Super Supporter', who: 'Ada' })).personal).toBeUndefined();
    await expect(martin.giveBadge({ series: 'Super Supporter', who: 'Ada', personal: 'x'.repeat(2001) })).rejects.toThrow(/at most 2000/);
  });
});
