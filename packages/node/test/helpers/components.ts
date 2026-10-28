import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComponentizeOptions } from '@bytecodealliance/componentize-js';

/**
 * A test's JavaScript built into a WebAssembly component of a world of Weave's WIT (componentize-js). It takes a few
 * seconds, so it's kept per machine by the source's and the WIT's hash.
 */
export async function buildComponent(source: string, world: 'service' | 'website' | 'board', features: { http?: boolean } = {}): Promise<string> {
  const wit = join(import.meta.dirname, '..', '..', '..', 'sdk', 'wit', 'service.wit');
  const hash = createHash('sha256').update(readFileSync(source)).update(readFileSync(wit)).update(world).update(features.http ? 'http' : '').digest('hex').slice(0, 16);
  const cache = join(tmpdir(), 'weave-test-components');
  const file = join(cache, `${world}-${hash}.wasm`);
  if (existsSync(file)) return file;
  const { componentize } = await import('@bytecodealliance/componentize-js');
  // The WIT as text (an option its typings leave out): its own file access can't open absolute Windows paths.
  const options = { sourcePath: source, witWorld: readFileSync(wit, 'utf8'), worldName: world, disableFeatures: world === 'board' ? ['all'] : features.http ? ['fetch-event'] : ['http', 'fetch-event'] };
  const built = await componentize(options as ComponentizeOptions);
  mkdirSync(cache, { recursive: true });
  writeFileSync(file, built.component);
  return file;
}
