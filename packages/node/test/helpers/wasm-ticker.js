// A WebAssembly service that ticks and signs, for tests (wasm-tick.test.ts): asked "tick", it ticks every second and
// counts its ticks in /data, stopping after three; asked "sign", it signs "hello" with its KEY (which it can't read:
// asked "peek", it says what setting() gives it).
import { answer, load, save, setting, sign, tickEvery } from 'weave:service/host@0.1.0';

export function onEvent(text) {
  const item = JSON.parse(text);
  if (item.kind === 'weave.tick') {
    const ticks = Number(load('ticks') ?? '0') + 1;
    save('ticks', String(ticks));
    if (ticks === 3) tickEvery(0);
    return;
  }
  if (item.kind !== 'weave.service.request') return;
  const asked = item.body?.text ?? '';
  if (asked === 'tick') {
    tickEvery(1000);
    return void answer(item.id, 'ticking', undefined, undefined);
  }
  if (asked === 'peek') return void answer(item.id, setting('KEY') ?? '(none)', undefined, undefined);
  if (asked.startsWith('sign ')) {
    try {
      const signature = sign('KEY', asked.slice(5), new TextEncoder().encode('hello'));
      answer(item.id, btoa(String.fromCharCode(...signature)), undefined, undefined);
    } catch (error) {
      answer(item.id, `failed: ${error?.payload ?? error}`, undefined, undefined);
    }
  }
}
