import { didFromPublicKey, generateKeyPair, openBox, type Box, type Did, type Json } from '@weave/core';
import { describe, expect, it } from 'vitest';
import { KIND_PUSH_TARGET, notifies, type PushHost, type PushNotice, type PushTarget } from '../src/index.ts';
import { people, sync } from './helpers/people.ts';

const { person } = people('pushtargets');

/** A browser with pushes on, as the node sees it: an address and a key per place. */
function browser(device: string) {
  const targets = new Map<string, PushTarget>();
  const keys = new Map<string, { secretKey: Uint8Array; publicKey: Uint8Array }>();
  let n = 0;
  const dropped: string[] = [];
  const host: PushHost = {
    device,
    targetFor: async (space) => targets.get(space),
    make: async (space) => {
      const pair = generateKeyPair();
      const target = { relay: 'https://storage.example', address: `${device}-${++n}`, key: didFromPublicKey(pair.publicKey) };
      targets.set(space, target);
      keys.set(target.address, pair);
      return target;
    },
    drop: async (space) => {
      const t = targets.get(space);
      if (t) dropped.push(t.address);
      targets.delete(space);
    },
  };
  const open = (address: string, sealed: Json) => {
    const pair = keys.get(address)!;
    return openBox(pair.secretKey, pair.publicKey, sealed as unknown as Box) as unknown as PushNotice;
  };
  return { host, targets, dropped, open };
}

const settle = () => new Promise((r) => setTimeout(r, 30));

describe('pushes to a closed browser (docs/web-push.md, stage 3)', () => {
  it("seals each place's address to those who manage it, and they push their messages there", async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const nic = person('Nic');
    const studio = await martl.createProject({ name: 'Studio' });
    await lena.joinSpace(await martl.invite('Studio'));
    await nic.joinSpace(await martl.invite('Studio'));
    for (const [a, b] of [[lena, martl], [nic, martl], [martl, lena], [martl, nic], [lena, nic], [nic, lena]]) sync(a, b);
    await martl.setEdge({ edge: 'follow', who: lena.identity.author, on: true });
    await lena.setEdge({ edge: 'follow', who: martl.identity.author, on: true });
    sync(martl, lena);
    sync(lena, martl);
    const chat = await lena.openChat(martl.identity.author);
    sync(lena, martl);

    // Lena's phone turns pushes on: an address for Studio and one for the chat with martl, each its own.
    const phone = browser('phone');
    await lena.pushTargets.setHost(phone.host);
    await lena.pushTargets.reconcile();
    expect(phone.targets.get(studio.id)).toBeDefined();
    expect(phone.targets.get(chat.id)).toBeDefined();
    expect(phone.targets.get(studio.id)!.address).not.toBe(phone.targets.get(chat.id)!.address);
    // Nothing new to say a second time.
    const said = (await lena.feed({ kinds: [KIND_PUSH_TARGET], limit: 0 })).length;
    await lena.pushTargets.reconcile();
    expect((await lena.feed({ kinds: [KIND_PUSH_TARGET], limit: 0 })).length).toBe(said);

    for (const to of [martl, nic]) sync(lena, to);
    const studioHere = (n: typeof martl) => n.pushTargets.targetsIn(studio.id);
    // martl maintains Studio: he can open her address there. Nic, a member, can't.
    expect(studioHere(martl).map((t) => t.target.address)).toEqual([phone.targets.get(studio.id)!.address]);
    expect(studioHere(nic)).toEqual([]);

    // martl writes: in the chat and in Studio, a notice sealed to her phone's key for that place.
    const sent: Array<{ target: PushTarget; from: Did; sealed: Json }> = [];
    martl.pushTargets.setSender(async (target, message) => void sent.push({ target, ...message }));
    nic.pushTargets.setSender(async (target, message) => void sent.push({ target, ...message }));
    await martl.say({ space: chat.id, text: 'are you coming tonight?' });
    await martl.say({ space: studio.id, text: 'release is out' });
    await nic.say({ space: studio.id, text: 'nice' });
    await settle();
    expect(sent.map((s) => s.target.address)).toEqual([phone.targets.get(chat.id)!.address, phone.targets.get(studio.id)!.address]);
    expect(sent.every((s) => s.from === martl.identity.author)).toBe(true);
    const [dm, project] = sent.map((s) => phone.open(s.target.address, s.sealed));
    expect(dm).toMatchObject({ title: 'martl', text: 'are you coming tonight?', open: { space: { id: chat.id, kind: 'direct' } }, tag: chat.id });
    expect(project).toMatchObject({ title: 'martl · Studio', text: 'release is out', open: { space: { id: studio.id, kind: 'project' } } });

    // Nic becomes a maintainer: her phone seals Studio's address to him too (same address: nobody left).
    await martl.setMaintainer({ project: studio.id, who: nic.identity.author, on: true });
    sync(martl, lena);
    await lena.pushTargets.reconcile();
    sync(lena, nic);
    expect(studioHere(nic).map((t) => t.target.address)).toEqual([phone.targets.get(studio.id)!.address]);

    // Pushes off: every address goes back, and nobody can open one any more.
    await lena.pushTargets.setHost(undefined);
    expect(phone.targets.size).toBe(0);
    sync(lena, martl);
    expect(studioHere(martl)).toEqual([]);
  });

  it('a quiet place or person has no address (the most specific rule wins)', () => {
    const peer = 'did:key:zPeer' as Did;
    expect(notifies([], 'S')).toBe(true);
    expect(notifies([{ space: 'S', notify: false }], 'S')).toBe(false);
    expect(notifies([{ space: 'S', notify: false }], 'T')).toBe(true);
    expect(notifies([{ notify: false }, { space: 'S', notify: true }], 'S')).toBe(true);
    expect(notifies([{ who: peer, notify: false }], 'D', peer)).toBe(false);
    expect(notifies([{ who: peer, notify: false }], 'S')).toBe(true);
    expect(notifies([{ space: 'S', board: 'ideas', notify: false }], 'S')).toBe(true);
  });
});
