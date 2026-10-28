import type { Json } from './bytes.ts';
import type { Entry } from './collab.ts';
import type { Box } from './crypto.ts';
import { isDid, type Did } from './keys.ts';
import { isSettingName } from './rooms.ts';

/*
 * A service's settings kept in a space by its maintainers: what the space's service needs (a region, a bucket, an API
 * key, a sign-in), set and changed by any maintainer rather than only by the person who runs it. Wherever the service
 * runs, its node reads them here: nothing to hand over when it moves.
 *
 *   weave.service.setting  {service, name, value}         a plain value: the space's members can read it
 *   weave.service.setting  {service, name, box}           a secret, boxed to the service's own key: only the node
 *                                                          running it can open it, the maintainers set it blind
 *   weave.service.setting  {service, name, box, oauth}    a sign-in (an OAuth grant), boxed the same way
 *   weave.service.setting  {service, name}                removed
 *
 * Maintainers only; the latest per service and name counts. Who changed what, and when, stays visible; a secret's
 * value never does.
 */
export const KIND_SERVICE_SETTING = 'weave.service.setting';

/** A plain setting's longest value. */
export const SETTING_VALUE_MAX = 4096;

export interface SpaceServiceSetting {
  /** The service's key. */
  service: Did;
  name: string;
  /** Set blind: its value is boxed to the service. */
  secret: boolean;
  /** A sign-in rather than a typed secret. */
  oauth?: true;
  /** A plain setting's value. */
  value?: string;
  /** A secret's box (only the service's key opens it). */
  box?: Box;
  /** The maintainer who set it, when, and the event. */
  by: Did;
  time: string;
  id: string;
}

const field = (body: Json, key: string): unknown => (body && typeof body === 'object' && !Array.isArray(body) ? body[key] : undefined);

export const isBox = (value: unknown): value is Box => {
  const b = value as Record<string, unknown> | null;
  return !!b && typeof b === 'object' && !Array.isArray(b) && typeof b.epk === 'string' && typeof b.nonce === 'string' && typeof b.ct === 'string' && b.ct.length <= 64_000;
};

/** A space's service settings (of one service, or of all): the latest from its maintainers per service and name. */
export function serviceSettingsOf(entries: Entry[], maintainers: Set<Did>, service?: Did): SpaceServiceSetting[] {
  const out = new Map<string, SpaceServiceSetting>();
  const sorted = entries.filter((e) => e.kind === KIND_SERVICE_SETTING && maintainers.has(e.event.author)).sort((a, b) => a.event.time.localeCompare(b.event.time) || a.event.seq - b.event.seq);
  for (const e of sorted) {
    const of = field(e.body, 'service');
    const name = field(e.body, 'name');
    if (!isDid(of) || (service && of !== service) || typeof name !== 'string' || !isSettingName(name)) continue;
    const key = `${of} ${name}`;
    const value = field(e.body, 'value');
    const box = field(e.body, 'box');
    const common = { service: of, name, by: e.event.author, time: e.event.time, id: e.id };
    if (isBox(box)) out.set(key, { ...common, secret: true, ...(field(e.body, 'oauth') === true ? { oauth: true as const } : {}), box });
    else if (typeof value === 'string' && value.length <= SETTING_VALUE_MAX) out.set(key, { ...common, secret: false, value });
    else out.delete(key);
  }
  return [...out.values()];
}
