// A WebAssembly service that reaches out, for tests (wasm-net.test.ts): asked a URL, it fetches it and answers with
// the status and the body, or with why it couldn't. onEvent returns its promise, so the component waits for it.
import { answer } from 'weave:service/host@0.1.0';

export async function onEvent(text) {
  const item = JSON.parse(text);
  if (item.kind !== 'weave.service.request') return;
  const url = item.body?.text ?? '';
  try {
    const res = await fetch(url);
    answer(item.id, `${res.status} ${await res.text()}`, undefined, undefined);
  } catch (error) {
    answer(item.id, `failed: ${error?.message ?? error}`, undefined, undefined);
  }
}
