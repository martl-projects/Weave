import { describe, expect, it } from 'vitest';
import { decodeContact, KIND_FOLLOW } from '@weave/core';
import { duplexPair, PeerSession2 } from '@weave/net';
import type { WeaveNode } from '../src/index.ts';
import { people, sync } from './helpers/people.ts';

/*
 * Trust starts before the first packet: a node is found at a meeting point only its links carry (never at its DID,
 * which is public), turns away peers that share nothing with it and hold none of its links, and adding a contact
 * tells only the two of them, in their direct chat, instead of following publicly.
 */

const { person } = people('firewall');

/** Two nodes connected as over the network; `closed` tells whether either end hung up. */
function link(a: WeaveNode, b: WeaveNode) {
  const [sa, sb] = duplexPair();
  const left = new PeerSession2(a.replica, sa, { access: a.sessionAccess() });
  const right = new PeerSession2(b.replica, sb, { access: b.sessionAccess() });
  return { closed: () => sa.destroyed || sb.destroyed, close: () => (left.close(), right.close()) };
}

const settle = (ms = 300) => new Promise((resolve) => setTimeout(resolve, ms));
const has = (node: WeaveNode, author: string) => node.replica.events().some((e) => e.author === author);

describe('the firewall', () => {
  it('turns a stranger away: nothing of either reaches the other, not even public', async () => {
    const [ada, eve] = [person('Ada'), person('Eve')];
    const wire = link(ada, eve);
    await settle();
    expect(wire.closed()).toBe(true);
    expect(has(eve, ada.identity.author)).toBe(false);
    expect(has(ada, eve.identity.author)).toBe(false);
  });

  it("lets in whoever holds one of our links, and them us: holding theirs is how we're let in too", async () => {
    const [ada, ben] = [person('Ada'), person('Ben')];
    await ben.addContact(await ada.contactLink());
    const wire = link(ada, ben);
    await settle();
    expect(wire.closed()).toBe(false);
    expect(has(ada, ben.identity.author)).toBe(true);
    expect(has(ben, ada.identity.author)).toBe(true);
    wire.close();
  });

  it("doesn't let in a stranger who holds our log: anyone can make our direct chat's key", async () => {
    const [ada, ben, eve] = [person('Ada'), person('Ben'), person('Eve')];
    // Eve has Ada's log (and Ada hers) from somewhere else; neither chose the other.
    sync(ada, eve);
    sync(eve, ada);
    await ben.addContact(await ada.contactLink());
    const wire = link(ada, eve);
    await settle();
    expect(wire.closed()).toBe(true);
  });

  it('lets everyone in with firewall: false, as before', async () => {
    const [ada, eve] = [person('Ada'), person('Eve')];
    ada.config = { ...ada.config, firewall: false };
    eve.config = { ...eve.config, firewall: false };
    const wire = link(ada, eve);
    await settle();
    expect(wire.closed()).toBe(false);
    expect(has(eve, ada.identity.author)).toBe(true);
    wire.close();
  });
});

describe('meeting points', () => {
  it("a link names a meeting point and its secret, never the DID; the node isn't at its DID either", async () => {
    const ada = person('Ada');
    const contact = decodeContact(await ada.contactLink());
    expect(contact.entry.topics).toHaveLength(1);
    expect(contact.entry.topics[0]).toMatch(/^meet:/);
    expect(contact.entry.meet).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(contact.entry.topics[0]).not.toContain(contact.entry.meet);
    expect(ada.topics).toContain(contact.entry.topics[0]);
    expect(ada.topics).not.toContain(ada.identity.author);
    // The same on every link.
    expect(decodeContact(await ada.contactLink()).entry).toEqual(contact.entry);
  });

  it("someone else's meeting point is only looked up, and so is a DID from an older link", async () => {
    const [ada, ben] = [person('Ada'), person('Ben')];
    const contact = decodeContact(await ada.contactLink());
    await ben.addContact(await ada.contactLink());
    expect(ben.config.topics).toEqual([contact.entry.topics[0]]);
    expect(ben.config.topics).not.toContain(ada.identity.author);
  });
});

describe('contacts without a public follow', () => {
  it('two people who add each other are friends and can chat, and nobody else can tell', async () => {
    const [ada, ben] = [person('Ada'), person('Ben')];
    await ben.addContact(await ada.contactLink());
    await ada.addContact(await ben.contactLink());
    // Neither has the other's log yet: the follow they tell each other waits for it.
    sync(ada, ben);
    sync(ben, ada);
    await ada.reconcile();
    await ben.reconcile();
    sync(ada, ben);
    sync(ben, ada);

    expect((await ada.social()).friends.map((p) => p.name)).toEqual(['Ben']);
    expect((await ben.social()).friends.map((p) => p.name)).toEqual(['Ada']);
    const chat = await ada.openChat(ben.identity.author);
    await ada.say({ space: chat.id, text: 'hi Ben' });
    sync(ada, ben);
    expect((await ben.messages(chat.id)).map((m) => m.text)).toContain('hi Ben');

    // No follow in the open: someone holding both their logs sees no edge between them.
    const eve = person('Eve');
    sync(ada, eve);
    sync(ben, eve);
    expect(eve.replica.events().filter((e) => e.kind === KIND_FOLLOW)).toEqual([]);
    expect((await eve.profile(ada.identity.author)).followsMe).toBe(false);
    expect((await eve.social()).friends).toEqual([]);
  });

  it('unfollowing ends the friendship for the other one too', async () => {
    const [ada, ben] = [person('Ada'), person('Ben')];
    await ben.addContact(await ada.contactLink());
    await ada.addContact(await ben.contactLink());
    sync(ada, ben);
    sync(ben, ada);
    await ada.reconcile();
    await ben.reconcile();
    sync(ada, ben);
    sync(ben, ada);
    expect((await ben.social()).friends.map((p) => p.name)).toEqual(['Ada']);

    await ada.setEdge({ edge: 'follow', who: ben.identity.author, on: false });
    sync(ada, ben);
    expect((await ben.social()).friends).toEqual([]);
  });
});
