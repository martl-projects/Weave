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
  'backupfile.ts',
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
  'retention.ts',
  'runtime.ts',
  'scim.ts',
  'services.ts',
  'servicesettings.ts',
  'sessions.ts',
  'shipped.ts',
  'signin.ts',
  'spacestore.ts',
  'sqlitestore.ts',
  'storagenode.ts',
  'storageserver.ts',
  'untar.ts',
  'update.ts',
  'vault.ts',
  'verifiers.ts',
  'wasmworker.ts',
  'website.ts',
  'websocket.ts',
];

/** The core: what runs wherever JavaScript runs. It imports no node:* module and nothing else as a value: types only. */
const CORE = ['kernel.ts', 'membership.ts', 'content.ts', 'people.ts', 'shared.ts', 'ports.ts'];

describe('the layers of packages/node', () => {
  it('the core imports nothing of the host as a value, and no node:* module', () => {
    for (const file of CORE) {
      const text = readFileSync(join(root, file), 'utf8');
      const bad: string[] = [];
      for (const m of text.matchAll(/^import\s+(type\s+)?(\{[^}]*\}|\w+)\s+from\s+'([^']+)';/gm)) {
        const [, typeOnly, names, source] = m;
        if (source.startsWith('node:')) bad.push(source);
        if (!source.startsWith('./')) continue;
        if (typeOnly) continue;
        const target = source.slice(2);
        // The API's types and constants, avatars and themes: pure, nothing of the host in them.
        if (CORE.includes(target) || ['backend.ts', 'avatar.ts', 'theme.ts'].includes(target)) continue;
        // A braced list where every name carries its own `type` is a type import too.
        const values = names.startsWith('{') ? names.slice(1, -1).split(',').map((s) => s.trim()).filter((s) => s && !s.startsWith('type ')) : [names];
        if (values.length) bad.push(`${source} (${values.join(', ')})`);
      }
      expect(bad, `${file} reaches the host through`).toEqual([]);
    }
  });

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
