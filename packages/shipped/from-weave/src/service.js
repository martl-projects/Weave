// From Weave: a check next to what really comes from Weave (its people, projects, services and agents), as a Weave
// mark service Weave ships. It folds weave.official events, but only those in the Weave project, by its maintainers
// ("home", as Weave tells it): a look-alike project saying the same gets nothing. The latest per subject counts, so
// Weave's list changes without a new Weave, and everyone in the Weave project holds the whole list and its history.

const key = (s) => (s.did ? s.did : s.space ? `space:${s.space}` : s.post ? `post:${s.post}` : undefined);

export function fold(domain, settings, state, items) {
  const official = state ? JSON.parse(state) : {};
  for (const item of JSON.parse(items)) {
    if (!item.home || item.kind !== 'weave.official') continue;
    const subject = key(item.body?.subject ?? {});
    if (!subject) continue;
    if (item.body.on === false) delete official[subject];
    else official[subject] = typeof item.body.note === 'string' ? item.body.note.slice(0, 160) : '';
  }
  return JSON.stringify(official);
}

export function ask(slot, subjects, state, viewer) {
  const official = JSON.parse(state);
  return JSON.stringify(
    JSON.parse(subjects)
      .filter((s) => key(s) in official)
      .map((subject) => ({ subject, marks: [{ kind: 'check', tooltip: official[key(subject)] ? `From Weave: ${official[key(subject)]}` : 'From Weave' }] })),
  );
}
