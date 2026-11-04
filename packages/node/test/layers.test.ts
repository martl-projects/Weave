import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * The layers of packages/node (docs/node-split.md): which files may touch Node
 * itself. `core/` is the node's logic and imports no `node:*` module and nothing
 * from `host/`, so it can run wherever JavaScript runs; `host/` and the files
 * listed here are the adapters that may. A new file that needs Node goes on the
 * list on purpose, in the same commit.
 */

const root = join(import.meta.dirname, '..', 'src');

/** Every .ts file under src, as a path relative to it with forward slashes. */
function sources(dir = root): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...sources(path));
    else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) out.push(relative(root, path).replaceAll('\\', '/'));
  }
  return out.sort();
}

const importsOf = (file: string): string[] => [...readFileSync(join(root, file), 'utf8').matchAll(/from '([^']+)'/g)].map((m) => m[1]);

/** The files that import node:* today. Shrinks as the split goes on; never grows by accident. */
const MAY_USE_NODE = [
  'api.ts',
  'appapi.ts',
  'appinstall.ts',
  'applaunch.ts',
  'artifacts.ts',
  'auditsinks.ts',
  'blobstore.ts',
  'claudecode.ts',
  'client.ts',
  'clientapps.ts',
  'companies.ts',
  'console.ts',
  'daemon.ts',
  'devices.ts',
  'fetchers.ts',
  'filestore.ts',
  'gumroad.ts',
  'harnesses.ts',
  'holding.ts',
  'home.ts',
  'homekey.ts',
  'keyproviders.ts',
  'keystore.ts',
  'keyvaults.ts',
  'lenses.ts',
  'links.ts',
  'live.ts',
  'lock.ts',
  'machine.ts',
  'mail.ts',
  'managed.ts',
  'marks.ts',
  'mcpb.ts',
  'node.ts',
  'payments.ts',
  'register.ts',
  'registry.ts',
  'remote.ts',
  'runtime.ts',
  'scim.ts',
  'services.ts',
  'servicesettings.ts',
  'shipped.ts',
  'signin.ts',
  'spacestore.ts',
  'sqlitestore.ts',
  'untar.ts',
  'update.ts',
  'vault.ts',
  'verifiers.ts',
  'wasmworker.ts',
  'website.ts',
  'websocket.ts',
];

describe('the layers of packages/node', () => {
  it('only the files on the list import node:* modules', () => {
    const using = sources().filter((f) => importsOf(f).some((s) => s.startsWith('node:')));
    expect(using).toEqual([...MAY_USE_NODE].sort());
  });

  it('core/ imports no node:* module and nothing from host/', () => {
    for (const file of sources().filter((f) => f.startsWith('core/'))) {
      const bad = importsOf(file).filter((s) => s.startsWith('node:') || s.includes('/host/') || s.startsWith('../host'));
      expect(bad, `${file} imports ${bad.join(', ')}`).toEqual([]);
    }
  });
});
