import { describe, expect, it } from 'vitest';
import { imprintOf, KIND_IMPRINT, parseImprint, TEXT_LIMITS } from '@weave/core';
import { people, sync } from './helpers/people.ts';

/*
 * The imprint (Impressum): who is behind a hub, as the law where its person lives asks them to say it. The person
 * keeps it themself as a signed state event on their hub, public like their profile; others see it once they hold
 * the event.
 */

const { person } = people('imprint');

describe('the imprint kind', () => {
  it('is the latest text of its author, none when empty or malformed', () => {
    const author = 'did:key:z6MkaAuthor' as never;
    const at = (n: number) => new Date(Date.UTC(2026, 10, 2, 12, n)).toISOString();
    expect(imprintOf([])).toBeUndefined();
    expect(imprintOf([{ kind: KIND_IMPRINT, body: { text: 'Phil, Waldweg 1' }, author, time: at(1) }])).toEqual({ text: 'Phil, Waldweg 1', time: at(1) });
    // The latest counts, whatever order the events come in.
    expect(
      imprintOf([
        { kind: KIND_IMPRINT, body: { text: 'Second' }, author, time: at(2) },
        { kind: KIND_IMPRINT, body: { text: 'First' }, author, time: at(1) },
      ])?.text,
    ).toBe('Second');
    // An empty one takes it back; other kinds and malformed bodies don't count.
    expect(imprintOf([{ kind: KIND_IMPRINT, body: { text: 'Was' }, author, time: at(1) }, { kind: KIND_IMPRINT, body: { text: '' }, author, time: at(2) }])).toBeUndefined();
    expect(imprintOf([{ kind: 'weave.profile', body: { text: 'Not one' }, author, time: at(1) }])).toBeUndefined();
    expect(imprintOf([{ kind: KIND_IMPRINT, body: { text: 'Good' }, author, time: at(1) }, { kind: KIND_IMPRINT, body: { name: 'bad' }, author, time: at(2) }])?.text).toBe('Good');
    expect(parseImprint({ text: 'x'.repeat(TEXT_LIMITS.imprint) })).toHaveLength(TEXT_LIMITS.imprint);
    expect(parseImprint({ text: 'x'.repeat(TEXT_LIMITS.imprint + 1) })).toBeUndefined();
    expect(parseImprint(null)).toBeUndefined();
    expect(parseImprint(['text'])).toBeUndefined();
  });
});

describe('the imprint on a hub', () => {
  it('is set, changed and taken back by its person, and seen by others once they hold the event', async () => {
    const phil = person('Phil');
    const lena = person('Lena');
    expect(await phil.imprint()).toBeNull();

    const first = await phil.setImprint({ text: 'Phil Pilz\nWaldweg 1\n12345 Moosdorf\n\nphil@example.org' });
    expect(first).toMatchObject({ did: phil.identity.author, text: 'Phil Pilz\nWaldweg 1\n12345 Moosdorf\n\nphil@example.org' });
    expect(first?.time).toMatch(/^\d{4}-/);
    expect(await phil.imprint()).toEqual(first);
    expect(phil.replica.events((e) => e.kind === KIND_IMPRINT)).toHaveLength(1);

    // Saving the same text again writes nothing; a change is a new version.
    await phil.setImprint({ text: first!.text });
    expect(phil.replica.events((e) => e.kind === KIND_IMPRINT)).toHaveLength(1);
    const second = await phil.setImprint({ text: '  Phil Pilz\nWaldweg 2\n12345 Moosdorf  ' });
    expect(second?.text).toBe('Phil Pilz\nWaldweg 2\n12345 Moosdorf');
    expect(phil.replica.events((e) => e.kind === KIND_IMPRINT)).toHaveLength(2);

    // Lena sees it once she holds Phil's events, by his name or his id; before that, none.
    expect(await lena.imprint(phil.identity.author)).toBeNull();
    sync(phil, lena);
    expect(await lena.imprint(phil.identity.author)).toEqual(second);
    expect(await lena.imprint('Phil')).toEqual(second);
    // Her own stays separate.
    expect(await lena.imprint()).toBeNull();

    // An empty text takes it back.
    expect(await phil.setImprint({ text: '' })).toBeNull();
    expect(await phil.imprint()).toBeNull();
    sync(phil, lena);
    expect(await lena.imprint('Phil')).toBeNull();
  });

  it('refuses text over the limit, instead of cutting it', async () => {
    const phil = person('Phil');
    const full = 'i'.repeat(TEXT_LIMITS.imprint);
    expect((await phil.setImprint({ text: full }))?.text).toHaveLength(TEXT_LIMITS.imprint);
    await expect(phil.setImprint({ text: full + 'x' })).rejects.toThrow('The imprint is too long: 4,001 characters, at most 4,000.');
    await expect(phil.setImprint({ text: 42 as unknown as string })).rejects.toThrow(/text/);
    expect((await phil.imprint())?.text).toHaveLength(TEXT_LIMITS.imprint);
  });
});
