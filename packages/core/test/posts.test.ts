import { describe, expect, it } from 'vitest';
import { boardsOf, createIdentity, eventId, messagesOf, postsOf, rank, Replica, savesOf, scoresOf, type Did, type Entry, type Json, type SigningIdentity } from '../src/index.ts';

function setup() {
  const replica = new Replica();
  const entries: Entry[] = [];
  let minute = 0;
  const post = (who: SigningIdentity, kind: string, body: Json, time?: string): string => {
    const event = replica.append(who, { kind, body, time: time ?? `2026-10-18T10:${String(minute++).padStart(2, '0')}:00.000Z` });
    entries.push({ id: eventId(event), event, kind, body });
    return eventId(event);
  };
  return { entries, post };
}

describe('posts and boards', () => {
  it('sorts posts, issues, proposals and old threads into a project’s boards', () => {
    const { entries, post } = setup();
    const alice = createIdentity();
    const release = post(alice, 'weave.post', { title: 'v0.1 is out', text: 'notes', board: 'releases' });
    const legacy = post(alice, 'weave.post', { text: 'First build runs!\nMore soon' });
    const idea = post(alice, 'weave.thread', { title: 'Hypercore?', text: '' });
    const issue = post(alice, 'weave.issue', { title: 'Encrypt keys', text: '', labels: [] });
    const posts = postsOf('project', entries);
    expect(posts.map((p) => [p.id, p.board, p.type])).toEqual([
      [release, 'releases', 'post'],
      [legacy, 'releases', 'post'],
      [idea, 'ideas', 'post'],
      [issue, 'issues', 'issue'],
    ]);
    expect(posts[1].title).toBe('First build runs!');
  });

  it('lets maintainers add, reorder, pin and drop boards, ignoring everyone else', () => {
    const { entries, post } = setup();
    const [alice, mallory] = [createIdentity(), createIdentity()];
    const maintainers = new Set<Did>([alice.did]);
    post(alice, 'weave.board', { name: 'Show Off', title: 'Show-off', type: 'posts', position: -1 });
    post(alice, 'weave.board', { name: 'proposals', on: false });
    post(alice, 'weave.curate', { board: 'ideas', pinned: ['b', 'a', 'b'] });
    post(mallory, 'weave.board', { name: 'spam', title: 'Spam' });
    post(alice, 'weave.board', { name: 'issues', type: 'posts', title: 'Bugs' }); // keeps its type
    const boards = boardsOf('project', entries, maintainers);
    expect(boards.map((b) => b.name)).toEqual(['show-off', 'releases', 'ideas', 'issues']);
    expect(boards.find((b) => b.name === 'ideas')!.pinned).toEqual(['b', 'a']);
    expect(boards.find((b) => b.name === 'issues')).toMatchObject({ title: 'Bugs', type: 'issues' });
    expect(boardsOf('community', entries, maintainers).map((b) => b.name)).toEqual(['posts']);
  });

  it('counts one upvote per person, whichever key cast it, latest winning', () => {
    const { entries, post } = setup();
    const [alice, bob] = [createIdentity(), createIdentity()];
    post(alice, 'weave.upvote', { target: 'p', value: 1 });
    post(alice, 'weave.upvote', { target: 'p', value: 1 });
    post(bob, 'weave.upvote', { target: 'p', value: -1 });
    post(bob, 'weave.upvote', { target: 'p', value: 0 });
    post(bob, 'weave.upvote', { target: 'q', value: 7 }); // invalid
    expect(scoresOf(entries).get('p')).toMatchObject({ score: 1, up: 1, down: 0 });
    expect(scoresOf(entries).has('q')).toBe(false);
  });

  it('ranks pinned posts first, then hot, new or top', () => {
    const now = Date.parse('2026-10-18T12:00:00Z');
    const posts = [
      { id: 'old-popular', time: '2026-10-16T12:00:00Z', active: '2026-10-16T12:00:00Z', score: 20 },
      { id: 'fresh', time: '2026-10-18T11:00:00Z', active: '2026-10-18T11:00:00Z', score: 2 },
      { id: 'old-busy-chat', time: '2026-10-15T12:00:00Z', active: '2026-10-18T11:30:00Z', score: 3 },
      { id: 'pinned', time: '2026-10-01T12:00:00Z', active: '2026-10-01T12:00:00Z', score: 0 },
    ];
    expect(rank(posts, 'hot', ['pinned'], now).map((p) => p.id)).toEqual(['pinned', 'old-busy-chat', 'fresh', 'old-popular']);
    expect(rank(posts, 'new', [], now).map((p) => p.id)).toEqual(['fresh', 'old-popular', 'old-busy-chat', 'pinned']);
    expect(rank(posts, 'top', [], now)[0].id).toBe('old-popular');
  });

  it('gives every post its own chat, apart from the channels', () => {
    const { entries, post } = setup();
    const alice = createIdentity();
    const p = post(alice, 'weave.post', { title: 'Look at this' });
    post(alice, 'weave.msg', { text: 'in general' });
    post(alice, 'weave.msg', { text: 'about the post', post: p });
    post(alice, 'weave.reply', { target: p, text: 'an old reply' });
    expect(messagesOf(entries, { channel: 'general' }).map((m) => m.text)).toEqual(['in general']);
    expect(messagesOf(entries, { post: p }).map((m) => m.text)).toEqual(['about the post', 'an old reply']);
  });

  it('keeps saves and pins per target, latest winning', () => {
    const { entries, post } = setup();
    const alice = createIdentity();
    post(alice, 'weave.save', { target: 'a', mode: 'saved' });
    post(alice, 'weave.save', { target: 'b', mode: 'pinned' });
    post(alice, 'weave.save', { target: 'a', mode: null });
    expect([...savesOf(entries)]).toEqual([['b', 'pinned']]);
  });
});
