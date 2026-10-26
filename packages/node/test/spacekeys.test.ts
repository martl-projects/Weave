import { describe, expect, it } from 'vitest';
import { gift, isWireItemV2, KIND_BOARD_RULE, KIND_CARRY, KIND_HANDOVER, KIND_REKEY, sealFor, spaceScope } from '@weave/core';
import { loadSpaces, WeaveNode } from '../src/index.ts';
import { people, sync, stored, day } from './helpers/people.ts';

/*
 * Regression tests from the pre-release review, each reproducing an issue (its
 * id in the test's name) and checking it stays fixed.
 * They guard node.ts, a space's keys and carries: carries checked against their
 * authors' envelopes, gifts that must open something, rotation after leaving.
 */

const { person } = people('spacekeys');

describe("a carry can't forge events (FQ59bhoy)", () => {
  const byId = (node: WeaveNode, id: string) => loadSpaces(node.home).find((x) => x.id === id)!;
  const names = async (node: WeaveNode, space: string) => (await node.members(space)).map((m) => m.name).sort();

  it("a maintainer can't take a project over with a forged handover in a carry", async () => {
    const martin = person('Martin');
    const kofi = person('Kofi');
    const all = [martin, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createProject({ name: 'Weave' });
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll();
    await martin.setMaintainer({ project: 'Weave', who: 'Kofi', on: true });
    syncAll();
    const space = byId(kofi, (await kofi.spaces('project'))[0].id);
    const forged = { id: 'forged-handover', author: martin.identity.author, signer: martin.identity.author, seq: 7, time: new Date().toISOString(), kind: KIND_HANDOVER, body: { to: kofi.identity.author } };
    kofi.replica.write(kofi.identity, sealFor(space, { kind: KIND_CARRY, body: { events: [forged] } }));
    syncAll();
    expect((await martin.spaces('project'))[0].founder).toBe(martin.identity.author);
    await expect(kofi.removeMember('Weave', 'Martin')).rejects.toThrow();
    syncAll();
    expect(await names(martin, 'Weave')).toEqual(['Kofi', 'Martin']);
  });

  it('a plain member who invited someone hands over keys, never state: no forged rule, no forged handover on their node', async () => {
    const [bob, alice, kofi, carol] = [person('Bob'), person('Alice'), person('Kofi'), person('Carol')];
    const all = [bob, alice, kofi, carol];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await bob.createCommunity({ name: 'Synths' });
    await alice.joinSpace(await bob.invite('Synths'));
    await kofi.joinSpace(await bob.invite('Synths'));
    const post = await kofi.submit({ space: 'Synths', title: "Kofi's post" });
    syncAll();
    await carol.joinSpace(await alice.invite('Synths')); // Alice is no moderator; she invited Carol
    syncAll();
    const space = byId(alice, (await alice.spaces('community'))[0].id);
    const forge = (events: unknown[]) => alice.replica.write(alice.identity, sealFor(space, { kind: KIND_CARRY, body: { events: events as never } }));
    forge([{ id: 'forged-rule', author: bob.identity.author, signer: bob.identity.author, seq: 998, time: new Date().toISOString(), kind: KIND_BOARD_RULE, body: { board: 'posts', keepDays: 1, maxMB: null } }]);
    syncAll();
    const holds = (node: WeaveNode, id: string) => {
      const r = node.replica.record2(id);
      return !!r && !r.missing && isWireItemV2(r.wire);
    };
    carol.clock = () => Date.now() + 20 * day;
    await carol.reconcile();
    expect(holds(carol, post.id)).toBe(true);
    forge([{ id: 'forged-handover', author: bob.identity.author, signer: bob.identity.author, seq: 999, time: new Date().toISOString(), kind: KIND_HANDOVER, body: { to: alice.identity.author } }]);
    syncAll();
    expect((await carol.spaces('community')).find((x) => x.name === 'Synths')?.founder).toBe(bob.identity.author);
  });
});

describe("a gift can't poison a space's future epochs (8R9bN-yO)", () => {
  it("someone in another group gifts garbage keys for a space Lena holds: she still reads its next epoch", async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    let all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.createGroup('Chess');
    await lena.joinSpace(await kofi.invite('Chess'));
    syncAll();
    const projectId = (await martin.spaces('project'))[0].id;
    const chess = stored(kofi, 'Chess');
    const garbage = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
    const bogus = { ...loadSpaces(martin.home).find((s) => s.id === projectId)!, keys: { '1': garbage, '2': garbage }, boards: { issues: { '0': garbage } } };
    kofi.replica.write(kofi.identity, gift(bogus, [lena.identity.author], spaceScope(chess), { topics: [], bootstrap: [] }, (d) => kofi.replica.authority.encryptionKey(d)));
    syncAll();
    const lenas = () => loadSpaces(lena.home).find((s) => s.id === projectId)!;
    expect(Object.keys(lenas().keys)).toEqual(['0']);
    expect(lenas().boards?.issues?.['0']).not.toBe(garbage);
    const noah = person('Noah');
    await noah.joinSpace(await martin.invite('Weave'));
    all = [...all, noah];
    syncAll();
    await martin.removeMember('Weave', 'Noah');
    await martin.say({ space: 'Weave', text: 'after Noah' });
    syncAll();
    expect((await martin.spaces('project'))[0].epoch).toBe(1);
    expect(lenas().keys['1']).not.toBe(garbage);
    expect((await lena.messages('Weave')).map((m) => m.text)).toContain('after Noah');
  });
});

describe("a member's own rekey doesn't stop rotation after they leave (Gr9S4DLf)", () => {
  const groupEpoch = async (node: WeaveNode) => (await node.spaces('group'))[0].epoch;

  it('a future-dated rekey with no boxes, then a leave: the founder still rotates', async () => {
    const [martin, lena] = [person('Martin'), person('Lena')];
    const all = [martin, lena];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Synth friends');
    await lena.joinSpace(await martin.invite('Synth friends'));
    syncAll();
    const space = stored(lena, 'Synth friends');
    lena.replica.write(lena.identity, { kind: KIND_REKEY, scope: spaceScope(space), body: { epoch: 0, boxes: {} }, time: '2099-01-01T00:00:00.000Z' });
    syncAll();
    await lena.leave('Synth friends');
    syncAll();
    await martin.reconcile();
    expect(await groupEpoch(martin)).toBe(1);
    // Once: the rotation itself counts as the rekey after the leave.
    await martin.reconcile();
    expect(await groupEpoch(martin)).toBe(1);
  });

  it('a leave dated long before the last rekey still rotates once it arrives after it', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    const syncAll = () => {
      for (let round = 0; round < 2; round++) for (const a of all) for (const b of all) if (a !== b) sync(a, b);
    };
    await martin.createGroup('Synth friends');
    await lena.joinSpace(await martin.invite('Synth friends'));
    await kofi.joinSpace(await martin.invite('Synth friends'));
    syncAll();
    await martin.removeMember('Synth friends', 'Kofi'); // a rekey, to epoch 1
    syncAll();
    expect(await groupEpoch(martin)).toBe(1);
    lena.clock = () => Date.now() - 30 * 24 * 3600 * 1000;
    const backdated = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    lena.replica.write(lena.identity, { ...sealFor(stored(lena, 'Synth friends'), { kind: 'weave.space.leave', body: {} }), time: backdated });
    syncAll();
    await martin.reconcile();
    expect(await groupEpoch(martin)).toBe(2);
  });
});
