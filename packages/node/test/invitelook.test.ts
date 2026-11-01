import { describe, expect, it } from 'vitest';
import { encodeInvite, peekInvite } from '@weave/core';
import { day, people, sync } from './helpers/people.ts';

/*
 * Better invites, part 1 (post ye1AFnk1): an invite link is looked at before
 * anyone joins, for the card it makes in a chat and the "Join?" that follows.
 * The look says what the link carries and where you stand with its space.
 */

const { person } = people('invitelook');

describe('looking at an invite link without joining', () => {
  it('says who invites to what, and whether you may join, are in already, or made the link yourself', async () => {
    const [bob, alice] = [person('Bob'), person('Alice')];
    await bob.createProject({ name: 'Pferderennen' });
    const link = await bob.invite('Pferderennen');
    const look = await alice.lookAtInvite(link);
    expect(look).toMatchObject({ kind: 'invite', standing: 'open', space: { kind: 'project', name: 'Pferderennen', founder: bob.identity.author }, inviter: { did: bob.identity.author }, boards: [] });
    expect(look.members).toBeUndefined(); // a link says nothing about the inside
    expect(await bob.lookAtInvite(link)).toMatchObject({ standing: 'mine', inviter: { name: 'Bob' } });
    await alice.joinSpace(link);
    sync(alice, bob);
    sync(bob, alice);
    expect(await alice.lookAtInvite(link)).toMatchObject({ standing: 'member', members: 2, inviter: { name: 'Bob' } });
    // Another link to the same project: in already, whatever the link.
    expect(await alice.lookAtInvite(await bob.invite('Pferderennen'))).toMatchObject({ standing: 'member' });
    // A link with board rights names the boards.
    await bob.setBoardAccess({ project: 'Pferderennen', board: 'issues', read: ['Bob'] });
    const limited = await bob.invite('Pferderennen', 24, { access: [{ board: 'issues', read: true }] });
    expect((await person('Carol').lookAtInvite(limited)).boards).toEqual(['issues']);
  });

  it('says why a link no longer works: expired, from an older Weave, damaged', async () => {
    const [bob, alice] = [person('Bob'), person('Alice')];
    await bob.createGroup('Home');
    const link = await bob.invite('Home', 1);
    alice.clock = () => Date.now() + 2 * 3600_000;
    expect(await alice.lookAtInvite(link)).toMatchObject({ standing: 'expired', space: { name: 'Home' }, problem: /expired/ });
    alice.clock = () => Date.now() + 0;
    const { key: _key, ...old } = peekInvite(link);
    expect(await alice.lookAtInvite(encodeInvite(old as never))).toMatchObject({ standing: 'old', problem: /older Weave/ });
    await expect(alice.lookAtInvite('weave:invite:not-a-link')).rejects.toThrow(/damaged/);
    await expect(alice.lookAtInvite('https://example.com')).rejects.toThrow(/not a Weave invite link/);
  });

  it('knows a knock link, and that you asked and are waiting', async () => {
    const [bob, alice] = [person('Bob'), person('Alice')];
    await bob.createProject({ name: 'Weave' });
    const link = await bob.invite('Weave', 24, { accept: true });
    expect(await alice.lookAtInvite(link)).toMatchObject({ kind: 'knock', standing: 'open', space: { name: 'Weave' }, inviter: { did: bob.identity.author } });
    expect(await bob.lookAtInvite(link)).toMatchObject({ kind: 'knock', standing: 'mine' });
    await alice.joinSpace(link, 'hi, it is me');
    expect(await alice.lookAtInvite(link)).toMatchObject({ kind: 'knock', standing: 'waiting' });
    // Let in: a member now.
    sync(alice, bob);
    const [knock] = await bob.knocks();
    expect(knock.note).toBe('hi, it is me');
    await bob.answerKnock({ knock: knock.id, accept: true });
    sync(bob, alice);
    await alice.reconcile();
    expect(await alice.lookAtInvite(link)).toMatchObject({ standing: 'member' });
    expect(day).toBeGreaterThan(0);
  });
});
