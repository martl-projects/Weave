import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-avatars-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Copy every event `from` has into `to`, as replication would. */
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

describe('avatars', () => {
  it('are public numbers by name, the latest counts, and null takes them back', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    expect((await martin.profile()).avatar).toBeUndefined();

    // Only names of letters with whole numbers 0..255 stay; the renderer makes sense of them.
    await martin.setProfile({ avatar: { hair: 3, hairColor: 1, eyes: 12, 'bad key': 4, mouth: 1.5, hat: 999 } as Record<string, number> });
    expect((await martin.profile()).avatar).toEqual({ hair: 3, hairColor: 1, eyes: 12 });
    await expect(martin.setProfile({ avatar: { 'not one': 1 } })).rejects.toThrow(/whole numbers/);

    // Others see it once they have the event, and ask for many at once.
    sync(martin, lena);
    expect(await lena.avatars([martin.identity.author, lena.identity.author])).toEqual({ [martin.identity.author]: { hair: 3, hairColor: 1, eyes: 12 } });

    // A name change leaves it alone.
    await martin.setProfile({ name: 'Martin S' });
    expect((await martin.profile()).avatar).toEqual({ hair: 3, hairColor: 1, eyes: 12 });

    await martin.setProfile({ avatar: null });
    expect((await martin.profile()).avatar).toBeUndefined();
    sync(martin, lena);
    expect(await lena.avatars([martin.identity.author])).toEqual({});
  });
});

describe('a space photo', () => {
  it('its founder sets a picture of its own and the banner, members see it, and an empty one goes back to the group photo', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createGroup('Crew');
    await lena.joinSpace(await martin.invite('Crew'));
    sync(martin, lena);
    sync(lena, martin);
    const photo = await martin.putBlob({ data: Buffer.from('a picture').toString('base64'), type: 'image/png' });

    const set = await martin.setSpacePhoto({ space: 'Crew', photo, banner: '  The crew  ' });
    expect(set).toMatchObject({ photo, bannerText: 'The crew' });
    sync(martin, lena);
    expect((await lena.spaces()).find((s) => s.name === 'Crew')).toMatchObject({ photo, bannerText: 'The crew' });

    // Only those who run it; and a photo is an uploaded image.
    await expect(lena.setSpacePhoto({ space: 'Crew', banner: 'Lena was here' })).rejects.toThrow(/only those who run/);
    await expect(martin.setSpacePhoto({ space: 'Crew', photo: 'https://example.com/a.png' })).rejects.toThrow(/uploaded image/);
    await expect(martin.setSpacePhoto({ space: 'Crew', background: 'https://example.com/b.png' })).rejects.toThrow(/uploaded image/);
    expect(await martin.setSpacePhoto({ space: 'Crew', background: photo })).toMatchObject({ photo, bannerText: 'The crew', background: photo });

    // Left out stays; empty removes.
    expect(await martin.setSpacePhoto({ space: 'Crew', photo: '' })).toMatchObject({ bannerText: 'The crew' });
    const back = await martin.setSpacePhoto({ space: 'Crew', banner: '', background: '' });
    expect(back.photo).toBeUndefined();
    expect(back.background).toBeUndefined();
    expect(back.bannerText).toBeUndefined();
  });
});

describe('scenes on posts', () => {
  it('a post carries a scene by its id; an edit changes or removes it', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Stage' });
    const post = await martin.submit({ space: 'Stage', title: 'I had an idea', scene: 'idea' });
    expect(post.scene).toBe('idea');
    await expect(martin.submit({ space: 'Stage', title: 'Nope', scene: 'Not A Scene' })).rejects.toThrow(/scene/);

    expect((await martin.editPost({ post: post.id, scene: 'celebrate' })).scene).toBe('celebrate');
    expect((await martin.editPost({ post: post.id, scene: '' })).scene).toBeUndefined();
    expect((await martin.submit({ space: 'Stage', title: 'Plain' })).scene).toBeUndefined();
  });
});
