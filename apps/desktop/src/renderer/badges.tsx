import { useEffect, useState } from 'react';
import type { BadgeInfo } from '@weave/node/client';
import { api, onItem, useBlobUrl } from './lib.ts';

/*
 * Badges next to people's names: lasting recognition from a project, like
 * "Super Supporter #7 of 20". Each shows as the series' picture, or its symbol
 * when it has none. Only valid badges show: a series whose issuer cheated
 * (more than its limit, a number twice) shows none of its badges, and neither
 * does one claiming a project its issuer doesn't maintain (the node leaves it out).
 */

/** How many badges show next to a name; the rest are on the person's hub. */
const SHOWN = 3;

const held = new Map<string, Promise<BadgeInfo[]>>();

// A badge given, passed on or a series changed: look again.
onItem((item) => {
  if (item.kind.startsWith('weave.badge')) held.clear();
});

function badgesOf(did: string): Promise<BadgeInfo[]> {
  let badges = held.get(did);
  if (!badges) {
    badges = api<BadgeInfo[]>('badges', did).then((all) => all.filter((b) => !b.invalid && !b.series.broken));
    badges.catch(() => held.delete(did));
    held.set(did, badges);
  }
  return badges;
}

function useHeldBadges(did: string): BadgeInfo[] {
  const [badges, setBadges] = useState<BadgeInfo[]>([]);
  useEffect(() => {
    let alive = true;
    const load = () => badgesOf(did).then((b) => alive && setBadges(b), () => {});
    load();
    const off = onItem((item) => item.kind.startsWith('weave.badge') && load());
    return () => {
      alive = false;
      off();
    };
  }, [did]);
  return badges;
}

export const badgeTitle = (b: BadgeInfo) =>
  `${b.series.name} #${b.n}${b.series.limit ? ` of ${b.series.limit}` : ''}${b.series.project ? ` · ${b.series.project.name}${b.series.project.checked === false ? ' (not checked: you are not in it)' : ''}` : ''}, from ${b.issuer.name ?? 'its issuer'}${b.note ? `\n“${b.note}”` : ''}`;

/** One badge: its picture, else its symbol, else its initial. */
export function BadgeMark({ badge, size = 16 }: { badge: BadgeInfo; size?: number }) {
  const url = useBlobUrl(badge.series.image);
  const title = badgeTitle(badge);
  if (url) return <img className="badge-mark" src={url} alt={badge.series.name} title={title} width={size} height={size} />;
  return (
    <span className="badge-mark badge-mark-text" title={title} style={{ fontSize: size * 0.8, minWidth: size, height: size }}>
      {badge.series.symbol || badge.series.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

/** The badges someone holds, next to their name; in a project, its own badges come first. */
export function NameBadges({ did, project, size }: { did: string; project?: string; size?: number }) {
  const badges = useHeldBadges(did);
  if (!badges.length) return null;
  const sorted = project ? [...badges].sort((a, b) => Number(b.series.project?.id === project) - Number(a.series.project?.id === project)) : badges;
  return (
    <span className="name-badges">
      {sorted.slice(0, SHOWN).map((b) => (
        <BadgeMark key={b.id} badge={b} size={size} />
      ))}
    </span>
  );
}
