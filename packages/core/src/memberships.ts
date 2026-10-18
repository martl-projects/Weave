import type { Json } from './bytes.ts';
import { boxTo, openBox, type Box } from './crypto.ts';
import type { EventFields, SigningIdentity, WeaveEvent } from './events.ts';
import { isDid, type Did } from './keys.ts';

/*
 * Memberships, Patreon-style. A creator offers tiers; a tier is a group the
 * creator founded, so its members get the group's chat and every project the
 * group is invited into. Memberships buy access, never votes.
 *
 *   weave.tier                  {tier, name, price, currency, description, benefits, position, open}
 *                               public, by the creator: the offer, shown on their space
 *   weave.membership.request    {box}   public, boxed to the creator: {tier, note, entry}
 *   weave.membership            {member, until}   sealed in the tier group, by its founder:
 *                               admits (or renews) a member until a date
 *   weave.membership.handled    {request}   sealed to the creator: a request answered (granted or declined)
 *   weave.membership.pending    {creator, tier}   sealed to the supporter: lets their node accept the tier's keys
 *
 * When a grant runs out, the creator's node removes the member and rotates the
 * tier key; a later grant lets them back in.
 */
export const KIND_TIER = 'weave.tier';
export const KIND_MEMBERSHIP = 'weave.membership';
export const KIND_MEMBERSHIP_REQUEST = 'weave.membership.request';
export const KIND_MEMBERSHIP_HANDLED = 'weave.membership.handled';
export const KIND_MEMBERSHIP_PENDING = 'weave.membership.pending';

export interface Tier {
  /** The tier's group id. */
  id: string;
  creator: Did;
  name: string;
  /** Price per month in the currency's minor unit (cents), 0 for free. */
  price: number;
  currency: string;
  description: string;
  benefits: string[];
  position: number;
  /** Accepting new members. */
  open: boolean;
  time: string;
}

const str = (value: unknown, max: number): string => (typeof value === 'string' ? value.slice(0, max) : '');

/** A creator's tiers from their public tier events, the latest per tier winning; withdrawn ones (open: false and hidden) are dropped. */
export function tiersOf(events: WeaveEvent[]): Tier[] {
  const latest = new Map<string, Tier & { hidden: boolean }>();
  for (const event of events) {
    if (event.kind !== KIND_TIER) continue;
    const body = (event.body ?? {}) as Record<string, unknown>;
    const id = str(body.tier, 100);
    const name = str(body.name, 40);
    if (!id || !name) continue;
    const price = Number(body.price);
    latest.set(id, {
      id,
      creator: event.author,
      name,
      price: Number.isInteger(price) && price >= 0 ? price : 0,
      currency: str(body.currency, 3).toUpperCase() || 'EUR',
      description: str(body.description, 2000),
      benefits: Array.isArray(body.benefits) ? body.benefits.filter((b): b is string => typeof b === 'string').map((b) => b.slice(0, 120)).slice(0, 10) : [],
      position: Number.isFinite(Number(body.position)) ? Number(body.position) : 0,
      open: body.open !== false,
      hidden: body.hidden === true,
      time: event.time,
    });
  }
  return [...latest.values()]
    .filter((t) => !t.hidden)
    .map(({ hidden: _hidden, ...tier }) => tier)
    .sort((a, b) => a.position - b.position || a.price - b.price);
}

export interface MembershipRequest {
  tier: string;
  note: string;
  /** Where the supporter's node can be reached. */
  entry: { topics: string[]; bootstrap: Array<{ host: string; port: number }> };
}

/** A request to join a tier, readable only by the creator. */
export function membershipRequest(creator: Did, request: MembershipRequest): EventFields {
  return { kind: KIND_MEMBERSHIP_REQUEST, body: { box: boxTo(creator, request as unknown as Json) } };
}

/** If a request event is addressed to `me`, what it asks for. */
export function openMembershipRequest(event: WeaveEvent, me: SigningIdentity): MembershipRequest | undefined {
  const box = (event.body as { box?: Box } | null)?.box;
  if (event.kind !== KIND_MEMBERSHIP_REQUEST || !box) return undefined;
  try {
    const opened = openBox(me.keys.secretKey, me.keys.publicKey, box) as unknown as MembershipRequest;
    return typeof opened?.tier === 'string' ? { tier: opened.tier, note: str(opened.note, 500), entry: opened.entry ?? { topics: [], bootstrap: [] } } : undefined;
  } catch {
    return undefined;
  }
}

/** A grant's end: `months` calendar months after `from` (or after the current end, when renewing early). */
export function grantUntil(from: Date, months: number, current?: string): string {
  const start = current && Date.parse(current) > from.getTime() ? new Date(current) : from;
  const until = new Date(start);
  until.setUTCMonth(until.getUTCMonth() + months);
  return until.toISOString();
}

export const isActive = (until: string | undefined, now = new Date().toISOString()): boolean => !!until && until > now;

export const isMembershipBody = (body: unknown): body is { member: Did; until: string } =>
  !!body && typeof body === 'object' && isDid((body as { member?: unknown }).member) && typeof (body as { until?: unknown }).until === 'string';
