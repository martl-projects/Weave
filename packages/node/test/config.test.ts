import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, expect, it } from 'vitest';
import { loadConfig, resolveHome, saveConfig } from '../src/index.ts';

const dirs: string[] = [];
afterEach(() => dirs.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

it("keeps what this build doesn't know when it saves the config", () => {
  const dir = mkdtempSync(join(tmpdir(), 'weave-config-'));
  dirs.push(dir);
  const home = resolveHome(dir);
  writeFileSync(home.config, JSON.stringify({ topics: ['friends'], later: { space: 'abc' }, standby: 'yes' }));
  const config = loadConfig(home);
  expect(config.topics).toEqual(['friends']);
  expect(config.standby).toBeUndefined(); // known and wrong: dropped
  saveConfig(home, { ...config, archive: true });
  expect(JSON.parse(readFileSync(home.config, 'utf8'))).toMatchObject({ topics: ['friends'], archive: true, later: { space: 'abc' } });
});
