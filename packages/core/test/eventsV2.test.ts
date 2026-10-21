import { describe, expect, it } from 'vitest';
import {
  bodyHash,
  bodyMatches,
  classOf,
  createIdentity,
  createSubKey,
  eventIdV2,
  isWellFormedV2,
  signContentEventV2,
  signControlEventV2,
  signEventV2,
  verifyEventV2,
  type ContentEventV2,
  type ControlEventV2,
} from '../src/index.ts';

const at = '2026-10-21T12:00:00.000Z';

describe('v2 events', () => {
  it('chains control events per signer and space', () => {
    const me = createIdentity();
    const first = signControlEventV2(me, undefined, { kind: 'weave.space.create', space: 'project:abc', body: { name: 'Weave' }, time: at });
    const second = signControlEventV2(me, first, { kind: 'weave.project.maintainer', space: 'project:abc', body: { member: me.author }, time: at });
    expect(first).toMatchObject({ v: 2, class: 'control', seq: 1, prev: null, space: 'project:abc' });
    expect(second).toMatchObject({ seq: 2, prev: eventIdV2(first) });
    for (const e of [first, second]) {
      expect(isWellFormedV2(e)).toBe(true);
      expect(verifyEventV2(e)).toBe(true);
    }
    // A chain belongs to one signer in one space.
    expect(() => signControlEventV2(me, first, { kind: 'weave.board', space: 'project:other' })).toThrow(/this signer/);
  });

  it('keeps content standalone, signed over the hash of a body that travels apart', () => {
    const me = createIdentity();
    const device = createSubKey(me.author);
    const { event, body } = signContentEventV2(device, { kind: 'weave.post', space: 'project:abc', body: { title: 'Hello', text: 'x' }, time: at });
    expect(event).toMatchObject({ v: 2, class: 'content', author: me.author, signer: device.did, body: bodyHash({ title: 'Hello', text: 'x' }) });
    expect('seq' in event || 'prev' in event).toBe(false);
    expect(isWellFormedV2(event)).toBe(true);
    expect(verifyEventV2(event)).toBe(true);
    expect(bodyMatches(event, body)).toBe(true);
    expect(bodyMatches(event, { title: 'Hello', text: 'y' })).toBe(false);
    // Key order doesn't change the hash.
    expect(bodyHash({ text: 'x', title: 'Hello' })).toBe(event.body);
    // The id covers the body's hash: the same without the body at hand.
    expect(eventIdV2(event)).toBe(eventIdV2(JSON.parse(JSON.stringify(event))));
  });

  it('picks the class from the kind, and lets a sealed event claim the class of what it hides', () => {
    expect(classOf('weave.revoke')).toBe('control');
    expect(classOf('weave.board.key')).toBe('control');
    expect(classOf('weave.post')).toBe('content');
    expect(classOf('weave.project.page')).toBe('content');
    const me = createIdentity();
    const control = signEventV2(me, undefined, { kind: 'weave.project.rule', space: 'project:abc', body: { group: 'g', auto: true } });
    expect(control.event.class).toBe('control');
    expect(control.body).toBeUndefined();
    const content = signEventV2(me, undefined, { kind: 'weave.msg', space: 'group:abc', body: { text: 'hi' } });
    expect(content.event.class).toBe('content');
    const sealedRekey = signEventV2(me, undefined, { kind: 'weave.sealed', class: 'control', space: 'group:abc', body: { epoch: 1, nonce: 'n', ct: 'c' } });
    expect(sealedRekey.event).toMatchObject({ class: 'control', kind: 'weave.sealed', seq: 1 });
    expect(isWellFormedV2(sealedRekey.event)).toBe(true);
  });

  it('carries the v1 id it re-signs', () => {
    const me = createIdentity();
    const was = bodyHash('the old event');
    const { event } = signContentEventV2(me, { kind: 'weave.post', space: 'project:abc', body: { title: 't' }, was });
    expect(event.was).toBe(was);
    expect(isWellFormedV2(event)).toBe(true);
  });

  it('refuses tampering and malformed events', () => {
    const me = createIdentity();
    const { event } = signContentEventV2(me, { kind: 'weave.post', space: 'project:abc', body: { title: 't' }, time: at });
    expect(verifyEventV2({ ...event, time: '2026-10-21T12:00:01.000Z' })).toBe(false);
    expect(verifyEventV2({ ...event, body: bodyHash({ title: 'u' }) })).toBe(false);
    const control = signControlEventV2(me, undefined, { kind: 'weave.board', space: 'project:abc', body: { name: 'work' } });

    const bad: unknown[] = [
      { ...event, v: 1 },
      { ...event, class: 'other' },
      { ...event, kind: 'weave.revoke' } satisfies ContentEventV2, // a control kind posing as content
      { ...control, kind: 'weave.post' } satisfies ControlEventV2, // content posing as control
      { ...event, body: { title: 't' } },
      { ...event, seq: 1 },
      { ...control, seq: 2, prev: null },
      { ...control, space: 'not a space' },
      { ...event, extra: 1 },
      null,
      'event',
    ];
    for (const b of bad) expect(isWellFormedV2(b)).toBe(false);
  });
});
