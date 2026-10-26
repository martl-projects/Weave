import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll } from 'vitest';
import { closeOpenStores, loadSpaces, WeaveNode } from '../../src/index.ts';

/**
 * People with their own nodes in temporary homes, closed and deleted after the
 * file's tests: for the regression tests from the pre-release review.
 */
export function people(prefix: string) {
  const dirs: string[] = [];
  const nodes: WeaveNode[] = [];
  afterAll(async () => {
    for (const node of nodes) await node.close();
    closeOpenStores();
    dirs.forEach((dir) => rmSync(dir, { recursive: true, force: true }));
  });
  /** A new home of our own, deleted afterwards. */
  const home = () => {
    const dir = mkdtempSync(join(tmpdir(), `weave-${prefix}-`));
    dirs.push(dir);
    return dir;
  };
  const person = (name: string) => {
    const node = WeaveNode.init(name, home());
    nodes.push(node);
    return node;
  };
  return { person, home, nodes };
}

/** Everything one node holds, handed to another. */
export const sync = (from: WeaveNode, to: WeaveNode) => from.replica.events().forEach((e) => to.replica.ingest(e));

/** A space as a node keeps it on disk, by name. */
export const stored = (node: WeaveNode, name: string) => loadSpaces(node.home).find((s) => s.name === name)!;

export const day = 24 * 3600 * 1000;
