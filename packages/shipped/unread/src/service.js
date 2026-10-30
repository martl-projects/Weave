// Unread: how many notices wait in a place, until you open it on any of your devices, as a Weave hint service Weave
// ships. It folds weave.notice (what your node works out is for you: a message to you, a new post you follow) and
// weave.seen (what you opened, sealed to you), and its rules (its settings) say what counts: without one, messages
// to you do.

const MAX = 2000;

/** The rule for a notice: the most specific one that matches (a person over a place, a board over its space); a later one wins a tie. */
function ruleFor(notice, rules) {
  let best;
  let score = -1;
  for (const rule of rules) {
    if ((rule.who && rule.who !== notice.from) || (rule.space && rule.space !== notice.space) || (rule.board && rule.board !== notice.board)) continue;
    const s = (rule.who ? 4 : 0) + (rule.space ? 2 : 0) + (rule.board ? 1 : 0);
    if (s >= score) [best, score] = [rule, s];
  }
  return best;
}

/** When you last opened what shows this notice: the whole place, its channel, its board, or its post. */
function seenAt(state, n) {
  const at = [state.all ?? '', state.seen[`${n.space}|all`] ?? ''];
  if (n.post) at.push(state.seen[`${n.space}|post|${n.post}`] ?? '');
  else at.push(state.seen[`${n.space}|channel|${n.channel ?? 'general'}`] ?? '');
  if (n.board) at.push(state.seen[`${n.space}|board|${n.board}`] ?? '');
  return at.reduce((a, b) => (a > b ? a : b));
}

export function fold(domain, settings, state, items) {
  const s = state ? JSON.parse(state) : { seen: {}, notices: [] };
  const rules = Array.isArray(JSON.parse(settings).rules) ? JSON.parse(settings).rules : [];
  for (const item of JSON.parse(items)) {
    const b = item.body ?? {};
    if (item.kind === 'weave.seen') {
      if (b.all === true) s.all = b.time > (s.all ?? '') ? b.time : s.all;
      else if (typeof b.space === 'string') {
        const key = b.view === 'all' ? `${b.space}|all` : `${b.space}|${b.view}|${b.name}`;
        if (b.time > (s.seen[key] ?? '')) s.seen[key] = b.time;
      }
    } else if (item.kind === 'weave.notice' && typeof b.space === 'string') {
      const notice = { id: item.id, time: item.time, space: b.space, category: b.category, ...(b.from ? { from: b.from } : {}), ...(b.board ? { board: b.board } : {}), ...(b.channel ? { channel: b.channel } : {}), ...(b.post ? { post: b.post } : {}) };
      const rule = ruleFor(notice, rules);
      if (rule ? rule.count : notice.category === 'messages') s.notices.push(notice);
    }
  }
  // What was opened since counts no more.
  s.notices = s.notices.filter((n) => n.time > seenAt(s, n)).slice(-MAX);
  return JSON.stringify(s);
}

export function ask(slot, subjects, state) {
  const s = JSON.parse(state);
  const waiting = s.notices.filter((n) => n.time > seenAt(s, n));
  const out = [];
  for (const subject of JSON.parse(subjects)) {
    const count = subject.space
      ? waiting.filter((n) => n.space === subject.space).length
      : subject.board
        ? waiting.filter((n) => n.space === subject.board.space && n.board === subject.board.name).length
        : waiting.filter((n) => n.space === subject.channel.space && !n.post && (n.channel ?? 'general') === subject.channel.name).length;
    if (count) out.push({ subject, hint: { kind: 'count', count, tooltip: `${count} new for you` } });
  }
  return JSON.stringify(out);
}
