import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { KIND_PAGE, WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string): WeaveNode {
  const dir = mkdtempSync(join(tmpdir(), 'weave-community-page-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

function syncAll(nodes: WeaveNode[]): void {
  for (let round = 0; round < 2; round++) for (const from of nodes) for (const to of nodes) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
}

const PIXEL = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

describe("a community's icon and banner", () => {
  it('its moderators set them and take them away; left out stays', async () => {
    const martl = person('martl');
    await martl.createCommunity({ name: 'Birdwatchers', description: 'Who saw **what**, and where.' });
    const icon = await martl.putBlob({ data: PIXEL, type: 'image/png' });
    const banner = await martl.putBlob({ data: PIXEL, type: 'image/png' });

    // Without them: as before, nothing but the description.
    const plain = await martl.community('Birdwatchers');
    expect(plain).not.toHaveProperty('icon');
    expect(plain).not.toHaveProperty('banner');
    expect((await martl.spaces('community'))[0]).not.toHaveProperty('icon');

    const set = await martl.setCommunity({ community: 'Birdwatchers', icon, banner });
    expect(set).toMatchObject({ icon, banner, description: plain.description });
    // The icon comes with the space itself: the sidebar and every list show it without asking per community.
    expect((await martl.spaces('community'))[0].icon).toBe(icon);

    // Only the description: the pictures stay. Only a picture: the description stays, as it was written.
    expect(await martl.setCommunity({ community: 'Birdwatchers', description: 'Birds, *seen*.' })).toMatchObject({ icon, banner, description: 'Birds, seen .' });
    const other = await martl.putBlob({ data: PIXEL, type: 'image/png' });
    expect(await martl.setCommunity({ community: 'Birdwatchers', icon: other })).toMatchObject({ icon: other, banner, description: 'Birds, seen .' });
    expect(await martl.feed({ kinds: [KIND_PAGE], limit: 1 })).toMatchObject([{ body: { description: 'Birds, *seen*.', icon: other, banner } }]);

    await expect(martl.setCommunity({ community: 'Birdwatchers', icon: 'https://example.com/bird.png' })).rejects.toThrow(/uploaded images/);
    await expect(martl.setCommunity({ community: 'Birdwatchers', banner: 'bird.png' })).rejects.toThrow(/uploaded images/);

    // Empty takes one away, the other stays.
    const noIcon = await martl.setCommunity({ community: 'Birdwatchers', icon: '' });
    expect(noIcon).not.toHaveProperty('icon');
    expect(noIcon.banner).toBe(banner);
    expect((await martl.spaces('community'))[0]).not.toHaveProperty('icon');
    expect(await martl.setCommunity({ community: 'Birdwatchers', banner: '' })).not.toHaveProperty('banner');
  });

  it('every member sees them; only a moderator changes them, and only a moderator is believed', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createCommunity({ name: 'Birdwatchers' });
    await lena.joinSpace(await martl.invite('Birdwatchers'));
    const icon = await martl.putBlob({ data: PIXEL, type: 'image/png' });
    const banner = await martl.putBlob({ data: PIXEL, type: 'image/png' });
    await martl.setCommunity({ community: 'Birdwatchers', icon, banner });
    syncAll([martl, lena]);

    expect(await lena.community('Birdwatchers')).toMatchObject({ icon, banner, moderator: false });
    expect((await lena.spaces('community'))[0].icon).toBe(icon);

    // A member who doesn't moderate can't: her own Weave refuses…
    const hers = await lena.putBlob({ data: PIXEL, type: 'image/png' });
    await expect(lena.setCommunity({ community: 'Birdwatchers', icon: hers })).rejects.toThrow(/only moderators of Birdwatchers/);
    await expect(lena.setCommunity({ community: 'Birdwatchers', banner: '' })).rejects.toThrow(/only moderators of Birdwatchers/);
    // …and a page she signs past it counts for nobody, herself included.
    await lena.publish({ kind: KIND_PAGE, body: { description: 'Mine now', icon: hers }, space: 'Birdwatchers' });
    syncAll([martl, lena]);
    for (const node of [martl, lena]) {
      expect(await node.community('Birdwatchers')).toMatchObject({ icon, banner, description: '' });
      expect((await node.spaces('community'))[0].icon).toBe(icon);
    }
  });

  it('a second moderator changes them too, and an agent only with the page permission', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    await martl.createCommunity({ name: 'Birdwatchers' });
    await lena.joinSpace(await martl.invite('Birdwatchers'));
    syncAll([martl, lena]);
    await martl.setModerator({ community: 'Birdwatchers', who: 'Lena', on: true });
    syncAll([martl, lena]);
    const hers = await lena.putBlob({ data: PIXEL, type: 'image/png' });
    await lena.setCommunity({ community: 'Birdwatchers', icon: hers });
    syncAll([martl, lena]);
    expect((await martl.spaces('community'))[0].icon).toBe(hers);

    const banner = await martl.putBlob({ data: PIXEL, type: 'image/png' });
    await martl.addAgent('claude', ['weave.post']);
    await expect(martl.setCommunity({ community: 'Birdwatchers', banner, as: 'claude' })).rejects.toThrow(/may not sign weave.project.page/);
    await martl.addAgent('painter', ['weave.project.page']);
    expect(await martl.setCommunity({ community: 'Birdwatchers', banner, as: 'painter' })).toMatchObject({ icon: hers, banner });
    syncAll([martl, lena]);
    expect(await lena.community('Birdwatchers')).toMatchObject({ icon: hers, banner });
  });
});
