import { describe, expect, it } from 'vitest';
import {
  createIdentity,
  createSubKey,
  delegation,
  eventId,
  issuesOf,
  messagesOf,
  proposalsOf,
  Replica,
  threadsOf,
  type Did,
  type Entry,
  type Json,
  type SigningIdentity,
} from '../src/index.ts';

/** A tiny in-memory "group": events appended in order, with explicit times. */
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

describe('threads and chat', () => {
  it('collects replies under their thread and orders by activity', () => {
    const { entries, post } = setup();
    const [alice, bob] = [createIdentity(), createIdentity()];
    const t1 = post(alice, 'weave.thread', { title: 'WireGuard?', text: 'Should we use it?' });
    const t2 = post(bob, 'weave.thread', { title: 'Need an app?', text: '' });
    post(bob, 'weave.reply', { target: t1, text: 'Yes, smaller attack surface' });
    post(alice, 'weave.msg', { text: 'hi all' });

    const threads = threadsOf(entries);
    expect(threads.map((t) => t.id)).toEqual([t1, t2]);
    expect(threads[0].replies.map((r) => r.text)).toEqual(['Yes, smaller attack surface']);
    expect(messagesOf(entries).map((m) => m.text)).toEqual(['hi all']);
  });
});

describe('issues', () => {
  it('tracks claims by agents and status changes', () => {
    const { entries, post } = setup();
    const alice = createIdentity();
    const forge = createSubKey(alice.did);
    post(alice, 'weave.delegate', delegation(forge.did, 'agent', ['weave.issue.*']).body!);
    const id = post(alice, 'weave.issue', { title: 'Encrypt keys at rest', text: '', labels: ['security'] });
    post(forge, 'weave.issue.claim', { issue: id });

    let [issue] = issuesOf(entries);
    expect(issue).toMatchObject({ status: 'in-progress', labels: ['security'], assignee: { author: alice.did, signer: forge.did } });

    post(forge, 'weave.issue.status', { issue: id, status: 'done' });
    post(alice, 'weave.issue.status', { issue: id, status: 'bogus' });
    [issue] = issuesOf(entries);
    expect(issue.status).toBe('done');
  });
});

describe('votes', () => {
  const people = () => [createIdentity(), createIdentity(), createIdentity(), createIdentity()];
  const deadline = '2026-10-18T12:00:00.000Z';

  it('counts one vote per member, the latest before the deadline', () => {
    const { entries, post } = setup();
    const [a, b, c, d] = people();
    const members = new Set<Did>([a.did, b.did, c.did, d.did]);
    const outsider = createIdentity();
    const id = post(a, 'weave.proposal', { title: 'Use WireGuard', text: '', deadline });
    post(a, 'weave.vote', { proposal: id, choice: 'no' });
    post(a, 'weave.vote', { proposal: id, choice: 'yes' }); // changed their mind
    post(b, 'weave.vote', { proposal: id, choice: 'yes' });
    post(c, 'weave.vote', { proposal: id, choice: 'no' });
    post(outsider, 'weave.vote', { proposal: id, choice: 'no' }); // not a member
    post(d, 'weave.vote', { proposal: id, choice: 'no' }, '2026-10-18T13:00:00.000Z'); // too late

    const open = proposalsOf(entries, members, '2026-10-18T11:00:00.000Z')[0].tally;
    expect(open).toMatchObject({ yes: 2, no: 1, voted: 3, quorum: 2, quorumReached: true, closed: false, passed: false });
    const done = proposalsOf(entries, members, '2026-10-18T12:30:00.000Z')[0].tally;
    expect(done).toMatchObject({ closed: true, passed: true });
  });

  it('follows delegation chains, ignores cycles, and lets direct votes win', () => {
    const { entries, post } = setup();
    const [a, b, c, d] = people();
    const members = new Set<Did>([a.did, b.did, c.did, d.did]);
    const id = post(a, 'weave.proposal', { title: 'Hire an auditor', text: '', deadline, quorum: 4 });
    post(b, 'weave.vote.delegate', { to: c.did });
    post(c, 'weave.vote.delegate', { to: a.did });
    post(a, 'weave.vote', { proposal: id, choice: 'no' });
    post(d, 'weave.vote.delegate', { to: d.did }); // ignored: self
    post(c, 'weave.vote', { proposal: id, choice: 'yes' }); // c votes directly, so b follows c

    const t = proposalsOf(entries, members, deadline)[0].tally;
    expect(t.votes.get(b.did)).toEqual({ choice: 'yes', via: c.did });
    expect(t.votes.get(c.did)).toEqual({ choice: 'yes' });
    expect(t.votes.has(d.did)).toBe(false);
    expect(t).toMatchObject({ yes: 2, no: 1, voted: 3, quorum: 4, quorumReached: false, passed: false });
  });
});
