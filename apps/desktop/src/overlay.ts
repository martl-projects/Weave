import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/*
 * When the overlay (the side panel beside Claude Code) comes up by itself, on this device: once for someone new, with
 * a word on what it is, and after that only while it's switched on (Show the overlay, on the Sessions page). Opened
 * by hand (the tray, View) it always comes. Kept in the home, beside the node's config: each device has its own.
 */

export interface OverlaySetting {
  /** The overlay has been shown here once, with its introduction. */
  introduced: boolean;
  /** Show the overlay: it comes up when a session or a mention does. */
  on: boolean;
}

const file = (dir: string) => join(dir, 'overlay.json');

export function loadOverlay(dir: string): OverlaySetting {
  try {
    const stored = JSON.parse(readFileSync(file(dir), 'utf8')) as Partial<OverlaySetting>;
    return { introduced: stored.introduced === true, on: stored.on === true };
  } catch {
    return { introduced: false, on: false };
  }
}

export function saveOverlay(dir: string, setting: OverlaySetting): void {
  try {
    writeFileSync(file(dir), JSON.stringify(setting));
  } catch (error) {
    console.error('weave: overlay setting not saved:', (error as Error).message);
  }
}

/** Does the overlay come up now? By hand always; by itself while switched on, or the first time, to introduce itself. */
export function overlayOpens(setting: OverlaySetting, byHand: boolean): boolean {
  return byHand || setting.on || !setting.introduced;
}
