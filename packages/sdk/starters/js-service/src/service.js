// A Weave service in JavaScript, built into a WebAssembly component that Weave runs itself (nothing to install).
// It's handed what it may read, one item at a time: here, requests addressed to it. The functions it imports are
// all it can do: no network, no files but its own (load/save), no processes.
import { me, setting, answer, load, save, log } from 'weave:service/host@0.1.0';

export function onEvent(text) {
  const item = JSON.parse(text);
  if (item.kind !== 'weave.service.request') return;

  // Who asked, and how often they did: kept in its /data folder between runs.
  const asker = item.author;
  const counts = JSON.parse(load('counts.json') ?? '{}');
  counts[asker] = (counts[asker] ?? 0) + 1;
  save('counts.json', JSON.stringify(counts));

  const name = JSON.parse(me()).name;
  const greeting = setting('GREETING') ?? 'Hello';
  const asked = item.body?.text ?? '';
  answer(item.id, `${greeting} from ${name}! You asked "${asked}" (that's ${counts[asker]} time${counts[asker] === 1 ? '' : 's'} now).`, undefined, undefined);
  log(`answered ${item.authorName ?? asker}`);
}
