import { describe, expect, it } from 'vitest';
import {
  artifactKindOf,
  boardOfEvents,
  channelsOf,
  checkManifest,
  createIdentity,
  deletedMessages,
  eventId,
  KIND_WIDGET,
  messagesOf,
  parseManifest,
  Replica,
  widgetEventsOf,
  widgetMayWrite,
  widgetOf,
  WIDGET_HEIGHT,
  type Entry,
  type Json,
  type SigningIdentity,
} from '../src/index.ts';

/*
 * Group widgets (docs/group-widgets.md): a weave.widget message is one instance of a mini-app; its own kinds carry
 * `target` (the message), and an instance's events are only those.
 */

function setup() {
  const replica = new Replica();
  const entries: Entry[] = [];
  let minute = 0;
  const post = (who: SigningIdentity, kind: string, body: Json): string => {
    const event = replica.append(who, { kind, body, time: `2026-11-15T10:${String(minute++).padStart(2, '0')}:00.000Z` });
    entries.push({ id: eventId(event), event, kind, body });
    return eventId(event);
  };
  return { entries, post };
}

const wasm = { file: 'tally-wasm.tar.gz', sha256: 'a'.repeat(64), size: 10, parts: [{ hash: 'h'.repeat(43), key: 'k'.repeat(43) }] };
const released = (widget: Record<string, unknown> = { component: 'tally.wasm', site: 'site', writes: ['tally.vote'] }) =>
  parseManifest({ app: 'tally', name: 'Tally', widget, install: { tag: '1.0', source: { provider: 'weave', ref: 'p' }, assets: { wasm } } });
const body = (title = 'Lunch?', extra: Record<string, Json> = {}): Json => ({ app: { project: 'proj1', release: 'rel1', tag: '1.0' }, manifest: released() as unknown as Json, title, ...extra });

describe('the widget manifest', () => {
  it('reads widget beside client, with its own kinds only and a height in bounds', () => {
    const both = checkManifest({ app: 'tiles', name: 'Word Tiles', client: { component: 'board.wasm', site: 'site', writes: ['weave.post', 'tiles.move'] }, widget: { component: 'board.wasm', site: 'site', writes: ['tiles.move'], size: { height: 9000 } } });
    expect(both.problems).toEqual([]);
    expect(both.manifest!.widget).toEqual({ component: 'board.wasm', site: 'site', writes: ['tiles.move'], size: { height: WIDGET_HEIGHT.max } });
    expect(artifactKindOf(both.manifest!)).toBe('board-view');
    const alone = checkManifest({ app: 'tally', name: 'Tally', widget: { component: 'tally.wasm', writes: ['tally.vote'] } });
    expect(alone.problems).toEqual([]);
    expect(artifactKindOf(alone.manifest!)).toBe('widget');
    expect(alone.manifest!.widget!.size).toBeUndefined();
  });

  it("refuses Weave's own kinds, a missing component and a height that isn't one", () => {
    expect(checkManifest({ app: 'x', name: 'X', widget: { component: 'x.wasm', writes: ['weave.post', 'x.move'] } }).problems.join()).toMatch(/never Weave's \(not weave.post\)/);
    expect(checkManifest({ app: 'x', name: 'X', widget: { site: 'site', writes: [] } }).problems.join()).toMatch(/widget.component/);
    expect(checkManifest({ app: 'x', name: 'X', widget: { component: 'x.wasm', writes: [], size: { height: 'tall' } } }).problems.join()).toMatch(/widget.size/);
  });
});

describe('widget messages', () => {
  it('parses an instance from its message, and refuses one without a widget release to fetch', () => {
    const { entries, post } = setup();
    const martl = createIdentity();
    const id = post(martl, KIND_WIDGET, body());
    const w = widgetOf(entries.find((e) => e.id === id)!)!;
    expect(w).toMatchObject({ id, author: martl.author, title: 'Lunch?', name: 'Tally', height: WIDGET_HEIGHT.default, app: { project: 'proj1', release: 'rel1', tag: '1.0' } });
    // Untitled: the release's name.
    const untitled = post(martl, KIND_WIDGET, body(''));
    expect(widgetOf(entries.find((e) => e.id === untitled)!)!.title).toBe('Tally');
    // Not a widget release, another tag than its manifest's, or a bad project id: no widget.
    const plain = parseManifest({ app: 'p', name: 'P', client: { component: 'b.wasm', writes: [] }, install: { tag: '1.0', source: { provider: 'weave', ref: 'p' }, assets: { wasm } } });
    for (const bad of [{ ...(body() as object), manifest: plain }, { ...(body() as object), app: { project: 'proj1', release: 'rel1', tag: '2.0' } }, { ...(body() as object), app: { project: 'no way', release: 'rel1', tag: '1.0' } }]) {
      const sent = post(martl, KIND_WIDGET, bad as unknown as Json);
      expect(widgetOf(entries.find((e) => e.id === sent)!)).toBeUndefined();
    }
  });

  it("gives each instance its own events: its kinds, about it, nobody else's", () => {
    const { entries, post } = setup();
    const [martl, ola] = [createIdentity(), createIdentity()];
    const a = post(martl, KIND_WIDGET, body('A'));
    const b = post(ola, KIND_WIDGET, body('B'));
    post(ola, 'tally.vote', { target: a, choice: 'yes' });
    post(martl, 'tally.vote', { target: b, choice: 'no' });
    post(martl, 'tally.other', { target: a });
    post(martl, 'weave.react', { target: a, emoji: '👍' });
    post(martl, 'tally.vote', { choice: 'nowhere' });
    const of = (id: string) => widgetEventsOf(entries, widgetOf(entries.find((e) => e.id === id)!)!).map((e) => (e.body as { choice: string }).choice);
    expect(of(a)).toEqual(['yes']);
    expect(of(b)).toEqual(['no']);
    expect(widgetMayWrite(released(), 'tally.vote')).toBe(true);
    expect(widgetMayWrite(released(), 'tally.other')).toBe(false);
    expect(widgetMayWrite(released({ component: 'x.wasm', writes: ['tally.vote'] }), 'weave.msg')).toBe(false);
  });

  it('shows in the chat as a message carrying its widget, and is taken down like one', () => {
    const { entries, post } = setup();
    const [martl, ola] = [createIdentity(), createIdentity()];
    post(martl, 'weave.msg', { text: 'who is hungry?' });
    const w = post(ola, KIND_WIDGET, body('Lunch?', { channel: 'food' }));
    const inPost = post(ola, KIND_WIDGET, body('In a post', { post: 'post1' }));
    expect(messagesOf(entries, { channel: 'food' })).toMatchObject([{ id: w, text: '', channel: 'food', widget: { title: 'Lunch?', name: 'Tally', app: { tag: '1.0' }, height: WIDGET_HEIGHT.default } }]);
    expect(messagesOf(entries, { post: 'post1' }).map((m) => m.id)).toEqual([inPost]);
    expect(channelsOf(entries).map((c) => c.name)).toContain('food');
    // Its author takes it down; someone else can't (without moderating).
    post(martl, 'weave.post.delete', { target: w });
    expect(deletedMessages(entries).has(w)).toBe(false);
    post(ola, 'weave.post.delete', { target: w });
    expect(deletedMessages(entries).has(w)).toBe(true);
    expect(messagesOf(entries, { channel: 'food' })).toEqual([]);
  });

  it("puts a widget in a post's chat, and its events, in that post's board", () => {
    const { entries, post } = setup();
    const martl = createIdentity();
    const p = post(martl, 'weave.post', { title: 'Plans', board: 'secret' });
    const w = post(martl, KIND_WIDGET, body('Vote', { post: p }));
    const vote = post(martl, 'tally.vote', { target: w, choice: 'yes' });
    const inChannel = post(martl, KIND_WIDGET, body('Out here'));
    const boards = boardOfEvents(entries, {});
    expect(boards.get(w)).toBe('secret');
    expect(boards.get(vote)).toBe('secret');
    expect(boards.has(inChannel)).toBe(false);
  });
});
