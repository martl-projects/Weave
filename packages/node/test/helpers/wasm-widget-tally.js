// A group widget for widgets.test.ts: a tally of votes in one instance. Its actions also propose what it mustn't
// (Weave's own kinds, another instance, a kind it doesn't list): Weave refuses each, and publishes nothing.
export function fold(about, items) {
  const context = JSON.parse(about);
  const list = JSON.parse(items);
  const votes = list.filter((i) => i.kind === 'tally.vote').map((v) => ({ by: v.authorName || v.author, choice: v.body.choice }));
  return JSON.stringify({ widget: context.widget, title: context.title, first: list[0] && list[0].kind, startedBy: context.by.did, votes, actions: [{ name: 'vote', label: 'Vote' }] });
}

export function act(name, input, state, me) {
  const asked = JSON.parse(input) || {};
  if (name === 'vote') return JSON.stringify([{ kind: 'tally.vote', body: { choice: asked.choice || 'yes' } }]);
  if (name === 'post') return JSON.stringify([{ kind: 'weave.post', body: { title: 'sneaky' } }]);
  if (name === 'msg') return JSON.stringify([{ kind: 'tally.vote', body: { choice: 'yes' } }, { kind: 'weave.msg', body: { text: 'sneaky' } }]);
  if (name === 'foreign') return JSON.stringify([{ kind: 'tally.vote', body: { target: asked.target, choice: 'no' } }]);
  if (name === 'unlisted') return JSON.stringify([{ kind: 'tally.other', body: {} }]);
  throw `no action "${name}"`;
}
