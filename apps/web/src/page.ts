/* A page to try the node in the Worker with: it joins a group through the storage node of dev.ts, and reads and writes there. */

const out = document.querySelector('#out')!;
const show = (label: string, value: unknown) => (out.textContent += `${label}: ${JSON.stringify(value)}\n`);

const worker = new Worker('/worker.js', { type: 'module' });
let next = 1;
const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();

async function refresh() {
  const spaces = await call<Array<{ name: string }>>('spaces').catch(() => []);
  if (!spaces.some((s) => s.name === 'Climb')) return;
  document.querySelector('#messages')!.textContent = JSON.stringify(await call('messages', 'Climb'), null, 1);
}

worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string; event?: string; state?: string; detail?: string }>) => {
  if (data.event === 'waiting') return void show('waiting', 'Weave is open in another tab');
  if (data.event === 'status') return void show('storage node', data.detail ? `${data.state}: ${data.detail}` : data.state);
  if (data.event === 'changed') return void refresh();
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
  const opened = await call<{ fresh: boolean }>('open', 'Web');
  show('opened', opened);
  show('who', await call('whoami'));
  const { invite, link } = (await (await fetch('/dev/invite')).json()) as { invite: string; link: string };
  await call('connect', `ws://${location.host}/storage`, invite);
  if (opened.fresh) show('joined', await call('joinSpace', link));
  await refresh();
}

main().catch((error: Error) => show('failed', error.message));
