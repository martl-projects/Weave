import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { WeaveNode } from '../../src/index.ts';

/*
 * Docker for tests that run a release: test/helpers/fake-docker.mjs, told which script each image runs (by its
 * ref@digest), so a release's "container" is a script of the test's, run with only what Weave hands a container.
 * Weave starts docker with nothing of its own environment, so what the stand-in needs goes into a wrapper script.
 */

/** A digest for a test image, from a word (each version its own). */
export const testDigest = (word: string): string => `sha256:${Buffer.from(word.padEnd(32, '.')).toString('hex').slice(0, 64)}`;

/** A release's install.image, for that image name and tag. */
export const testImage = (ref: string, tag: string) => ({ ref, tag, digest: testDigest(`${ref}:${tag}`) });

/** Give a node Docker, running each image (ref@digest) as the script given for it, writing down what it did in dir. */
export function dockerRunning(node: WeaveNode, dir: string, scripts: Record<string, string>): void {
  const wrapper = join(dir, 'docker.mjs');
  const env = { FAKE_DOCKER_DIR: dir, FAKE_DOCKER_SCRIPTS: JSON.stringify(scripts) };
  writeFileSync(wrapper, `Object.assign(process.env, ${JSON.stringify(env)});
await import(${JSON.stringify(pathToFileURL(join(import.meta.dirname, 'fake-docker.mjs')).href)});
`);
  node.containerSetup = { ...node.containerSetup, docker: [process.execPath, wrapper] };
}
