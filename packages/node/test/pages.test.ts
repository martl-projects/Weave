import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import createTestnet, { type Testnet } from 'hyperdht/testnet.js';
import { decryptBlob, encryptBlob, parseBlobRef } from '@weave/core';
import { loadConfig, resolveHome, saveConfig, WeaveNode, closeOpenStores } from '../src/index.ts';

const dirs: string[] = [];
afterAll(() => {
  closeOpenStores();
  dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
});

function home(): string {
  const dir = mkdtempSync(join(tmpdir(), 'weave-pages-'));
  dirs.push(dir);
  return dir;
}

/** A 1×1 PNG. */
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGD4DwABBAEAwS2OUAAAAABJRU5ErkJggg==', 'base64');

describe('blobs', () => {
  it('encrypts a file under the hash of its ciphertext, readable only with its key', () => {
    const { data, ref } = encryptBlob(PIXEL, 'image/png');
    expect(Buffer.from(data).includes(PIXEL)).toBe(false);
    expect(decryptBlob(data, ref.key)).toEqual({ bytes: new Uint8Array(PIXEL), type: 'image/png' });
    expect(() => decryptBlob(data, encryptBlob(PIXEL, 'image/png').ref.key)).toThrow();
    // Same file twice, two different blobs: nobody can tell two people shared the same picture.
    expect(encryptBlob(PIXEL, 'image/png').ref.hash).not.toBe(ref.hash);
  });
});

describe('project pages', () => {
  it('has a title, subtitle, body and images, and reads older pages as a body', async () => {
    const node = WeaveNode.init('Martin', home());
    await node.createProject({ name: 'Weave', description: 'A peer-to-peer place to build things.' });
    // A page from before titles: its description is the body.
    expect((await node.project('Weave')).page).toMatchObject({ title: '', subtitle: '', body: 'A peer-to-peer place to build things.', description: 'A peer-to-peer place to build things.' });

    const icon = await node.putBlob({ data: PIXEL.toString('base64'), type: 'image/png' });
    expect(parseBlobRef(icon)).toBeTruthy();
    const page = (
      await node.setProjectPage({ project: 'Weave', title: 'Weave', subtitle: 'Build things together', body: '## Why\n\nNo platform in between.\n\n![logo](' + icon + ')', icon })
    ).page;
    expect(page).toMatchObject({ title: 'Weave', subtitle: 'Build things together', icon, description: 'Build things together', status: 'active' });
    expect(await node.blob(icon)).toEqual({ data: PIXEL.toString('base64'), type: 'image/png' });

    // Changing one field keeps the rest; an empty string removes an image.
    expect((await node.setProjectPage({ project: 'Weave', status: 'paused' })).page).toMatchObject({ title: 'Weave', icon, status: 'paused' });
    expect((await node.setProjectPage({ project: 'Weave', icon: '' })).page.icon).toBeUndefined();
    await expect(node.setProjectPage({ project: 'Weave', banner: 'https://example.com/x.png' })).rejects.toThrow(/uploaded images/);
    await expect(node.putBlob({ data: 'AAAA', type: 'text/html' })).rejects.toThrow(/images are/);
    await node.close();
  });
});

describe('images between peers', () => {
  let testnet: Testnet;
  const nodes: WeaveNode[] = [];
  beforeAll(async () => {
    testnet = await createTestnet(3);
  });
  afterAll(async () => {
    for (const node of nodes) await node.close();
    await testnet.destroy();
  });

  function person(name: string): WeaveNode {
    const dir = home();
    const node = WeaveNode.init(name, dir);
    node.config = { ...loadConfig(resolveHome(dir)), bootstrap: testnet.bootstrap };
    saveConfig(resolveHome(dir), node.config);
    nodes.push(node);
    return node;
  }

  it("fetches a project's icon from whoever has it", async () => {
    const martin = person('Martin');
    const lena = person('Lena');
    await martin.createProject({ name: 'Gameshow' });
    const icon = await martin.putBlob({ data: PIXEL.toString('base64'), type: 'image/png' });
    await martin.setProjectPage({ project: 'Gameshow', icon });
    await lena.joinSpace(await martin.invite('Gameshow'));
    await martin.goOnline();
    await lena.goOnline();
    const start = Date.now();
    while (!(await lena.project('Gameshow').catch(() => undefined))?.page.icon && Date.now() - start < 30_000) await new Promise((r) => setTimeout(r, 100));
    expect(await lena.blob(icon)).toEqual({ data: PIXEL.toString('base64'), type: 'image/png' });
    expect(lena.blobs.has(parseBlobRef(icon)!.hash)).toBe(true);
  }, 60_000);
});
