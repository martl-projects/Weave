import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parsePack } from '../src/index.ts';

describe('setup packs', () => {
  it('are steps Weave knows how to do and to tell are done: GitHub for a project, say', () => {
    const { pack, problem } = parsePack(JSON.parse(readFileSync(join(import.meta.dirname, '..', '..', 'shipped', 'packs', 'github-project.json'), 'utf8')));
    expect(problem).toBeUndefined();
    expect(pack?.steps.map((s) => [s.kind, 'service' in s ? s.service : s.keyvault])).toEqual([
      ['keyvault', 'github-keyvault'],
      ['app', 'github-keyvault'],
      ['install', 'github-keyvault'],
      ['service', 'github-releases'],
      ['service', 'github-access'],
      ['hand', 'github-keyvault'],
    ]);
  });

  it('refuses a step Weave knows nothing of, and one without steps', () => {
    expect(parsePack({ pack: 'x', title: 'X', steps: [{ run: 'rm -rf /' }] }).problem).toMatch(/steps\[0\] is one of/);
    expect(parsePack({ pack: 'x', title: 'X', steps: [] }).problem).toMatch(/has steps/);
    expect(parsePack({ title: 'X', steps: [{ service: 'a' }] }).problem).toMatch(/a name/);
  });
});
