// Labels for people you list: a Weave mark service in JavaScript, built into a WebAssembly component. Take it into
// your own domain and its labels show next to those people's names everywhere you look ("friend", "colleague"); a
// project's maintainers can pin it there instead, shown only in that project. It's pure: Weave hands it what it reads
// (fold) and asks what to show (ask). Its settings are the list:
//
//   {"labels": {"did:key:z6Mk…": "friend", "did:key:z6Mk…": "colleague"}}

/** Nothing to fold: the list is in its settings. A service that reads events keeps what it needs of them here. */
export function fold(domain, settings, state, items) {
  const labels = JSON.parse(settings).labels ?? {};
  return JSON.stringify({ labels });
}

/** For each person asked about who is on the list: a label (at most 16 characters); Weave adds who says so. */
export function ask(slot, subjects, state, viewer) {
  const { labels } = JSON.parse(state);
  return JSON.stringify(
    JSON.parse(subjects)
      .filter((s) => typeof labels[s.did] === 'string')
      .map((subject) => ({ subject, marks: [{ kind: 'label', text: labels[subject.did].slice(0, 16), tooltip: `On your list: ${labels[subject.did]}` }] })),
  );
}
