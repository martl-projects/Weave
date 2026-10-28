// Badges: the badges of badge series next to people's names, as a Weave mark service. It folds the public badge
// events with Weave's own check (badgesOf: limits, numbers given twice, transfers), and answers up to three valid
// badges per person: the series' picture, else its symbol, else its name; a click opens the badge (ref).
// In a project's domain, that project's own badges come first.

import { badgesOf } from '../../../core/src/badges.ts';

const SHOWN = 3;

/** The badge events so far (as records badgesOf reads), and who holds which valid badge. */
export function fold(domain, settings, state, items) {
  const before = state ? JSON.parse(state) : { events: [] };
  const events = before.events;
  for (const item of JSON.parse(items)) events.push({ id: item.id, kind: item.kind, body: item.body, author: item.author, signer: item.signer ?? item.author, seq: item.seq ?? 0, time: item.time, authorName: item.authorName });
  const names = new Map(events.filter((e) => e.authorName).map((e) => [e.author, e.authorName]));
  const { series, badges } = badgesOf(events);
  const byId = new Map(series.map((s) => [s.id, s]));
  const held = {};
  for (const b of badges) {
    const s = byId.get(b.series);
    if (b.invalid || !s || s.broken) continue;
    (held[b.holder] ??= []).push({
      id: b.id,
      name: s.name,
      symbol: s.symbol,
      image: s.image,
      project: s.project?.id,
      tooltip: `${s.name} #${b.n}${s.limit ? ` of ${s.limit}` : ''}, from ${names.get(s.issuer) ?? 'its issuer'}${b.note ? `: “${b.note}”` : ''}`,
      time: b.time,
    });
  }
  const own = JSON.parse(domain);
  return JSON.stringify({ events, held, project: own.kind === 'project' ? own.id : undefined });
}

export function ask(slot, subjects, state, viewer) {
  const { held, project } = JSON.parse(state);
  return JSON.stringify(
    JSON.parse(subjects)
      .filter((s) => s.did)
      .map((subject) => {
        const all = [...(held[subject.did] ?? [])].sort((a, b) => Number(b.project === project) - Number(a.project === project) || a.time.localeCompare(b.time));
        return { subject, marks: all.slice(0, SHOWN).map(mark) };
      }),
  );
}

function mark(b) {
  const about = { tooltip: b.tooltip, ref: b.id };
  if (b.image) return { kind: 'image', image: b.image, ...(b.symbol ? { symbol: b.symbol } : {}), ...about };
  if (b.symbol) return { kind: 'symbol', symbol: b.symbol, ...about };
  return { kind: 'label', text: b.name.slice(0, 16), ...about };
}
