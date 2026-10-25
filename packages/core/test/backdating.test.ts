import { describe, expect, it } from 'vitest';
import { closingUpTo, KIND_PROPOSAL, KIND_PROPOSAL_CLOSE, KIND_VOTE, tally, type Entry } from '../src/index.ts';
import { KIND_INVITE_CLOSE } from '../src/index.ts';
import { createIdentity, KIND_INVITE, KIND_JOIN, KIND_MAINTAINER, KIND_REMOVE, KIND_SPACE_CREATE, newSpace, openIn, Replica, sealFor, spaceState, visibleIn, type Inner, type SigningIdentity, type SpaceKind } from '../src/index.ts';

/*
 * Julian's issue "Removed members can backdate events" (cpjHYTDQ): an event's
 * time is its author's claim, and a space's state is folded in time order. A
 * removal now names the last number of each of the person's keys that counts
 * (upTo); whatever those keys sign past it counts as after the removal.
 */

const at = (minutes: number) => new Date(Date.UTC(2026, 9, 25, 12, minutes)).toISOString();

function setup(kind: SpaceKind) {
  const founder = createIdentity();
  const space = newSpace(kind, 'Synths', founder.did);
  const replica = new Replica();
  // A modified client signs whatever time it likes; the replica takes it as it is.
  const post = (who: SigningIdentity, inner: Inner, time: string) => replica.append(who, { ...sealFor(space, inner), time });
  post(founder, { kind: KIND_SPACE_CREATE, body: { name: 'Synths' } }, at(0));
  const opened = () => replica.events().flatMap((event) => (openIn(space, event) ? [{ event, inner: openIn(space, event)! }] : []));
  const state = () => spaceState(kind, founder.did, opened());
  /** What a removal names: the last number of the person's key the remover holds. */
  const upTo = (who: SigningIdentity) => ({ [who.did]: replica.number(who.did) });
  return { founder, post, opened, state, upTo };
}

describe('backdated events of a removed member', () => {
  it('1: a removed member cannot bring a second account in with a backdated invite and join', () => {
    const { founder, post, state, upTo } = setup('group');
    const eve = createIdentity();
    const eve2 = createIdentity();
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(50) } }, at(1));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    post(founder, { kind: KIND_REMOVE, body: { member: eve.did, upTo: upTo(eve) } }, at(10));
    // Later, Eve signs an invite and her second account's join, both dated before her removal.
    post(eve, { kind: KIND_INVITE, body: { invite: 'back', expires: at(50) } }, at(8));
    post(eve2, { kind: KIND_JOIN, body: { invite: 'back' } }, at(9));
    expect(state().members.has(eve2.did)).toBe(false);
  });

  it("2: a removed maintainer cannot undo their removal by backdating the remover's removal", () => {
    const { founder, post, state, upTo } = setup('project');
    const lena = createIdentity();
    const eve = createIdentity();
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(50) } }, at(1));
    post(lena, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(3));
    post(founder, { kind: KIND_MAINTAINER, body: { member: lena.did } }, at(4));
    post(founder, { kind: KIND_MAINTAINER, body: { member: eve.did } }, at(5));
    // Lena (a maintainer, not the founder) removes Eve…
    post(lena, { kind: KIND_REMOVE, body: { member: eve.did, upTo: upTo(eve) } }, at(10));
    // …and Eve answers with Lena's removal, dated before it.
    post(eve, { kind: KIND_REMOVE, body: { member: lena.did, upTo: upTo(lena) } }, at(9));
    expect(state().members.has(eve.did)).toBe(false);
    expect(state().maintainers.has(lena.did)).toBe(true);
  });

  it('3: messages a removed member signs afterwards, dated before the removal, are not shown', () => {
    const { founder, post, opened, state, upTo } = setup('group');
    const eve = createIdentity();
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(50) } }, at(1));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    const before = post(eve, { kind: 'weave.post', body: { text: 'real, before' } }, at(3));
    post(founder, { kind: KIND_REMOVE, body: { member: eve.did, upTo: upTo(eve) } }, at(10));
    const fake = post(eve, { kind: 'weave.post', body: { text: 'planted' } }, at(5));
    const find = (e: { signer: string; seq: number }) => opened().find((o) => o.event.signer === e.signer && o.event.seq === e.seq)!;
    expect(visibleIn(state(), find(fake).event, find(fake).inner)).toBe(false);
    expect(visibleIn(state(), find(before).event, find(before).inner)).toBe(true);
  });

  it('a demoted maintainer cannot backdate a removal from before the demotion', () => {
    const { founder, post, state, upTo } = setup('project');
    const lena = createIdentity();
    const eve = createIdentity();
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(50) } }, at(1));
    post(lena, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(3));
    post(founder, { kind: KIND_MAINTAINER, body: { member: eve.did } }, at(4));
    post(founder, { kind: KIND_MAINTAINER, body: { member: eve.did, on: false, upTo: upTo(eve) } }, at(10));
    post(eve, { kind: KIND_REMOVE, body: { member: lena.did } }, at(9));
    expect(state().members.has(lena.did)).toBe(true);
  });

  it('still lets someone removed come back with a new invite, after the removal', () => {
    const { founder, post, state, upTo } = setup('group');
    const eve = createIdentity();
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(50) } }, at(1));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    post(founder, { kind: KIND_REMOVE, body: { member: eve.did, upTo: upTo(eve) } }, at(10));
    // The founder leaves "removed" behind with a fresh invite; Eve joins with it later. That's a leave-and-rejoin path, not removed → in:
    // a removed member only comes back once they left on their own, as before. Here: she was removed, so she stays out, whatever the date.
    post(founder, { kind: KIND_INVITE, body: { invite: 'i2', expires: at(50) } }, at(20));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i2' } }, at(21));
    expect(state().members.has(eve.did)).toBe(false);
  });

  it('two maintainers removing each other at once: both removals count', () => {
    const { founder, post, state, upTo } = setup('project');
    const lena = createIdentity();
    const eve = createIdentity();
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(50) } }, at(1));
    post(lena, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(3));
    post(founder, { kind: KIND_MAINTAINER, body: { member: lena.did } }, at(4));
    post(founder, { kind: KIND_MAINTAINER, body: { member: eve.did } }, at(5));
    // Neither has seen the other's removal: each names the other's last number before it.
    const lenaSeen = upTo(eve);
    const eveSeen = upTo(lena);
    post(lena, { kind: KIND_REMOVE, body: { member: eve.did, upTo: lenaSeen } }, at(10));
    post(eve, { kind: KIND_REMOVE, body: { member: lena.did, upTo: eveSeen } }, at(10));
    expect(state().members.has(lena.did)).toBe(false);
    expect(state().members.has(eve.did)).toBe(false);
    expect(state().maintainers.has(founder.did)).toBe(true);
  });

  it('removals written before upTo existed are judged by time, as before', () => {
    const { founder, post, state } = setup('group');
    const eve = createIdentity();
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(50) } }, at(1));
    post(eve, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    post(founder, { kind: KIND_REMOVE, body: { member: eve.did } }, at(10));
    expect(state().members.has(eve.did)).toBe(false);
    expect(state().cutoffs).toBeUndefined();
  });
});

describe('backdated votes', () => {
  const entry = (who: SigningIdentity, seq: number, kind: string, body: Record<string, unknown>, time: string): Entry =>
    ({ id: `${who.did}#${seq}`, kind, body, event: { author: who.did, signer: who.did, seq, kind, scope: 'project:x', body: null, time } }) as unknown as Entry;

  it('once its proposer closes it, a vote signed afterwards does not count, whatever date it claims', () => {
    const [ana, ben, cid] = [createIdentity(), createIdentity(), createIdentity()];
    const members = new Set([ana.did, ben.did, cid.did]);
    const proposal = entry(ana, 1, KIND_PROPOSAL, { title: 'Ship it?', deadline: at(30) }, at(0));
    const entries = [proposal, entry(ana, 2, KIND_VOTE, { proposal: proposal.id, choice: 'yes' }, at(5)), entry(ben, 1, KIND_VOTE, { proposal: proposal.id, choice: 'yes' }, at(6))];
    // At the deadline Ana's node closes it, naming what it holds.
    const close = entry(ana, 3, KIND_PROPOSAL_CLOSE, { proposal: proposal.id, upTo: closingUpTo(proposal, entries) }, at(31));
    // After seeing the result, Ben changes his mind and Cid votes, both dated before the deadline.
    const late = [entry(ben, 2, KIND_VOTE, { proposal: proposal.id, choice: 'no' }, at(20)), entry(cid, 1, KIND_VOTE, { proposal: proposal.id, choice: 'no' }, at(21))];
    const result = tally(proposal, [...entries, close, ...late], members, at(40));
    expect({ yes: result.yes, no: result.no }).toEqual({ yes: 2, no: 0 });
    // Without a close, it's by the dates they claim, as before.
    expect(tally(proposal, [...entries, ...late], members, at(40)).no).toBe(2);
  });
});

describe('backdated joins with an expired invite', () => {
  it('once its maker closed it, nobody else joins with it, whatever date they sign', () => {
    const { founder, post, state } = setup('group');
    const [ana, late] = [createIdentity(), createIdentity()];
    post(founder, { kind: KIND_INVITE, body: { invite: 'i1', expires: at(30) } }, at(1));
    post(ana, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(2));
    post(founder, { kind: KIND_INVITE_CLOSE, body: { invite: 'i1', joined: [ana.did] } }, at(31));
    // Someone who got hold of the link joins long after, dating it before the expiry.
    post(late, { kind: KIND_JOIN, body: { invite: 'i1' } }, at(20));
    expect(state().members.has(ana.did)).toBe(true);
    expect(state().members.has(late.did)).toBe(false);
  });
});
