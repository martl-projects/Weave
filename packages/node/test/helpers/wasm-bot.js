// A WebAssembly service, for tests (built into a component by componentize-js, see wasm.test.ts): it answers requests
// with its greeting setting and a count it keeps in /data, tries what its contract doesn't allow when asked to, and
// hangs when asked to.
import { me, setting, answer, publish, load, save, log } from 'weave:service/host@0.1.0';

export function onEvent(text) {
  const item = JSON.parse(text);
  if (item.kind !== 'weave.service.request') return;
  const asked = item.body?.text ?? '';
  if (asked === 'hang') for (;;) {}
  if (asked === 'post') {
    // Not in its contract: the host refuses, and it says so.
    let refused = '';
    try {
      publish(item.space.id, 'weave.post', JSON.stringify({ title: 'sneaky' }));
    } catch (error) {
      refused = String(error?.payload ?? error);
    }
    answer(item.id, `refused: ${refused}`, undefined, undefined);
    return;
  }
  const count = Number(load('count') ?? '0') + 1;
  save('count', String(count));
  const name = JSON.parse(me()).name;
  answer(item.id, `${setting('GREETING') ?? 'hi'} from ${name} (#${count}): ${asked}`, undefined, undefined);
  log(`answered ${item.id}`);
}
