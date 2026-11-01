import type { UpdateInfo } from '@weave/node/client';

/*
 * What the main process knows about new versions, as the window shows it (see update.ts and renderer/update.tsx),
 * and the one decision both sides need: may this build install a new version over itself?
 */

/** Why a build doesn't install new versions by itself: the window says so and offers the download instead. */
export type WhyNot =
  /** Run from the source, or unpacked. */
  | 'development'
  /** Managed settings: Updates=false, the company's IT rolls out versions. */
  | 'managed'
  /** The Microsoft Store build: the Store updates it. */
  | 'store'
  /** Installed for every user of the computer (the MSI): IT updates it. */
  | 'per-machine'
  /** macOS without a Developer ID signature: Squirrel.Mac refuses to replace an unsigned app. */
  | 'unsigned'
  /** Not installed in a way an updater can replace (Linux outside an AppImage, say). */
  | 'not-installed';

/** What's known of this installation, for canSelfUpdate. */
export interface UpdateFacts {
  packaged: boolean;
  platform: string;
  /** Electron's process.windowsStore: an appx from the Microsoft Store. */
  windowsStore: boolean;
  /** Windows: "Uninstall Weave.exe" lies next to Weave.exe, as the per-user (NSIS) installer leaves it; the MSI leaves none. */
  perUserInstaller: boolean;
  /** Linux: running from an AppImage ($APPIMAGE), which electron-updater can replace. */
  appImage: boolean;
  /** macOS: signed with a Developer ID (package.ts writes resources/update.json). */
  signed: boolean;
  /** Managed settings say Updates=false. */
  managedOff: boolean;
}

/** May this build download a new version and install it over itself on restart? If not, why not. */
export function canSelfUpdate(f: UpdateFacts): { ok: true } | { ok: false; why: WhyNot } {
  if (!f.packaged) return { ok: false, why: 'development' };
  if (f.managedOff) return { ok: false, why: 'managed' };
  if (f.windowsStore) return { ok: false, why: 'store' };
  if (f.platform === 'win32') return f.perUserInstaller ? { ok: true } : { ok: false, why: 'per-machine' };
  if (f.platform === 'linux') return f.appImage ? { ok: true } : { ok: false, why: 'not-installed' };
  if (f.platform === 'darwin') return f.signed ? { ok: true } : { ok: false, why: 'unsigned' };
  return { ok: false, why: 'not-installed' };
}

/**
 * Where a new version stands, for the window. idle: nothing newer (or not checked yet); checking; available: a newer
 * one this build doesn't install itself (why), or doesn't download by itself (self: the setting is off, one click gets
 * it); downloading: so far, of total; ready: downloaded and checked, restart to install; failed: why not (a file that
 * isn't what the maintainer released, say). asked: this is the answer to Help → Check for updates…, so say it either way.
 */
export interface UpdateView {
  state: 'idle' | 'checking' | 'available' | 'downloading' | 'ready' | 'failed';
  current: string;
  latest?: UpdateInfo['latest'];
  version?: string;
  why?: WhyNot;
  /** available: this build could install it, but downloads only when asked (the setting is off). */
  self?: boolean;
  done?: number;
  total?: number;
  error?: string;
  /** The setting: download new versions in the background. */
  auto?: boolean;
  asked?: boolean;
}

export type UpdateAction = 'check' | 'download' | 'restart';
