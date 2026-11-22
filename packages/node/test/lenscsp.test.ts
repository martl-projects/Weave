import { describe, expect, it } from 'vitest';
import { LENS_CSP, lensCsp } from '../src/lenscsp.ts';

describe('a lens view’s CSP', () => {
  it('reaches nothing without hosts', () => {
    expect(LENS_CSP).toContain("connect-src 'none'");
    expect(LENS_CSP).toContain("img-src 'self' data: blob:;");
    expect(lensCsp([])).toBe(LENS_CSP);
  });

  it('reaches exactly the hosts allowed, over HTTPS, and keeps its sandbox', () => {
    const csp = lensCsp(['api.open-meteo.com', '*.tile.openstreetmap.org']);
    expect(csp).toContain('connect-src https://api.open-meteo.com https://*.tile.openstreetmap.org;');
    expect(csp).toContain("img-src 'self' data: blob: https://api.open-meteo.com https://*.tile.openstreetmap.org;");
    expect(csp).toMatch(/^sandbox allow-scripts; default-src 'none';/);
    expect(csp).toContain("form-action 'none'");
  });

  it('leaves out anything that isn’t a host name', () => {
    const csp = lensCsp(['evil.example; script-src *', "'unsafe-eval'", 'http://x.example', 'ok.example']);
    expect(csp).toContain('connect-src https://ok.example;');
    expect(csp).not.toContain('evil');
    expect(csp).not.toContain('unsafe-eval');
  });
});
