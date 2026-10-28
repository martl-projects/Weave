import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ComponentizeOptions } from '@bytecodealliance/componentize-js';

/**
 * A test's JavaScript built into a WebAssembly component of a world of Weave's WIT (componentize-js). It takes a few
 * seconds, so it's kept per machine by the source's and the WIT's hash. `bundle`: what it imports goes in with it
 * (esbuild), as packages/shipped/build.ts does for mark services.
 */
export async function buildComponent(source: string, world: 'service' | 'website' | 'board' | 'fetcher' | 'marks', features: { http?: boolean; bundle?: boolean } = {}): Promise<string> {
  const wit = join(import.meta.dirname, '..', '..', '..', 'sdk', 'wit', 'service.wit');
  const cache = join(tmpdir(), 'weave-test-components');
  mkdirSync(cache, { recursive: true });
  let input = source;
  if (features.bundle) {
    const { build } = await import('esbuild');
    const out = await build({ entryPoints: [source], bundle: true, write: false, format: 'esm', platform: 'neutral', target: 'es2022', mainFields: ['module', 'main'], logLevel: 'warning' });
    const text = out.outputFiles[0].contents;
    input = join(cache, `bundle-${createHash('sha256').update(text).digest('hex').slice(0, 16)}.js`);
    writeFileSync(input, text);
  }
  const hash = createHash('sha256').update(readFileSync(input)).update(readFileSync(wit)).update(world).update(features.http ? 'http' : '').digest('hex').slice(0, 16);
  const file = join(cache, `${world}-${hash}.wasm`);
  if (existsSync(file)) return file;
  const { componentize } = await import('@bytecodealliance/componentize-js');
  // The WIT as text (an option its typings leave out): its own file access can't open absolute Windows paths.
  const pure = world === 'board' || world === 'marks';
  const options = { sourcePath: input, witWorld: readFileSync(wit, 'utf8'), worldName: world, disableFeatures: pure ? ['all'] : features.http ? ['fetch-event'] : ['http', 'fetch-event'] };
  const built = await componentize(options as ComponentizeOptions);
  writeFileSync(file, built.component);
  return file;
}
