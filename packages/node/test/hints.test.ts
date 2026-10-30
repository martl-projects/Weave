import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { checkHintAnswer } from '@weave/core';
import { closeOpenStores, MARKS_TIMING, WeaveNode } from '../src/index.ts';
import { digestOf } from '../src/shipped.ts';
import { buildComponent } from './helpers/components.ts';

/*
 * Hint services (stage 20): numbers about your own state next to places. Unread, shipped with Weave, counts the
 * notices your node works out for you until you open the place; what you opened and its rules are sealed to you, so
 * every device of yours counts alike.
 */

const dirs: string[] = [];
const nodes: WeaveNode[] = [];
const tempDir = (prefix: string) => {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  dirs.push(dir);
  return dir;
};
afterAll(async () => {
  for (const node of nodes) await node.close().catch(() => {});
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

const SHIPPED_SRC = join(import.meta.dirname, '..', '..', 'shipped');
let SHIPPED: string;
beforeAll(async () => {
  MARKS_TIMING.askMs = 20_000;
  MARKS_TIMING.foldWaitMs = 60_000;
  SHIPPED = tempDir('weave-hints-shipped-');
  const list: Record<string, unknown> = {};
  for (const name of ['unread', 'spotlight']) {
    const component = await buildComponent(join(SHIPPED_SRC, name, 'src', 'service.js'), 'marks', { bundle: true });
    const manifest = JSON.parse(readFileSync(join(SHIPPED_SRC, name, 'weave.app.json'), 'utf8')) as { hints: { component: string } };
    copyFileSync(component, join(SHIPPED, manifest.hints.component));
    list[name] = { component: manifest.hints.component, digest: digestOf(component), manifest };
  }
  writeFileSync(join(SHIPPED, 'shipped.json'), JSON.stringify(list));
}, 300_000);

function person(name: string): WeaveNode {
  const node = WeaveNode.init(name, tempDir('weave-hints-'));
  node.wasmSetup.shippedDir = SHIPPED;
  nodes.push(node);
  return node;
}

const sync = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) from.replica.events().forEach((e) => to.replica.ingest(e));
};
const tick = () => new Promise((resolve) => setTimeout(resolve, 5));

describe('hint services', { timeout: 240_000 }, () => {
  it('count what came in for you until you open it, by rules sealed to you', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const climb = await martl.createGroup('Climb');
    await lena.joinSpace(await martl.invite('Climb'));
    sync([martl, lena]);
    const count = async (subject: unknown) => (await martl.hints({ slot: 'place', subjects: [subject] }))[0].hints.map((h) => [h.kind, h.count, h.issuer.name, h.issuer.weave]);

    // Weave's own, everyone's from the start; nothing old counts (the first start says everything before was seen).
    expect(await martl.hintServices()).toMatchObject([
      { service: 'weave-unread', name: 'Unread', shipped: true, settings: {} },
      { service: 'weave-spotlight', name: 'Spotlight', shipped: true, settings: {} },
    ]);
    expect(await count({ space: climb.id })).toEqual([]);
    await tick();

    // A message to you counts, in its place and its channel; any other message doesn't (without a rule).
    await lena.say({ space: 'Climb', text: '@martl rope tomorrow?' });
    await lena.say({ space: 'Climb', text: 'hello all' });
    sync([martl, lena]);
    expect(await count({ space: climb.id })).toEqual([['count', 1, 'Unread', true]]);
    expect(await count({ channel: { space: climb.id, name: 'general' } })).toEqual([['count', 1, 'Unread', true]]);
    expect(await count({ channel: { space: climb.id, name: 'gear' } })).toEqual([]);

    // Opened: it counts no more (sealed to you: your other devices hold it too).
    await martl.seen({ space: climb.id, view: 'channel', name: 'general' });
    expect(await count({ space: climb.id })).toEqual([]);
    await expect(martl.seen({ space: climb.id, view: 'board' })).rejects.toThrow(/which board/);

    // A rule (Unread's settings): what Lena says to you doesn't count, the rest does.
    await tick();
    const muted = { rules: [{ who: lena.identity.author, count: false, notify: false }] };
    await martl.setHints({ service: 'Unread', settings: muted });
    await lena.say({ space: 'Climb', text: '@martl who brings the chalk?' });
    sync([martl, lena]);
    expect(await count({ space: climb.id })).toEqual([]);
    expect((await martl.hintServices()).find((s) => s.service === 'weave-unread')!.settings).toEqual(muted);
    await martl.setHints({ service: 'Unread', settings: {} });
    expect(await count({ space: climb.id })).toEqual([['count', 1, 'Unread', true]]);

    // Turned off: nothing; back on: its rules are still there.
    await martl.setHints({ service: 'Unread', settings: { rules: [{ space: climb.id, count: true, notify: true }] } });
    await martl.removeHints({ service: 'Unread' });
    expect(await count({ space: climb.id })).toEqual([]);
    expect((await martl.hintServices({ off: true })).find((s) => s.service === 'weave-unread')).toMatchObject({ off: true });
    await martl.addHints({ shipped: 'Unread' });
    expect((await martl.hintServices()).find((s) => s.service === 'weave-unread')!.settings).toEqual({ rules: [{ space: climb.id, count: true, notify: true }] });
    expect(await count({ space: climb.id })).toEqual([['count', 1, 'Unread', true]]);

    // A project's release is taken in only with a yes, and none is here.
    await expect(martl.addHints({ project: 'Climb' })).rejects.toThrow();
  });

  it('make what matters to you stand out: a board you care about, someone close to you, your contacts', async () => {
    const martl = person('martl');
    const lena = person('Lena');
    const mia = person('Mia');
    const ops = await martl.createProject({ name: 'Ops' });
    await martl.setBoard({ project: 'Ops', name: 'internal', title: 'Internal' });
    const friends = await martl.createGroup('Friends');
    await lena.joinSpace(await martl.invite('Ops'));
    await mia.joinSpace(await martl.invite('Friends'));
    await lena.joinSpace(await martl.invite('Friends'));
    sync([martl, lena, mia]);
    const say = async (slot: 'place' | 'message', subject: unknown) =>
      (await martl.hints({ slot, subjects: [subject] }))[0].hints.filter((h) => h.issuer.name === 'Spotlight').map((h) => [h.kind, h.tone ?? h.sign]);

    // Nothing until its settings say who and what.
    await martl.hints({ slot: 'place', subjects: [{ space: ops.id }] });
    await tick();
    await lena.submit({ space: 'Ops', board: 'internal', title: 'Server move on Friday' });
    sync([martl, lena, mia]);
    expect(await say('place', { space: ops.id })).toEqual([]);

    // Internal posts tint the project, Mia's messages bring her heart, and are hers in the chat.
    await martl.setHints({
      service: 'Spotlight',
      settings: { boards: [{ board: 'internal', tone: 'yellow' }], people: [{ who: mia.identity.author, name: 'Mia', sign: 'heart', tone: 'red' }], contacts: { tone: 'blue' } },
    });
    expect(await say('place', { space: ops.id })).toEqual([['tint', 'yellow']]);
    expect(await say('place', { board: { space: ops.id, name: 'internal' } })).toEqual([['tint', 'yellow']]);
    expect(await say('place', { board: { space: ops.id, name: 'ideas' } })).toEqual([]);
    const fromMia = await mia.say({ space: 'Friends', text: 'dinner tonight?' });
    const fromLena = await lena.say({ space: 'Friends', text: 'count me in' });
    sync([martl, lena, mia]);
    expect(await say('place', { space: friends.id })).toEqual([['sign', 'heart']]);
    expect(await say('message', { message: { space: friends.id, id: fromMia.id } })).toEqual([['tint', 'red'], ['sign', 'heart']]);
    expect(await say('message', { message: { space: friends.id, id: fromLena.id } })).toEqual([]);

    // Opened: the place stands out no more; Mia's message still does. Lena in your contacts: hers stand out too.
    await martl.seen({ space: friends.id, view: 'all' });
    await martl.seen({ space: ops.id, view: 'board', name: 'internal' });
    expect(await say('place', { space: friends.id })).toEqual([]);
    expect(await say('place', { space: ops.id })).toEqual([]);
    expect(await say('message', { message: { space: friends.id, id: fromMia.id } })).toEqual([['tint', 'red'], ['sign', 'heart']]);
    await martl.addContact(await lena.contactLink());
    expect(await say('message', { message: { space: friends.id, id: fromLena.id } })).toEqual([['tint', 'blue']]);
  });

  it('keeps answers to the vocabulary and to what was asked', () => {
    const asked = [{ space: 'aaaa' }, { board: { space: 'aaaa', name: 'ideas' } }];
    const checked = checkHintAnswer(
      [
        { subject: { space: 'aaaa' }, hint: { kind: 'count', count: 3, tooltip: 'three\u0000' } },
        { subject: { board: { space: 'aaaa', name: 'ideas' } }, hint: { kind: 'check' } },
        { subject: { space: 'bbbb' }, hint: { kind: 'count', count: 1 } },
        { subject: { space: 'aaaa' }, hint: { kind: 'count', count: 9 } },
      ],
      asked,
    );
    expect([...checked]).toEqual([['space:aaaa', [{ kind: 'count', count: 3, tooltip: 'three' }]]]);
    expect(checkHintAnswer([{ subject: { space: 'aaaa' }, hint: { kind: 'count', count: 0 } }], asked).size).toBe(0);
    // Several kinds at once, one of each; tones and signs only from the vocabulary; no number on a message.
    const message = { message: { space: 'aaaa', id: 'm1' } };
    const many = checkHintAnswer(
      [{ subject: { space: 'aaaa' }, hints: [{ kind: 'tint', tone: 'yellow' }, { kind: 'tint', tone: 'red' }, { kind: 'sign', sign: 'skull' }, { kind: 'sign', sign: 'heart' }] }],
      [{ space: 'aaaa' }],
    );
    expect([...many]).toEqual([['space:aaaa', [{ kind: 'tint', tone: 'yellow' }, { kind: 'sign', sign: 'heart' }]]]);
    const onMessage = checkHintAnswer([{ subject: message, hints: [{ kind: 'count', count: 2 }, { kind: 'tint', tone: '#ff0' }, { kind: 'sign', sign: 'star' }] }], [message], 'message');
    expect([...onMessage]).toEqual([['message:aaaa/m1', [{ kind: 'sign', sign: 'star' }]]]);
  });
});
