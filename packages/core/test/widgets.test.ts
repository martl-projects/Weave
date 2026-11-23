import { describe, expect, it } from 'vitest';
import {
  locationCovers,
  roughLocation,
  screenTilt,
  lensFileName,
  lensNotify,
  LENS_NOTIFY,
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

  it('reads the hosts a site may load from, by name only, and only with a site', () => {
    const ok = checkManifest({ app: 'woods', name: 'Woods', client: { component: 'b.wasm', site: 'site', writes: [], net: ['API.open-meteo.com', '*.tile.openstreetmap.org', 'api.open-meteo.com'] }, widget: { component: 'b.wasm', site: 'site', writes: ['woods.find'], net: ['api.open-meteo.com'] } });
    expect(ok.problems).toEqual([]);
    expect(ok.manifest!.client!.net).toEqual(['api.open-meteo.com', '*.tile.openstreetmap.org']);
    expect(ok.manifest!.widget!.net).toEqual(['api.open-meteo.com']);
    expect(checkManifest({ app: 'w', name: 'W', client: { component: 'b.wasm', site: 'site', writes: [], net: [] } }).manifest!.client).not.toHaveProperty('net');
    for (const bad of [['localhost'], ['127.0.0.1'], ['{BUCKET}.s3.amazonaws.com'], ['https://api.example.com'], 'api.example.com'])
      expect(checkManifest({ app: 'w', name: 'W', client: { component: 'b.wasm', site: 'site', writes: [], net: bad } }).problems.join()).toMatch(/client.net/);
    expect(checkManifest({ app: 'w', name: 'W', widget: { component: 'b.wasm', writes: [], net: ['api.example.com'] } }).problems.join()).toMatch(/widget.net" is for its site/);
  });

  it('reads that a site may ask how the device is tilted, only with a site', () => {
    const ok = checkManifest({ app: 'album', name: 'Album', client: { component: 'b.wasm', site: 'site', writes: [], tilt: true }, widget: { component: 'b.wasm', site: 'site', writes: ['album.turn'], tilt: false } });
    expect(ok.problems).toEqual([]);
    expect(ok.manifest!.client!.tilt).toBe(true);
    expect(ok.manifest!.widget!.tilt).toBeUndefined();
    expect(checkManifest({ app: 'w', name: 'W', client: { component: 'b.wasm', site: 'site', writes: [], tilt: 'yes' } }).problems.join()).toMatch(/client.tilt/);
    expect(checkManifest({ app: 'w', name: 'W', widget: { component: 'b.wasm', writes: [], tilt: true } }).problems.join()).toMatch(/widget.tilt" is for its site/);
  });

  it('makes a file name a view gives safe to save under', () => {
    expect(lensFileName('Unser Sommer 2026.pdf')).toBe('Unser Sommer 2026.pdf');
    expect(lensFileName('..\\..\\autoexec.bat')).toBe('autoexec.bat');
    expect(lensFileName('a/b:c*?"<>|d.pdf')).toBe('a b c d.pdf');
    expect(lensFileName('  ...  ')).toBe('file');
    expect(lensFileName(7)).toBe('file');
    expect(lensFileName('x'.repeat(200)).length).toBe(80);
  });

  it('reads that a lens may tell members and ask about tickets, and whom an event tells', () => {
    const ok = checkManifest({ app: 'bets', name: 'Bets', client: { component: 'b.wasm', site: 'site', writes: ['lb.ticket'], notify: true, tickets: true } });
    expect(ok.problems).toEqual([]);
    expect(ok.manifest!.client).toMatchObject({ notify: true, tickets: true });
    expect(checkManifest({ app: 'bets', name: 'Bets', client: { component: 'b.wasm', site: 'site', writes: [] } }).manifest!.client).not.toHaveProperty('notify');
    expect(checkManifest({ app: 'w', name: 'W', client: { component: 'b.wasm', writes: [], notify: 'all' } }).problems.join()).toMatch(/client.notify/);
    expect(checkManifest({ app: 'w', name: 'W', client: { component: 'b.wasm', writes: [], tickets: true } }).problems.join()).toMatch(/client.tickets" is for its site/);
    // Whom an event tells: people by their ids, each once, with one line; nobody or nothing said is no notice.
    expect(lensNotify({ notify: { to: ['did:key:a', 'did:key:a', 7, 'bob'], text: '  Your ticket:\n 1000 chips ' } })).toEqual({ to: ['did:key:a'], text: 'Your ticket: 1000 chips' });
    expect(lensNotify({ notify: { to: [], text: 'hi' } })).toBeUndefined();
    expect(lensNotify({ notify: { to: ['did:key:a'], text: ' ' } })).toBeUndefined();
    expect(lensNotify({ notify: 'everyone' })).toBeUndefined();
    const many = lensNotify({ notify: { to: Array.from({ length: 80 }, (_, i) => `did:key:${i}`), text: 'x'.repeat(500) } })!;
    expect([many.to.length, many.text.length]).toEqual([LENS_NOTIFY.to, LENS_NOTIFY.text]);
  });

  it('tells a tilt as the screen is held, without the compass', () => {
    expect(screenTilt(40.26, -12.74)).toEqual({ x: -12.5, y: 40.5 });
    expect(screenTilt(40, -12, 90)).toEqual({ x: 40, y: 12 });
    expect(screenTilt(40, -12, 180)).toEqual({ x: 12, y: -40 });
    expect(screenTilt(40, -12, 270)).toEqual({ x: -40, y: -12 });
    expect(screenTilt(0, 0, -90)).toEqual({ x: 0, y: 0 });
  });

  it('reads how closely a site may know where its member is, only with a site', () => {
    const ok = checkManifest({ app: 'woods', name: 'Woods', client: { component: 'b.wasm', site: 'site', writes: [], location: 'rough' }, widget: { component: 'b.wasm', site: 'site', writes: ['woods.find'], location: 'exact' } });
    expect(ok.problems).toEqual([]);
    expect(ok.manifest!.client!.location).toBe('rough');
    expect(ok.manifest!.widget!.location).toBe('exact');
    expect(checkManifest({ app: 'w', name: 'W', client: { component: 'b.wasm', site: 'site', writes: [], location: 'near' } }).problems.join()).toMatch(/client.location/);
    expect(checkManifest({ app: 'w', name: 'W', widget: { component: 'b.wasm', writes: [], location: 'rough' } }).problems.join()).toMatch(/widget.location" is for its site/);
  });

  it('makes a place rough: the middle of its 0.01° cell, the same for every place in it', () => {
    expect(roughLocation(48.3412, 10.7356)).toEqual({ lat: 48.345, lon: 10.735 });
    expect(roughLocation(48.3488, 10.7301)).toEqual({ lat: 48.345, lon: 10.735 });
    expect(roughLocation(-33.8688, 151.2093)).toEqual({ lat: -33.865, lon: 151.205 });
    expect([locationCovers('exact', 'rough'), locationCovers('rough', 'rough'), locationCovers('rough', 'exact'), locationCovers(undefined, 'rough')]).toEqual([true, true, false, false]);
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
