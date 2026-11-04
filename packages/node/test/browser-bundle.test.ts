import { build } from 'esbuild';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The node's core runs wherever JavaScript runs (docs/node-split.md, step 9):
 * the kernel, membership, content and people bundle for a browser, with
 * nothing from node:* and nothing of the host behind them. esbuild resolves
 * every import for real, so a stray value import of node.ts or a host module
 * fails this test, not a user.
 */

const src = join(import.meta.dirname, '..', 'src');
const CORE = ['kernel.ts', 'membership.ts', 'content.ts', 'people.ts'];

describe('the core bundles for a browser', () => {
  it('resolves every import without Node', async () => {
    const result = await build({
      entryPoints: CORE.map((f) => join(src, f)),
      bundle: true,
      platform: 'browser',
      format: 'esm',
      write: false,
      outdir: 'out',
      logLevel: 'silent',
      metafile: true,
    }).catch((error: { errors?: Array<{ text: string; location?: { file: string; line: number } | null }> }) => {
      throw new Error((error.errors ?? []).map((e) => `${e.location?.file ?? '?'}:${e.location?.line ?? 0} ${e.text}`).join('\n') || String(error));
    });
    expect(result.errors).toEqual([]);
    const inputs = Object.keys(result.metafile.inputs).map((p) => p.replaceAll('\\', '/'));
    const host = inputs.filter((p) => /packages\/node\/src\/(node|vault|spacestore|home|sqlitestore|keystore|blobstore|config|claudecode|harnesses|runtime|live|signin|scim|console|mail|machine|registry|devicecode|remote|websocket|update|appinstall|artifacts|fetchers|keyvaults|clientapps|verifiers|lock|services|website|lenses|marks|hints|gumroad)\.ts$/.test(p));
    expect(host, 'host modules pulled into the browser bundle').toEqual([]);
    expect(inputs.some((p) => p.includes('hyperswarm') || p.includes('hyperdht')), 'the DHT in the browser bundle').toBe(false);
  }, 60_000);
});
