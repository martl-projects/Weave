import { describe, expect, it } from 'vitest';
import { decryptBlob, encryptBlob, MAX_BLOB, parseBlobRef } from '@weave/core';
import type { WeaveNode } from '../src/index.ts';
import { day, people, sync } from './helpers/people.ts';

/*
 * Files and images in chat (Phil's proposal f9IjggSI): a message carries a
 * file by its blob reference with name, size and type; the sender holds the
 * blob, the readers fetch it; and when a message is forgotten by rule, its
 * file goes too.
 */

const { person } = people('attachments');
const PDF = Buffer.from('%PDF-1.4\n%fake, for the tests\n');
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const syncAll = (all: WeaveNode[]) => {
  for (let round = 0; round < 2; round++) for (const from of all) for (const to of all) if (from !== to) sync(from, to);
};

describe('a file in a chat message', () => {
  it('goes with its name, size and type, with or without text, and is read back as it was', async () => {
    const [bob, alice] = [person('Bob'), person('Alice')];
    await bob.createProject({ name: 'Weave' });
    await alice.joinSpace(await bob.invite('Weave'));
    sync(alice, bob);
    const file = await bob.putFile({ data: PDF.toString('base64'), name: 'C:\\Users\\bob\\spec.pdf', type: 'application/pdf' });
    expect(file).toMatchObject({ name: 'spec.pdf', size: PDF.length, type: 'application/pdf' });
    expect(parseBlobRef(file.ref)).toBeTruthy();
    const said = await bob.say({ space: 'Weave', text: 'the spec', file });
    expect(said.file).toEqual(file);
    // Text optional when a file comes along; an image through putBlob attaches the same way.
    const only = await bob.say({ space: 'Weave', file });
    expect(only.text).toBe('');
    const image = await bob.putBlob({ data: PIXEL.toString('base64'), type: 'image/png' });
    await bob.say({ space: 'Weave', file: { ref: image, name: 'pixel.png', size: PIXEL.length, type: 'image/png' }, replyTo: only.id });
    const messages = await bob.messages('Weave');
    expect(messages.map((m) => [m.text, m.file?.name])).toEqual([
      ['the spec', 'spec.pdf'],
      ['', 'spec.pdf'],
      ['', 'pixel.png'],
    ]);
    // A reply to a message without text names its file.
    expect(messages[2].replyTo?.text).toBe('📎 spec.pdf');
    // The others see the same message; the bytes come from whoever holds the blob.
    sync(bob, alice);
    expect((await alice.messages('Weave'))[0].file).toEqual(file);
    expect(alice.blobs.has(parseBlobRef(file.ref)!.hash)).toBe(false);
    alice.blobs.put(bob.blobs.get(parseBlobRef(file.ref)!.hash)!);
    expect(await alice.blob(file.ref)).toEqual({ data: PDF.toString('base64'), type: 'application/pdf' });
  });

  it('is refused without the blob here, over 2 MB, with a bad name or type, or with nothing to say', async () => {
    const bob = person('Bob');
    await bob.createProject({ name: 'Weave' });
    const file = await bob.putFile({ data: PDF.toString('base64'), name: 'spec.pdf', type: 'application/pdf' });
    await expect(bob.say({ space: 'Weave' })).rejects.toThrow(/text or a file/);
    await expect(bob.say({ space: 'Weave', text: '' })).rejects.toThrow(/text or a file/);
    // Someone else's reference, never stored here: nobody could fetch it from this node.
    const elsewhere = encryptBlob(PDF, 'application/pdf');
    await expect(bob.say({ space: 'Weave', file: { ...file, ref: `wblob:${elsewhere.ref.hash}.${elsewhere.ref.key}` } })).rejects.toThrow(/isn't stored here/);
    await expect(bob.say({ space: 'Weave', file: { ...file, name: '' } })).rejects.toThrow(/wblob: reference, a name/);
    await expect(bob.say({ space: 'Weave', file: { ...file, type: 'not a type' } })).rejects.toThrow(/media type/);
    await expect(bob.say({ space: 'Weave', file: { ...file, size: -1 } })).rejects.toThrow(/size/);
    await expect(bob.putFile({ data: Buffer.alloc(MAX_BLOB).toString('base64'), name: 'big.bin', type: 'application/octet-stream' })).rejects.toThrow(/at most 2 MB/);
    await expect(bob.putFile({ data: 'AAAA', name: '..', type: 'text/plain' })).rejects.toThrow(/needs a name/);
    await expect(bob.putFile({ data: 'AAAA', name: 'x.txt', type: 'TEXT' })).rejects.toThrow(/media type/);
    // Images for posts and pages stay images.
    await expect(bob.putBlob({ data: 'AAAA', type: 'application/pdf' })).rejects.toThrow(/images are/);
    const sealed = encryptBlob(PDF, 'application/pdf');
    expect(decryptBlob(sealed.data, sealed.ref.key)).toEqual({ bytes: new Uint8Array(PDF), type: 'application/pdf' });
    expect(() => encryptBlob(PDF, 'TEXT')).toThrow(/media type/);
  });

  it('goes when its message is forgotten by rule, unless something kept still points at it', async () => {
    const [martin, lena, kofi] = [person('Martin'), person('Lena'), person('Kofi')];
    const all = [martin, lena, kofi];
    await martin.createProject({ name: 'Weave' });
    await lena.joinSpace(await martin.invite('Weave'));
    await kofi.joinSpace(await martin.invite('Weave'));
    syncAll(all);
    await martin.setBoardRule({ space: 'Weave', board: 'ideas', keepDays: 30 });
    const quiet = await lena.submit({ space: 'Weave', title: 'Quiet idea' });
    const spec = await lena.putFile({ data: PDF.toString('base64'), name: 'spec.pdf', type: 'application/pdf' });
    await lena.say({ space: 'Weave', text: 'the spec', post: quiet.id, file: spec });
    // The same picture in the quiet idea's chat and on the project's page: the page keeps it alive.
    const logo = await lena.putBlob({ data: PIXEL.toString('base64'), type: 'image/png' });
    await lena.say({ space: 'Weave', post: quiet.id, file: { ref: logo, name: 'logo.png', size: PIXEL.length, type: 'image/png' } });
    await martin.setProjectPage({ project: 'Weave', icon: logo });
    syncAll(all);
    // Kofi fetched both (as his node would, ahead of time).
    for (const ref of [spec.ref, logo]) kofi.blobs.put(lena.blobs.get(parseBlobRef(ref)!.hash)!);
    expect(kofi.blobs.has(parseBlobRef(spec.ref)!.hash)).toBe(true);

    for (const node of all) node.clock = () => Date.now() + 40 * day;
    await kofi.reconcile();
    expect((await kofi.posts({ space: 'Weave' })).map((p) => p.title)).not.toContain('Quiet idea');
    expect(kofi.blobs.has(parseBlobRef(spec.ref)!.hash)).toBe(false);
    expect(kofi.blobs.has(parseBlobRef(logo)!.hash)).toBe(true);
    // Lena wrote it: her node keeps the message and its file.
    await lena.reconcile();
    expect(lena.blobs.has(parseBlobRef(spec.ref)!.hash)).toBe(true);
  });
});
