// Websites: a way to join in with a project's participants. It hosts the project's websites: the pages its person's
// services serve, and what its person opens for a program of theirs, announced under its key while Weave holds the
// visitors' connections and lets in only who may visit. It lists them, and maintainers close them. Opening one is
// never its own doing: a port of its person's computer is theirs to open, and a service opens only its own page.
import { answer, closeWebsite, websites } from 'weave:service/host@0.1.0';

export function onEvent(text) {
  const item = JSON.parse(text);
  if (item.kind !== 'weave.service.request') return;
  const action = item.body?.action;
  try {
    if (action === 'list') return void answer(item.id, undefined, websites(item.space.id), undefined);
    if (action === 'close') {
      closeWebsite(String(item.body?.data?.id ?? ''));
      return void answer(item.id, 'Closed.', undefined, undefined);
    }
    const all = JSON.parse(websites(item.space.id));
    answer(item.id, all.length ? `${all.length} website${all.length === 1 ? '' : 's'} here: ${all.map((w) => w.name).join(', ')}.` : 'No websites here yet.', undefined, undefined);
  } catch (error) {
    answer(item.id, undefined, undefined, String(error?.payload ?? error?.message ?? error));
  }
}
