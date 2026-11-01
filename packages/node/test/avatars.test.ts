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

describe('agents and sessions', () => {
  it("a person sets their agents' avatars by name; others ask for them as did·agent", async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.addAgent('claude', ['weave.post']);
    await martin.setProfile({ avatar: { hair: 2 }, agentAvatars: { claude: { head: 1, screen: 2, screenColor: 3 } } });
    expect((await martin.profile()).agentAvatars).toEqual({ claude: { head: 1, screen: 2, screenColor: 3 } });
    await expect(martin.setProfile({ agentAvatars: { nobody: { head: 1 } } })).rejects.toThrow(/no agent named nobody/);

    // Changing your own keeps your agents', and the other way round.
    await martin.setProfile({ avatar: { hair: 5 } });
    sync(martin, lena);
    const me = martin.identity.author;
    expect(await lena.avatars([me, `${me}·claude`, `${me}·codex`])).toEqual({ [me]: { hair: 5 }, [`${me}·claude`]: { head: 1, screen: 2, screenColor: 3 } });
    await martin.setProfile({ agentAvatars: { claude: null } });
    expect((await martin.profile()).agentAvatars).toBeUndefined();
    expect((await martin.profile()).avatar).toEqual({ hair: 5 });
  });

  it("what an agent writes in a named session says which session, by name only", async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.addAgent('claude', ['weave.post', 'weave.msg']);
    await martin.createProject({ name: 'Studio' });
    await lena.joinSpace(await martin.invite('Studio'));
    sync(martin, lena);
    sync(lena, martin);
    const first = await martin.submit({ space: 'Studio', title: 'Setting up' });
    await martin.workOn({ session: { id: 's-1' }, post: first.id });
    await martin.nameSession({ session: { id: 's-1' }, name: 'Skala', about: 'Reviews' });
    await martin.setSessionAvatar({ session: { id: 's-1' }, avatar: { head: 1, screen: 2 } });

    const post = await martin.submit({ space: 'Studio', title: 'Found something', as: 'claude', session: { id: 's-1' } });
    const said = await martin.say({ space: 'Studio', text: 'On it', as: 'claude', session: { id: 's-1' } });
    sync(martin, lena);
    // Its name, never its avatar: that's for its person's harness views.
    expect((await lena.post(post.id)).by).toMatchObject({ agent: 'claude', session: { name: 'Skala' } });
    expect((await lena.messages('Studio')).find((m) => m.id === said.id)?.by.session).toEqual({ name: 'Skala' });
    // A person writing for themself, or an agent outside a session, carries none.
    expect((await martin.submit({ space: 'Studio', title: 'Mine', session: { id: 's-1' } })).by.session).toBeUndefined();
    expect((await martin.submit({ space: 'Studio', title: 'Its own', as: 'claude' })).by.session).toBeUndefined();
  });

  it('a session keeps its own avatar, privately, until it is taken back', async () => {
    const martin = person('Martin');
    await martin.createProject({ name: 'Desk' });
    const post = await martin.submit({ space: 'Desk', title: 'Something to do' });
    await martin.workOn({ session: { id: 'session-1' }, post: post.id });
    const set = await martin.setSessionAvatar({ session: { id: 'session-1' }, avatar: { head: 1, screen: 1 } });
    expect(set.avatar).toEqual({ head: 1, screen: 1 });
    expect((await martin.session({ id: 'session-1' })).avatar).toEqual({ head: 1, screen: 1 });
    await expect(martin.setSessionAvatar({ session: { id: 'session-1' }, avatar: {} })).rejects.toThrow(/whole numbers/);
    expect((await martin.setSessionAvatar({ session: { id: 'session-1' }, avatar: null })).avatar).toBeUndefined();
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
    // Members on the banner: projects only (they have one).
    await expect(martin.setSpacePhoto({ space: 'Crew', members: true })).rejects.toThrow(/only projects/);
    await martin.createProject({ name: 'Stage' });
    expect((await martin.setSpacePhoto({ space: 'Stage', members: true })).membersOnBanner).toBe(true);
    expect((await martin.setSpacePhoto({ space: 'Stage', banner: 'On stage' })).membersOnBanner).toBe(true);
    expect((await martin.setSpacePhoto({ space: 'Stage', members: false })).membersOnBanner).toBeUndefined();
    // Who stands where: their keys, each once; kept when other things change.
    const order = [lena.identity.author, martin.identity.author];
    expect((await martin.setSpacePhoto({ space: 'Crew', order })).photoOrder).toEqual(order);
    expect((await martin.setSpacePhoto({ space: 'Crew', background: '' })).photoOrder).toEqual(order);
    await expect(martin.setSpacePhoto({ space: 'Crew', order: ['Lena'] })).rejects.toThrow(/by their keys/);
    // How each one poses: a pose's or a scene's id, by their key; kept when other things change.
    const poses = { [lena.identity.author]: 'idea', [martin.identity.author]: 'crossed' };
    expect((await martin.setSpacePhoto({ space: 'Crew', poses })).photoPoses).toEqual(poses);
    expect((await martin.setSpacePhoto({ space: 'Crew', background: '' })).photoPoses).toEqual(poses);
    await expect(martin.setSpacePhoto({ space: 'Crew', poses: { Lena: 'wave' } })).rejects.toThrow(/people's keys/);
    await expect(martin.setSpacePhoto({ space: 'Crew', poses: { [lena.identity.author]: 'Not A Pose' } })).rejects.toThrow(/pose's id/);
    // Above the member list: groups by default, projects not (they have their banner); either way by choice.
    expect((await martin.spaces()).find((s) => s.name === 'Stage')?.photoInList).toBe(false);
    expect((await martin.setSpacePhoto({ space: 'Stage', list: true })).photoInList).toBe(true);
    expect((await martin.setSpacePhoto({ space: 'Crew', list: false })).photoInList).toBe(false);

    // Left out stays; empty removes.
    expect(await martin.setSpacePhoto({ space: 'Crew', photo: '' })).toMatchObject({ bannerText: 'The crew' });
    expect((await martin.spaces()).find((s) => s.name === 'Crew')?.photoInList).toBe(false);
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
