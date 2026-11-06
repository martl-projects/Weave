import { afterEach, describe, expect, it, vi } from 'vitest';
import { b64u } from '@weave/core';
import { openingFrom, openingFromWords, openBox, openHomeKey, PRF_SALT, sealBox, sealHomeKey } from '../src/lock.ts';
import { askPasskey, makePasskey } from '../src/passkey.ts';

/** What a passkey gives, and what comes of it. The ceremony itself takes a person and a device: here a stand-in answers. */

afterEach(() => vi.unstubAllGlobals());

const RAW = new Uint8Array([1, 2, 3]).buffer;
const answer = (prf: unknown) => ({ rawId: RAW, getClientExtensionResults: () => ({ prf }) });

function stub(credentials: { create?: unknown; get?: unknown }) {
  const create = vi.fn(async () => credentials.create);
  const get = vi.fn(async () => credentials.get);
  vi.stubGlobal('navigator', { credentials: { create, get } });
  return { create, get };
}

describe('a passkey in the page', () => {
  const secret = new Uint8Array(32).fill(7);

  it('takes the value where the passkey gives it right away (an iPhone does)', async () => {
    const { create, get } = stub({ create: answer({ enabled: true, results: { first: secret.buffer } }) });
    expect(await makePasskey('Web')).toEqual({ id: b64u.encode(new Uint8Array(RAW)), secret });
    expect(get).not.toHaveBeenCalled();
    const asked = (create.mock.calls as unknown as Array<[CredentialCreationOptions]>)[0][0].publicKey!;
    expect((asked.extensions as { prf: { eval: { first: Uint8Array } } }).prf.eval.first).toEqual(PRF_SALT);
    expect(asked.authenticatorSelection?.residentKey).toBe('required');
  });

  it('asks the new passkey once more where it gives the value only when asked', async () => {
    const { get } = stub({ create: answer({ enabled: true }), get: answer({ results: { first: secret.buffer } }) });
    expect((await makePasskey('Web')).secret).toEqual(secret);
    const asked = (get.mock.calls as unknown as Array<[CredentialRequestOptions]>)[0][0].publicKey!;
    expect(asked.allowCredentials).toHaveLength(1);
  });

  it('reads a value that is a view into something larger', async () => {
    const whole = new Uint8Array(40).fill(1);
    whole.fill(9, 4, 36);
    stub({ get: answer({ results: { first: new Uint8Array(whole.buffer, 4, 32) } }) });
    expect((await askPasskey()).secret).toEqual(new Uint8Array(32).fill(9));
  });

  it('says so when a passkey gives no value: an account needs one', async () => {
    stub({ get: answer(undefined) });
    await expect(askPasskey()).rejects.toThrow('no PRF value');
  });

  it('lets the person pick on a new device, where no id is known yet', async () => {
    const { get } = stub({ get: answer({ results: { first: secret.buffer } }) });
    await askPasskey();
    expect((get.mock.calls as unknown as Array<[CredentialRequestOptions]>)[0][0].publicKey!.allowCredentials).toBeUndefined();
  });
});

describe('what opens an account', () => {
  const opening = openingFrom(new Uint8Array(32).fill(1));
  const other = openingFrom(new Uint8Array(32).fill(2));

  it('gives a key and a token that say nothing of each other, the same each time', () => {
    expect(opening.key).not.toEqual(opening.token);
    expect(openingFrom(new Uint8Array(32).fill(1))).toEqual(opening);
    expect(other.token).not.toEqual(opening.token);
  });

  it('reads the words as the person may type them', () => {
    const words = 'abandon '.repeat(23) + 'art';
    expect(openingFromWords(`  ${words.toUpperCase().replaceAll(' ', '   ')} `)).toEqual(openingFromWords(words));
  });

  it('opens what it sealed, and nothing else opens it', () => {
    const key = new Uint8Array(32).fill(5);
    expect(openHomeKey(opening, sealHomeKey(opening, key))).toEqual(key);
    expect(() => openHomeKey(other, sealHomeKey(opening, key))).toThrow();
    expect(openBox(opening, sealBox(opening, { a: 1 }))).toEqual({ a: 1 });
    expect(() => openBox(other, sealBox(opening, { a: 1 }))).toThrow();
  });

  it("keeps a box and a home key apart: one can't stand in for the other", () => {
    const sealedHome = sealHomeKey(opening, new Uint8Array(32).fill(5));
    expect(() => openBox(opening, JSON.stringify(sealedHome))).toThrow();
  });

  it('refuses a secret too short to be one', () => {
    expect(() => openingFrom(new Uint8Array(8))).toThrow('too short');
  });
});
