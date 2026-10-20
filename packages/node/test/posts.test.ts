import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it, vi } from 'vitest';
import { postLink } from '@weave/core';
import { WeaveNode } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true })));

function person(name: string) {
  const dir = mkdtempSync(join(tmpdir(), 'weave-posts-'));
  dirs.push(dir);
  return WeaveNode.init(name, dir);
}

/** Copy every event `from` has into `to`, as replication would. */
const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

describe('contact links', () => {
  it('adds someone by their link, even from a chat message, and finds them by name', async () => {
    const martin = person('Martin');
    const ada = person('Ada');
    const link = await ada.contactLink();
    expect(link).toMatch(/^weave:contact:/);
    expect(link).not.toContain(ada.identity.author.slice(8)); // encoded, holds no keys either
    const added = await martin.addContact(`Add me on Weave: ${link} see you!`);
    expect(added).toMatchObject({ did: ada.identity.author, name: 'Ada', contact: true, following: true });
    expect(martin.config.topics).toContain(ada.identity.author);
    expect((await martin.directory('ad')).map((p) => p.name)).toEqual(['Ada']);
    expect(await martin.directory('zz')).toEqual([]);
    await expect(ada.addContact(link)).rejects.toThrow(/your own/);
    await expect(martin.addContact('weave:contact:garbage')).rejects.toThrow(/damaged/);
    await martin.addContact(link); // twice is fine

    // A link from a private test network doesn't silently move an established node there.
    const tester = person('Tester');
    tester.config = { ...tester.config, bootstrap: [{ host: '127.0.0.1', port: 49737 }] };
    await expect(martin.addContact(await tester.contactLink())).rejects.toThrow(/private network at 127.0.0.1:49737.*public network/);
    expect(martin.config.bootstrap).toEqual([]);
    await tester.createGroup('Testers');
    await expect(martin.joinSpace(await tester.invite('Testers'))).rejects.toThrow(/weave bootstrap 127.0.0.1:49737/);
    expect(martin.replica.events().filter((e) => e.author === martin.identity.author && e.scope === 'self').length).toBe(1);
  });
});

describe('the app bundle', () => {
  it('connects a newcomer to the shipper and, through a free tier, into the project, with no clicks', async () => {
    const martin = person('Martin');
    const tier = await martin.createTier({ name: 'Weave friends', price: 0, auto: true, benefits: ['The Weave project'] });
    await martin.createProject({ name: 'Weave' });
    await martin.inviteGroup({ project: 'Weave', group: tier.id });
    await martin.setRule({ project: 'Weave', group: tier.id, auto: true });

    const ada = person('Ada');
    await ada.applyBundle({ contacts: [await martin.contactLink()], tiers: [{ tier: tier.id, creator: martin.identity.author, note: 'via the app' }] });
    expect((await ada.profile(martin.identity.author)).following).toBe(true);
    expect(ada.config.pendingMemberships).toHaveLength(1); // Martin's tier hasn't reached Ada yet

    sync(martin, ada);
    await ada.reconcile(); // now it has: the request goes out
    expect(ada.config.pendingMemberships).toEqual([]);
    sync(ada, martin);
    await martin.reconcile(); // automatic tier: let in, and on into Weave by the tier's rule
    expect(await martin.membershipRequests()).toEqual([]);
    expect((await martin.members('Weave')).map((m) => m.name)).toEqual(['Martin', 'Ada']);
    sync(martin, ada);

    expect((await ada.spaces('project')).map((s) => s.name)).toEqual(['Weave']);
    expect((await ada.memberships())[0]).toMatchObject({ name: 'Weave friends', membership: { active: true } });
    expect((await martin.profile(ada.identity.author)).following).toBe(false); // Martin follows back by hand
  });
});

describe('memberships', () => {
  it('lets a supporter ask for a tier, the creator grant it, and the tier key reach the supporter', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const tier = await martin.createTier({ name: 'Supporters', price: 500, description: 'Early builds and the lounge', benefits: ['Supporter lounge', 'Early access to p/Weave'] });
    expect(tier).toMatchObject({ name: 'Supporters', price: 500, currency: 'EUR', mine: true, members: 0, open: true });
    await martin.createProject({ name: 'Weave' });
    await martin.inviteGroup({ project: 'Weave', group: tier.id });
    await martin.setRule({ project: 'Weave', group: tier.id, auto: true });
    sync(martin, lena);

    expect((await lena.tiers('Martin')).map((t) => t.name)).toEqual(['Supporters']);
    await lena.requestMembership({ tier: tier.id, note: 'Sent €5 via PayPal' });
    expect((await lena.tiers('Martin'))[0].requested).toBe(true);
    sync(lena, martin);

    const [request] = await martin.membershipRequests();
    expect(request).toMatchObject({ tier: { name: 'Supporters' }, name: 'Lena', note: 'Sent €5 via PayPal' });
    expect(martin.replica.events().some((e) => JSON.stringify(e).includes('PayPal'))).toBe(false); // the note is boxed
    await martin.grantMembership({ tier: tier.id, who: 'Lena', months: 1 });
    expect(await martin.membershipRequests()).toEqual([]);
    expect((await martin.tiers())[0].members).toBe(1);
    await martin.reconcile(); // the tier is invited into Weave with a rule: Lena is admitted there too
    sync(martin, lena);

    const [mine] = await lena.memberships();
    expect(mine).toMatchObject({ name: 'Supporters', creator: { name: 'Martin' }, membership: { active: true } });
    await martin.say({ space: tier.id, text: 'Welcome to the lounge!' });
    sync(martin, lena);
    expect((await lena.messages(tier.id)).map((m) => m.text)).toEqual(['Welcome to the lounge!']);
    expect((await lena.spaces('project')).map((s) => s.name)).toEqual(['Weave']);
    await expect(lena.invite(tier.id)).rejects.toThrow(); // only the creator lets people into a tier
  });

  it('removes members whose grant ran out and rotates the tier key', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const tier = await martin.createTier({ name: 'Supporters' });
    sync(martin, lena);
    await lena.requestMembership({ tier: tier.id });
    sync(lena, martin);
    await martin.grantMembership({ tier: tier.id, who: 'Lena', months: 1 });
    const group = (await martin.spaces('group'))[0];

    // Two months later the grant has run out.
    expect(await martin.reconcile()).toBe(0);
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 62 * 86_400_000);
    try {
      expect(await martin.reconcile()).toBe(1);
      expect((await martin.members(tier.id)).map((m) => m.name)).toEqual(['Martin']);
      expect((await martin.spaces('group'))[0].epoch).toBe(group.epoch + 1);

      await martin.grantMembership({ tier: tier.id, who: 'Lena', months: 3 }); // renewing lets her back in
      expect((await martin.members(tier.id)).map((m) => m.name)).toEqual(['Martin', 'Lena']);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('direct chats', () => {
  it('lets friends chat privately, without any setup, and keeps everyone else out', async () => {
    const martin = person('Martin');
    const ada = person('Ada');
    const eve = person('Eve');
    await expect(martin.openChat(ada.identity.author)).rejects.toThrow(/friends/);
    await martin.setEdge({ edge: 'follow', who: ada.identity.author, on: true });
    await ada.setEdge({ edge: 'follow', who: martin.identity.author, on: true });
    sync(martin, ada);
    sync(ada, martin);

    const chat = await martin.openChat('Ada');
    expect(chat).toMatchObject({ kind: 'direct', name: 'Ada', members: 2 });
    await martin.say({ space: chat.id, text: 'Hey Ada, coffee later?' });
    sync(martin, ada);
    sync(martin, eve);

    const [adas] = await ada.chats();
    expect(adas).toMatchObject({ space: { id: chat.id, name: 'Martin' }, peer: { name: 'Martin' }, friend: true, last: { text: 'Hey Ada, coffee later?', mine: false } });
    const hey = (await ada.messages(adas.space.id))[0];
    await ada.say({ space: adas.space.id, text: 'Yes! ☕', replyTo: hey.short });
    sync(ada, martin);
    expect((await martin.messages(chat.id)).map((m) => m.text)).toEqual(['Hey Ada, coffee later?', 'Yes! ☕']);

    expect(await eve.chats()).toEqual([]); // Eve holds the events but can't read them
    expect((await eve.feed({ limit: 100 })).some((i) => i.kind === 'weave.msg')).toBe(false);
    expect((await martin.spaces()).some((s) => s.kind === 'direct')).toBe(false); // chats aren't listed as spaces

    await ada.setEdge({ edge: 'follow', who: martin.identity.author, on: false });
    sync(ada, martin);
    expect((await martin.chats())[0].friend).toBe(false);
    await expect(martin.say({ space: chat.id, text: 'hello?' })).rejects.toThrow(/read-only/);
  });
});

describe('posts, boards and communities', () => {
  it('treats a project as a post with boards, and turns issue and proposal boards into work and votes', async () => {
    const node = person('Martin');
    await node.createProject({ name: 'Weave', description: 'A p2p makers hub' });
    expect((await node.boards('Weave')).map((b) => b.name)).toEqual(['releases', 'ideas', 'issues', 'proposals']);

    const idea = await node.submit({ space: 'Weave', title: 'Pixel avatars?', text: 'Retro look' });
    expect(idea).toMatchObject({ type: 'post', board: 'ideas', chat: 0, score: 0 });
    const issue = await node.submit({ space: 'Weave', board: 'Issues', title: 'Encrypt keys at rest' });
    expect(issue).toMatchObject({ type: 'issue', issue: { status: 'open' } });
    expect((await node.issues('Weave')).map((i) => i.id)).toEqual([issue.id]);
    const proposal = await node.submit({ space: 'Weave', board: 'proposals', title: 'Adopt Hypercore' });
    expect(proposal.proposal?.eligible).toBe(1);
    await expect(node.submit({ space: 'Weave', board: 'nope', title: 'x' })).rejects.toThrow(/no board "nope"/);

    const [project] = await node.posts();
    expect(project).toMatchObject({ type: 'project', title: 'Weave', text: 'A p2p makers hub', project: { member: true, participants: 1 } });
    await node.upvote({ target: project.short, value: 1 });
    expect((await node.post(project.id)).score).toBe(1);
  });

  it('gives each post a chat of its own', async () => {
    const node = person('Martin');
    await node.createProject({ name: 'Weave' });
    const idea = await node.submit({ space: 'Weave', title: 'Pixel avatars?' });
    await node.say({ post: idea.short, text: 'love it' });
    await node.say({ space: 'Weave', text: 'in general' });
    expect((await node.messages(undefined, { post: idea.id })).map((m) => m.text)).toEqual(['love it']);
    expect((await node.messages('Weave', { channel: 'general' })).map((m) => m.text)).toEqual(['in general']);
    expect((await node.post(idea.id)).chat).toBe(1);
  });

  it('lets maintainers add boards and pin posts, in order', async () => {
    const node = person('Martin');
    await node.createProject({ name: 'Weave' });
    await node.setBoard({ project: 'Weave', name: 'Show off', sort: 'top', position: -1 });
    const a = await node.submit({ space: 'Weave', board: 'show-off', title: 'A' });
    const b = await node.submit({ space: 'Weave', board: 'show-off', title: 'B' });
    await node.curate({ space: 'Weave', board: 'show-off', pinned: [b.short, a.short] });
    expect((await node.boards('Weave'))[0]).toMatchObject({ name: 'show-off', title: 'Show off', sort: 'top', count: 2, pinned: [b.id, a.id] });
    expect((await node.posts({ space: 'Weave', board: 'show-off' })).map((p) => [p.title, p.pinned])).toEqual([
      ['B', true],
      ['A', true],
    ]);
  });

  it('runs a community: members post, upvote once each, chat per post; moderators pin', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const synths = await martin.createCommunity({ name: 'Synths', description: 'Modular everything' });
    expect(synths).toMatchObject({ kind: 'community', description: 'Modular everything', moderator: true });
    await lena.joinSpace(await martin.invite('Synths'));
    sync(martin, lena);
    sync(lena, martin);

    const post = await lena.submit({ space: 'Synths', title: 'My first case', link: 'https://example.com/case' });
    await lena.upvote({ target: post.id, value: 1 });
    await lena.upvote({ target: post.id, value: 1 });
    sync(lena, martin);
    await martin.upvote({ target: post.short, value: 1 });
    await martin.say({ post: post.short, text: 'Nice wood!' });
    sync(martin, lena);
    expect(await lena.post(post.id)).toMatchObject({ score: 2, myVote: 1, chat: 1, link: 'https://example.com/case', space: { kind: 'community', name: 'Synths' } });

    await expect(lena.curate({ space: 'Synths', pinned: [post.id] })).rejects.toThrow(/only moderators/);
    await martin.curate({ space: 'Synths', pinned: [post.id] });
    sync(martin, lena);
    expect((await lena.posts({ space: 'Synths' }))[0].pinned).toBe(true);
    expect((await lena.posts()).map((p) => p.title)).toContain('My first case');
  });

  it('opens a post from its link, for people who can see it', async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    const ada = person('Ada');
    await martin.createCommunity({ name: 'Synths' });
    await lena.joinSpace(await martin.invite('Synths'));
    sync(martin, lena);
    const post = await martin.submit({ space: 'Synths', title: 'Look at this case' });
    sync(martin, lena);
    sync(martin, ada);

    const link = postLink(post.id);
    expect(link).toBe(`weave:post:${post.id}`);
    expect(await lena.post(link)).toMatchObject({ id: post.id, title: 'Look at this case' });
    expect((await lena.post(`Have a look: ${link} !`)).id).toBe(post.id);
    await expect(ada.post(link)).rejects.toThrow(/no post found/); // not in Synths: the link shows her nothing
  });

  it('saves and pins posts privately, and shares projects into communities and to followers', async () => {
    const node = person('Martin');
    await node.createProject({ name: 'Weave', description: 'p2p' });
    await node.createCommunity({ name: 'Makers' });
    const [project] = await node.posts();

    const shared = await node.share({ post: project.id, to: 'Makers', text: 'Come build with us' });
    expect(shared).toMatchObject({ space: { name: 'Makers' }, text: 'Come build with us', share: { post: project.id, member: true }, project: { name: 'Weave', member: true } });
    await expect(node.share({ post: project.id, to: 'followers' })).rejects.toThrow(/public page/);
    await node.setProjectPage({ project: 'Weave', public: true });
    const pub = await node.share({ post: project.id, to: 'followers' });
    expect(pub.space).toBeUndefined();

    await node.save({ target: shared.id, mode: 'pinned' });
    await node.save({ target: project.id, mode: 'saved' });
    const home = await node.posts();
    expect(home[0]).toMatchObject({ id: shared.id, saved: 'pinned' });
    expect((await node.posts({ saved: true })).map((p) => p.id).sort()).toEqual([shared.id, project.id].sort());
    await node.save({ target: shared.id, mode: null });
    expect((await node.posts({ saved: true })).map((p) => p.id)).toEqual([project.id]);
    expect(node.replica.events().some((e) => JSON.stringify(e).includes('"pinned"'))).toBe(false); // saves are sealed
  });
});
