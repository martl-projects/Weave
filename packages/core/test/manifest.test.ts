import { describe, expect, it } from 'vitest';
import { checkManifest, MANIFEST_EXAMPLE } from '../src/index.ts';

const base = { app: 'band-ab', name: 'BAND AB!', services: [{ port: 3000 }] };

describe('app settings in a manifest', () => {
  it('reads settings hosts fill in: names only', () => {
    const checked = checkManifest({ ...base, env: [{ name: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', secret: true, optional: true, hint: 'platform.deepseek.com' }] });
    expect(checked.problems).toEqual([]);
    expect(checked.manifest?.env).toEqual([{ name: 'DEEPSEEK_API_KEY', label: 'DeepSeek API key', secret: true, optional: true, hint: 'platform.deepseek.com' }]);
    expect(checkManifest(MANIFEST_EXAMPLE).problems).toEqual([]);
  });

  it('refuses values, variables that change how programs start, and odd names, all at once', () => {
    const checked = checkManifest({
      ...base,
      env: [{ name: 'API_KEY', label: 'Key', value: 'sk-123' }, { name: 'NODE_OPTIONS', label: 'x' }, { name: 'PATH' }, { name: 'WEAVE_TOKEN' }, { name: 'lower-case' }, { name: 'API_KEY', label: 'again' }],
    });
    expect(checked.manifest).toBeUndefined();
    expect(checked.problems).toHaveLength(6);
    expect(checked.problems.join('\n')).toMatch(/never holds its value/);
    expect(checked.problems.join('\n')).toMatch(/NODE_OPTIONS can't be a setting/);
    expect(checked.problems.join('\n')).toMatch(/listed twice/);
  });
});
