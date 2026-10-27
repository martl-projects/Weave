import { describe, expect, it } from 'vitest';
import { boardsOf, createIdentity, eventId, messagesOf, personKeyOf, personPath, personTargetOf, personUrl, postPath, postRefsIn, postsOf, postTargetOf, postUrl, rank, Replica, savesOf, scoresOf, shortPrefixes, slugOf, type Did, type Entry, type Json, type SigningIdentity } from '../src/index.ts';

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

  it('applies the author’s latest edit and drops deleted posts', () => {
    const { entries, post } = setup();
    const [alice, bob, mod] = [createIdentity(), createIdentity(), createIdentity()];
    const first = post(alice, 'weave.post', { title: 'Draft', text: 'old', link: 'https://a.example' });
    const second = post(bob, 'weave.post', { title: 'Bob’s' });
    const third = post(bob, 'weave.post', { title: 'Spam' });
    post(alice, 'weave.post.edit', { target: first, title: 'Better', text: 'new' });
    post(alice, 'weave.post.edit', { target: first, link: '' });
    post(bob, 'weave.post.edit', { target: first, title: 'Not yours' });
    post(alice, 'weave.post.delete', { target: second }); // not hers, not a moderator
    post(mod, 'weave.post.delete', { target: third });
    const posts = postsOf('community', entries, new Set<Did>([mod.did]));
    expect(posts.map((p) => p.id)).toEqual([first, second]);
    expect(posts[0]).toMatchObject({ title: 'Better', text: 'new', edited: '2026-10-18T10:04:00.000Z' });
    expect(posts[0]).not.toHaveProperty('link');
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

describe('post addresses', () => {
  const project = { id: 'NqgQwm_P6I0gtnQDnZKURw', name: 'Weave' };

  it('names a post by its project, board, short ids and title', () => {
    const place = { id: 'aq1i-cIJ0QUM8K5ak8QZ3XUuDJeDwB2JTCTyA7qn_vU', title: 'Links from Claude Code: back to Weave!', space: project, board: 'ideas' };
    const prefix = (id: string) => id.slice(0, 4);
    expect(postPath(place, prefix)).toBe('weave~NqgQ/ideas/aq1i/links-from-claude-code-back-to-weave');
    expect(postUrl(place, prefix)).toBe('http://weave.localhost:7710/weave~NqgQ/ideas/aq1i/links-from-claude-code-back-to-weave');
    expect(postPath({ ...place, project: true }, prefix)).toBe('weave~NqgQ');
    expect(postPath({ id: place.id, title: 'Hello', author: 'Lena Müller' }, prefix)).toBe('@lena-muller/aq1i/hello');
    expect(slugOf('Ünïcödé — and ✨ emoji')).toBe('unicode-and-emoji');
    expect(slugOf('日本語')).toBe('');
  });

  it('keeps short ids unique, at least four characters', () => {
    const prefixes = shortPrefixes(['abcdef', 'abcdxy', 'zzzzzz', 'abcdeg']);
    expect(prefixes.get('zzzzzz')).toBe('zzzz');
    expect(prefixes.get('abcdxy')).toBe('abcdx');
    expect(prefixes.get('abcdef')).toBe('abcdef');
    expect(prefixes.get('abcdeg')).toBe('abcdeg');
  });

  it('reads addresses back, with or without the host, ignoring names and port', () => {
    expect(postTargetOf('see http://weave.localhost:7710/weave~NqgQ/ideas/aq1i/links-from-claude-code.')).toEqual({ space: 'NqgQ', post: 'aq1i' });
    expect(postTargetOf('http://weave.localhost:9999/anything~NqgQ/x/aq1i')).toEqual({ space: 'NqgQ', post: 'aq1i' });
    expect(postTargetOf('http://weave.localhost:7710/weave~NqgQ')).toEqual({ space: 'NqgQ' });
    expect(postTargetOf('http://weave.localhost:7710/@martl/-nt5_W/a-title')).toEqual({ post: '-nt5_W', public: true });
    expect(postTargetOf('as in weave~NqgQ/ideas/aq1i, see')).toEqual({ space: 'NqgQ', post: 'aq1i' });
    expect(postTargetOf('~NqgQ/posts/aq1i')).toEqual({ space: 'NqgQ', post: 'aq1i' });
    // Ordinary text and other hosts are not addresses.
    expect(postTargetOf('weave~NqgQ on its own')).toBeUndefined();
    expect(postTargetOf('@martl/aq1i')).toBeUndefined();
    expect(postTargetOf('http://example.com/weave~NqgQ/ideas/aq1i')).toBeUndefined();
    expect(postTargetOf('a/b~cdef/ideas/aq1i')).toBeUndefined();
  });

  it('finds every post a text points to, once each, in order', () => {
    const url = 'http://weave.localhost:7710/weave~NqgQ/ideas/aq1i/links';
    const text = `I've updated [Links](${url}) and opened weave~NqgQ/issues/zz9k. Also weave:post:abcdefgh and again ${url}.`;
    expect(postRefsIn(text)).toEqual([url, 'weave~NqgQ/issues/zz9k', 'abcdefgh']);
    expect(postRefsIn('nothing here')).toEqual([]);
  });
});

describe('person addresses', () => {
  const did = 'did:key:z6MkfP5Q3XPCFjz199XozoFRNu2rsCmA7aHoQeU8eYQM3Zzj';

  it('names a person by name and the start of their key', () => {
    expect(personKeyOf(did)).toBe('fP5Q3XPCFjz199XozoFRNu2rsCmA7aHoQeU8eYQM3Zzj');
    expect(personPath('Phil', did)).toBe('@phil~fP5Q3XPCFjz1');
    expect(personUrl('Lena Müller', did)).toBe('http://weave.localhost:7710/@lena-muller~fP5Q3XPCFjz1');
    expect(personPath(undefined, did)).toBe('@~fP5Q3XPCFjz1');
  });

  it('reads them back as a web address, text or Markdown link, and nothing else', () => {
    expect(personTargetOf('http://weave.localhost:7710/@phil~fP5Q3XPCFjz1')).toBe('fP5Q3XPCFjz1');
    expect(personTargetOf(' @someone-else~fP5Q3XPCFjz1 ')).toBe('fP5Q3XPCFjz1');
    expect(personTargetOf('[Phil](http://weave.localhost:9999/@phil~fP5Q3XPCFjz1)')).toBe('fP5Q3XPCFjz1');
    expect(personTargetOf('Phil')).toBeUndefined();
    expect(personTargetOf('@phil~fP5Q')).toBeUndefined(); // too short to tell people apart
    expect(personTargetOf('http://example.com/@phil~fP5Q3XPCFjz1')).toBeUndefined();
    expect(personTargetOf('ask @phil~fP5Q3XPCFjz1 about it')).toBeUndefined();
    // A person's address is no post's, and a public post's is no person's.
    expect(postTargetOf('http://weave.localhost:7710/@phil~fP5Q3XPCFjz1')).toBeUndefined();
    expect(personTargetOf('http://weave.localhost:7710/@martl/-nt5_W/a-title')).toBeUndefined();
  });
});
