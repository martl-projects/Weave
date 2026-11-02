import { describe, expect, it } from 'vitest';
import { duplexPair, PeerSession2 } from '@weave/net';
import { decodeContact } from '@weave/core';
import { WeaveNode } from '../src/index.ts';
import { people, sync } from './helpers/people.ts';

/*
 * A node shares its public side and that of whom the peer shares something with, never everyone it knows: martl's
 * family and friends stay out of sight for a newcomer who only has his contact link (2.11.2026, before martl's contact
 * goes back into the app's bundle).
 */

const { person, home, nodes } = people('publicfor');

function link(a: WeaveNode, b: WeaveNode) {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return () => (left.close(), right.close());
}
const settle = (ms = 1200) => new Promise((resolve) => setTimeout(resolve, ms));
const knows = (node: WeaveNode, other: WeaveNode) => node.replica.events().some((e) => e.author === other.identity.author);

describe("a node's public side", () => {
  it('shows a newcomer with its contact link the person it reached, not their family and friends', async () => {
    const [martl, liane, julian, eve] = [person('martl'), person('Liane'), person('Julian'), person('Eve')];
    // Liane in martl's family group, Julian a friend: martl holds both their logs.
    await martl.createGroup('Familie');
    await liane.joinSpace(await martl.invite('Familie'));
    await julian.addContact(await martl.contactLink());
    await martl.addContact(await julian.contactLink());
    for (const [a, b] of [[liane, martl], [martl, liane], [julian, martl], [martl, julian]] as const) sync(a, b);
    expect(knows(martl, liane) && knows(martl, julian)).toBe(true);

    await eve.addContact(await martl.contactLink());
    const close = link(martl, eve);
    await settle();
    close();
    expect(eve.nameOf(martl.identity.author)).toBe('martl');
    expect(knows(eve, liane)).toBe(false);
    expect(knows(eve, julian)).toBe(false);
  });

  it('shows a member the others in what they share, and no one else', async () => {
    const [martl, liane, julian] = [person('martl'), person('Liane'), person('Julian')];
    await martl.createGroup('Familie');
    await liane.joinSpace(await martl.invite('Familie'));
    await julian.addContact(await martl.contactLink());
    await martl.addContact(await julian.contactLink());
    for (const [a, b] of [[julian, martl], [martl, julian], [liane, martl]] as const) sync(a, b);

    const close = link(martl, liane);
    await settle();
    close();
    expect(liane.nameOf(martl.identity.author)).toBe('martl');
    expect((await liane.members('Familie')).map((m) => m.name)).toEqual(expect.arrayContaining(['martl', 'Liane']));
    expect(knows(liane, julian)).toBe(false);
  });
});

describe('a front door', () => {
  it("lets a newcomer with the door link in at the always-on node, never at the person's computer", async () => {
    const [martl, liane, eve] = [person('martl'), person('Liane'), person('Eve')];
    await martl.createGroup('Familie');
    await liane.joinSpace(await martl.invite('Familie'));
    sync(liane, martl);
    // martl's always-on node: a front door by default.
    const boxDir = home();
    const linked = await martl.linkNode({ request: WeaveNode.nodeRequest(boxDir, 'door') });
    const box = await WeaveNode.completeNodeLink(linked.answer, boxDir);
    nodes.push(box);
    sync(martl, box);
    sync(liane, box);
    await box.reconcile();

    const door = await martl.contactLink({ door: true });
    expect(decodeContact(door).entry.topics).not.toEqual(decodeContact(await martl.contactLink()).entry.topics);
    expect(box.topics).toContain(decodeContact(door).entry.topics[0]);
    expect(martl.topics).not.toContain(decodeContact(door).entry.topics[0]);
    await eve.addContact(door);

    // martl's computer turns her away.
    const [la, lb] = duplexPair();
    new PeerSession2(martl.replica, la, { access: martl.sessionAccess() });
    new PeerSession2(eve.replica, lb, { access: eve.sessionAccess() });
    await settle();
    expect(la.destroyed || lb.destroyed).toBe(true);
    expect(knows(eve, martl)).toBe(false);

    // The node lets her in: martl's name, not his family.
    const close = link(box, eve);
    await settle();
    close();
    expect(eve.nameOf(martl.identity.author)).toBe('martl');
    expect(knows(eve, liane)).toBe(false);
  });
});
