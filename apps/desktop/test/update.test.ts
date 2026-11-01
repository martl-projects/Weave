import { describe, expect, it } from 'vitest';
import { canSelfUpdate, type UpdateFacts, type WhyNot } from '../src/updatestate.ts';
import { PACKAGES } from '@weave/texts';

/** A per-user Windows installation, signed or not: the build that updates itself. */
const nsis: UpdateFacts = { packaged: true, platform: 'win32', windowsStore: false, perUserInstaller: true, appImage: false, signed: false, managedOff: false };

describe('which builds install new versions over themselves', () => {
  it('Windows: the per-user installer does, unsigned or signed; the MSI (per machine) and the Store build never', () => {
    expect(canSelfUpdate(nsis)).toEqual({ ok: true });
    expect(canSelfUpdate({ ...nsis, signed: true })).toEqual({ ok: true });
    expect(canSelfUpdate({ ...nsis, perUserInstaller: false })).toEqual({ ok: false, why: 'per-machine' });
    expect(canSelfUpdate({ ...nsis, windowsStore: true })).toEqual({ ok: false, why: 'store' });
  });

  it('Linux: only from an AppImage', () => {
    expect(canSelfUpdate({ ...nsis, platform: 'linux', perUserInstaller: false, appImage: true })).toEqual({ ok: true });
    expect(canSelfUpdate({ ...nsis, platform: 'linux', perUserInstaller: false })).toEqual({ ok: false, why: 'not-installed' });
  });

  it('macOS: only once signed with a Developer ID (Squirrel.Mac refuses an unsigned app)', () => {
    expect(canSelfUpdate({ ...nsis, platform: 'darwin', perUserInstaller: false })).toEqual({ ok: false, why: 'unsigned' });
    expect(canSelfUpdate({ ...nsis, platform: 'darwin', perUserInstaller: false, signed: true })).toEqual({ ok: true });
  });

  it('never from the source, and never when managed settings say Updates=false, whatever the build', () => {
    expect(canSelfUpdate({ ...nsis, packaged: false })).toEqual({ ok: false, why: 'development' });
    expect(canSelfUpdate({ ...nsis, managedOff: true })).toEqual({ ok: false, why: 'managed' });
    expect(canSelfUpdate({ ...nsis, platform: 'linux', appImage: true, managedOff: true })).toEqual({ ok: false, why: 'managed' });
  });

  it('has words for every reason, in every language the window shows (update.why.*)', () => {
    const reasons: WhyNot[] = ['development', 'managed', 'store', 'per-machine', 'unsigned', 'not-installed'];
    for (const pkg of Object.values(PACKAGES)) for (const why of reasons) expect(pkg.names[`update.why.${why}`]?.length ?? 0, `${pkg.lang} ${why}`).toBeGreaterThan(20);
  });
});
