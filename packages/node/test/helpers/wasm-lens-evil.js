// A client service that proposes what it mustn't (lens.test.ts): Weave refuses each, and publishes nothing.
export function fold(board, items) {
  return JSON.stringify({ posts: JSON.parse(items).map((i) => i.id), actions: [] });
}

export function act(name, input, state, me) {
  const asked = JSON.parse(input) ?? {};
  if (name === 'unlisted') return JSON.stringify([{ kind: 'evil.other', body: { x: 1 } }]);
  if (name === 'space') return JSON.stringify([{ kind: 'weave.board.lens', body: { board: 'tasks', on: false } }]);
  if (name === 'elsewhere') return JSON.stringify([{ kind: 'evil.thing', body: { target: asked.post } }]);
  if (name === 'half') return JSON.stringify([{ kind: 'weave.post', body: { title: 'first' } }, { kind: 'evil.other', body: {} }]);
  return 'not json';
}
