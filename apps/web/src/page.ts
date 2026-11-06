/* A page to try the node in the Worker with: it reads a space through the storage node of dev.ts. */

const out = document.querySelector('#out')!;
const show = (label: string, value: unknown) => (out.textContent += `${label}: ${JSON.stringify(value)}\n`);

const worker = new Worker('/worker.js', { type: 'module' });
let next = 1;
const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string; event?: string }>) => {
  if (data.event === 'waiting') return void show('waiting', 'Weave is open in another tab');
  const call = waiting.get(data.id);
  waiting.delete(data.id);
  if (data.error) call?.reject(new Error(data.error));
  else call?.resolve(data.result);
};
const call = <T>(method: string, ...args: unknown[]): Promise<T> =>
  new Promise((resolve, reject) => {
    const id = next++;
    waiting.set(id, { resolve: resolve as (value: unknown) => void, reject });
    worker.postMessage({ id, method, args });
  });

async function main() {
  (globalThis as { weave?: unknown }).weave = call;
  show('opened', await call('open'));
  const { invite, space } = (await (await fetch('/dev/space')).json()) as { invite: string; space: unknown };
  show('connected', await call('connect', `ws://${location.host}/storage`, invite, space));
  setInterval(async () => {
    document.querySelector('#messages')!.textContent = JSON.stringify(await call('messages'), null, 1);
  }, 500);
}

main().catch((error: Error) => show('failed', error.message));
