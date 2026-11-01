import { useEffect, useState, type MouseEvent } from 'react';
import { createPortal } from 'react-dom';
import type { BadgeInfo } from '@weave/node/client';
import { api, onItem, useBlobUrl } from './lib.ts';
import { AsyncButton, attempt, Modal } from './ui.tsx';
import { t, useTexts } from './texts.tsx';

/*
 * Badges on people's hubs: lasting recognition from a project, like
 * "Super Supporter #7 of 20". Each shows as the series' picture, or its symbol
 * when it has none. Only valid badges show: a series whose issuer cheated
 * (more than its limit, a number twice) shows none of its badges, and neither
 * does one claiming a project its issuer doesn't maintain (the node leaves it out).
 * Next to names they show as marks (marks.tsx), from the Badges mark service.
 */

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

/** "Super Supporter #7 of 20 · p/Weave, from Lena" and the note. */
export const badgeTitle = (b: BadgeInfo) =>
  `${badgeNumber(b)}${b.series.project ? ` · ${b.series.project.name}${b.series.project.checked === false ? t('badge.not.checked') : ''}` : ''}${t('badge.from', { issuer: b.issuer.name ?? t('badge.its.issuer') })}${b.note ? `\n“${b.note}”` : ''}`;

/** "Super Supporter #7 of 20", or "#7" without a limit. */
const badgeNumber = (b: BadgeInfo) => (b.series.limit ? t('badge.number.of', { name: b.series.name, n: b.n, limit: b.series.limit }) : t('badge.number', { name: b.series.name, n: b.n }));

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
export function BadgeCard({ badge, onClose }: { badge: BadgeInfo; onClose(): void }) {
  const { t } = useTexts();
  const issuer = badge.issuer.name ?? t('badge.its.issuer');
  const personal = badge.personal;
  const picture = useBlobUrl(badge.series.image);
  const publish = (on: boolean) => attempt(() => api('publishBadgeNote', { badge: badge.id, on }), t(on ? 'badge.published' : 'badge.taken.back'));
  return (
    <Modal title={`${badge.series.symbol ? `${badge.series.symbol} ` : ''}${badgeNumber(badge)}`} onClose={onClose}>
      {picture && <img className="badge-picture" src={picture} alt={badge.series.name} width={128} height={128} />}
      <p className="small muted">
        {t('badge.card.line', { number: badge.series.limit ? t('badge.number.plain.of', { n: badge.n, limit: badge.series.limit }) : t('badge.number.plain', { n: badge.n }), project: badge.series.project ? ` · ${badge.series.project.name}` : '', issuer, holder: badge.holder.name ?? t('word.someone.lc') })}
      </p>
      {badge.note && <p>“{badge.note}”</p>}
      {personal && (
        <fieldset>
          <legend>{t('badge.personal.note', { issuer })}</legend>
          {personal.text !== undefined ? <p style={{ whiteSpace: 'pre-wrap' }}>{personal.text}</p> : <p className="small muted">{t('badge.sealed', { issuer })}</p>}
          {personal.text !== undefined && (
            <p className="small muted">{personal.published ? t('badge.public.words', { issuer }) : t(personal.mayPublish ? 'badge.only.you.and.issuer' : 'badge.only.you.and.holder', { issuer })}</p>
          )}
          {personal.mayPublish && <AsyncButton onClick={() => publish(!personal.published)}>{t(personal.published ? 'badge.make.private' : 'badge.publish')}</AsyncButton>}
        </fieldset>
      )}
    </Modal>
  );
}

/** Every badge someone holds, on their hub: big, with what each is and who gave it; a click shows it in full. */
export function HubBadges({ did, me, name }: { did: string; me: boolean; name: string }) {
  const { t } = useTexts();
  const badges = useHeldBadges(did);
  if (!badges.length) return null;
  return (
    <section className="space-box">
      <h3>{me ? t('badges.mine') : t('badges.of', { name })}</h3>
      <div className="hub-badges">
        {badges.map((b) => (
          <div className="hub-badge" key={b.id} title={badgeTitle(b)}>
            <BadgeMark badge={b} size={40} />
            <div>
              <b>{badgeNumber(b)}</b>
              <div className="small muted">
                {t('badge.from.plain', { issuer: b.issuer.name ?? t('badge.its.issuer') })}
                {b.series.project ? ` · ${b.series.project.name}` : ''}
                {me && b.personal && !b.personal.published ? t('badge.personal.for.you') : ''}
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
