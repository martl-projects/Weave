// Spotlight: what matters to you stands out, as a Weave hint service Weave ships. A place where something you haven't
// opened waits from a board you care about gets a tint; one where someone close to you wrote gets their sign; their
// messages, and your contacts', stand out in the chat. It folds weave.msg, weave.post, weave.seen (what you opened,
// sealed to you) and weave.contact (your address book, sealed to you), and shows nothing until its settings say who
// and what.

const MAX = 5000;
const TONES = ['yellow', 'green', 'blue', 'red', 'purple'];
const SIGNS = ['heart', 'star', 'flag', 'bell'];

/** The settings as far as they make sense. */
function read(settings) {
  const s = JSON.parse(settings) ?? {};
  const tone = (t) => (TONES.includes(t) ? t : undefined);
  const sign = (t) => (SIGNS.includes(t) ? t : undefined);
  const boards = (Array.isArray(s.boards) ? s.boards : []).filter((b) => typeof b?.board === 'string' && tone(b.tone));
  const people = (Array.isArray(s.people) ? s.people : []).filter((p) => typeof p?.who === 'string' && (tone(p.tone) || sign(p.sign)));
  const contacts = s.contacts && (tone(s.contacts.tone) || sign(s.contacts.sign)) ? s.contacts : undefined;
  return { boards, people, contacts };
}

/** When you last opened what shows this: the whole place, its channel, its board, or its post (as Unread). */
function seenAt(state, n) {
  const at = [state.all ?? '', state.seen[`${n.space}|all`] ?? ''];
  if (n.post) at.push(state.seen[`${n.space}|post|${n.post}`] ?? '');
  else if (!n.board) at.push(state.seen[`${n.space}|channel|${n.channel ?? 'general'}`] ?? '');
  if (n.board) at.push(state.seen[`${n.space}|board|${n.board}`] ?? '');
  return at.reduce((a, b) => (a > b ? a : b));
}

const boardRule = (s, n) => n.board && s.boards.find((b) => b.board === n.board && (!b.space || b.space === n.space));
const person = (s, who) => s.people.find((p) => p.who === who);

export function fold(domain, settings, state, items) {
  const me = JSON.parse(domain).id;
  const st = state ? JSON.parse(state) : { seen: {}, waiting: [], boards: {}, authors: {}, contacts: [] };
  const s = read(settings);
  for (const item of JSON.parse(items)) {
    const b = item.body ?? {};
    if (item.kind === 'weave.seen') {
      if (b.all === true) st.all = b.time > (st.all ?? '') ? b.time : st.all;
      else if (typeof b.space === 'string') {
        const key = b.view === 'all' ? `${b.space}|all` : `${b.space}|${b.view}|${b.name}`;
        if (b.time > (st.seen[key] ?? '')) st.seen[key] = b.time;
      }
      continue;
    }
    if (item.kind === 'weave.contact') {
      if (item.private && typeof b.did === 'string' && !st.contacts.includes(b.did)) st.contacts.push(b.did);
      continue;
    }
    if (!item.space || item.author === me) continue;
    // Posts: which board each is on, so a message in a post's chat knows its board.
    if (item.kind === 'weave.post' && typeof b.board === 'string') st.boards[item.id] = b.board;
    const n = { id: item.id, time: item.time, space: item.space, author: item.author };
    if (item.kind === 'weave.post' && typeof b.board === 'string') Object.assign(n, { board: b.board, post: item.id });
    else if (item.kind === 'weave.msg') {
      if (typeof b.post === 'string') Object.assign(n, { post: b.post, ...(st.boards[b.post] ? { board: st.boards[b.post] } : {}) });
      else n.channel = typeof b.channel === 'string' ? b.channel : 'general';
    } else continue;
    // Only what could stand out is kept: a board or person of the settings, or a contact's message.
    const known = boardRule(s, n) || person(s, n.author);
    if (known) st.waiting.push(n);
    // Authors of messages: with contacts in the settings all of them, as someone may become one later.
    if (item.kind === 'weave.msg' && (known || s.contacts)) st.authors[item.id] = n.author;
  }
  st.waiting = st.waiting.filter((n) => n.time > seenAt(st, n)).slice(-MAX);
  // A change of settings folds again from the start, so ask reads them from here.
  st.settings = s;
  const ids = Object.keys(st.authors);
  for (const id of ids.slice(0, Math.max(0, ids.length - MAX))) delete st.authors[id];
  const posts = Object.keys(st.boards);
  for (const id of posts.slice(0, Math.max(0, posts.length - MAX))) delete st.boards[id];
  return JSON.stringify(st);
}

/** What a place's subject covers of what waits. */
function inPlace(subject, n) {
  if (subject.space) return n.space === subject.space;
  if (subject.board) return n.space === subject.board.space && n.board === subject.board.name;
  if (subject.channel) return n.space === subject.channel.space && !n.post && (n.channel ?? 'general') === subject.channel.name;
  return false;
}

export function ask(slot, subjects, state) {
  const st = JSON.parse(state);
  const s = st.settings;
  const out = [];
  for (const subject of JSON.parse(subjects)) {
    const hints = [];
    if (subject.message) {
      const author = st.authors[subject.message.id];
      const p = author && person(s, author);
      const look = p ?? (author && s.contacts && st.contacts.includes(author) ? s.contacts : undefined);
      const why = p ? (p.name ?? 'someone close to you') : 'in your contacts';
      if (look?.tone) hints.push({ kind: 'tint', tone: look.tone, tooltip: why });
      if (look?.sign) hints.push({ kind: 'sign', sign: look.sign, tooltip: why });
    } else {
      const waiting = st.waiting.filter((n) => n.time > seenAt(st, n) && inPlace(subject, n));
      const board = waiting.map((n) => boardRule(s, n)).find(Boolean);
      if (board) hints.push({ kind: 'tint', tone: board.tone, tooltip: `new on ${board.board}` });
      const p = waiting.map((n) => person(s, n.author)).find((x) => x?.sign);
      if (p) hints.push({ kind: 'sign', sign: p.sign, tooltip: `${p.name ?? 'someone close to you'} wrote` });
    }
    if (hints.length) out.push({ subject, hints });
  }
  return JSON.stringify(out);
}
