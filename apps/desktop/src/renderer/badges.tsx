import { useEffect, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BadgeInfo } from '@weave/node/client';
import { api, onItem, useBlobUrl } from './lib.ts';
import { AsyncButton, attempt, Modal } from './ui.tsx';

/*
 * Badges next to people's names: lasting recognition from a project, like
 * "Super Supporter #7 of 20". Each shows as the series' picture, or its symbol
 * when it has none. Only valid badges show: a series whose issuer cheated
 * (more than its limit, a number twice) shows none of its badges.
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
  `${b.series.name} #${b.n}${b.series.limit ? ` of ${b.series.limit}` : ''}${b.series.project ? ` · ${b.series.project.name}` : ''}, from ${b.issuer.name ?? 'its issuer'}${b.note ? `\n“${b.note}”` : ''}`;

/** One badge: its picture, else its symbol, else its initial. A click shows it in full. */
export function BadgeMark({ badge, size = 16 }: { badge: BadgeInfo; size?: number }) {
  const url = useBlobUrl(badge.series.image);
  const [open, setOpen] = useState(false);
  const title = badgeTitle(badge);
  const show = (e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setOpen(true);
  };
  const mark = url ? (
    <img className="badge-mark" src={url} alt={badge.series.name} title={title} width={size} height={size} onClick={show} />
  ) : (
    <span className="badge-mark badge-mark-text" title={title} style={{ fontSize: size * 0.8, minWidth: size, height: size }} onClick={show}>
      {badge.series.symbol || badge.series.name.slice(0, 1).toUpperCase()}
    </span>
  );
  return (
    <>
      {mark}
      {/* In a portal: a badge often sits in a link or a clickable row. */}
      {open && createPortal(<BadgeCard badge={badge} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}

/**
 * A badge in full: what it is, who gave it and why, and its personal note. That note is sealed to the one
 * it was given to (and its issuer) until they publish it; the issuer's signed hash proves the words are theirs.
 */
function BadgeCard({ badge, onClose }: { badge: BadgeInfo; onClose(): void }) {
  const issuer = badge.issuer.name ?? 'its issuer';
  const personal = badge.personal;
  const picture = useBlobUrl(badge.series.image);
  const publish = (on: boolean) => attempt(() => api('publishBadgeNote', { badge: badge.id, on }), on ? 'Published: everyone can read it now' : 'Taken back');
  return (
    <Modal title={`${badge.series.symbol ? `${badge.series.symbol} ` : ''}${badge.series.name} #${badge.n}`} onClose={onClose}>
      {picture && <img className="badge-picture" src={picture} alt={badge.series.name} width={128} height={128} />}
      <p className="small muted">
        {badge.series.limit ? `Number ${badge.n} of ${badge.series.limit}` : `Number ${badge.n}`}
        {badge.series.project ? ` · ${badge.series.project.name}` : ''}, from {issuer}, held by {badge.holder.name ?? 'someone'}.
      </p>
      {badge.note && <p>“{badge.note}”</p>}
      {personal && (
        <fieldset>
          <legend>Personal note from {issuer}</legend>
          {personal.text !== undefined ? <p style={{ whiteSpace: 'pre-wrap' }}>{personal.text}</p> : <p className="small muted">Sealed: only the one it was given to and {issuer} can read it.</p>}
          {personal.text !== undefined && (
            <p className="small muted">{personal.published ? `Public, in ${issuer}'s own words: anyone can check them against what ${issuer} signed.` : `Only you${personal.mayPublish ? ` and ${issuer}` : ` and the one it was given to`} can read it${personal.mayPublish ? ', until you publish it' : ''}.`}</p>
          )}
          {personal.mayPublish && <AsyncButton onClick={() => publish(!personal.published)}>{personal.published ? 'Make it private again' : 'Publish'}</AsyncButton>}
        </fieldset>
      )}
    </Modal>
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
