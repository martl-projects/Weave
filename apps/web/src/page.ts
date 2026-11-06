import { askPasskey, makePasskey } from './passkey.ts';

/*
 * A page to try the node in the Worker with, against the storage node of dev.ts: making an account, coming back to it,
 * bringing it to another browser. The real screens are step 8. `weave` in the console calls the node.
 */

const $ = <T extends HTMLElement>(id: string) => document.querySelector<T>(`#${id}`)!;
const out = $('out');
const show = (label: string, value: unknown) => (out.textContent += `${label}: ${JSON.stringify(value)}\n`);

const worker = new Worker('/worker.js', { type: 'module' });
let next = 1;
const waiting = new Map<number, { resolve(value: unknown): void; reject(error: Error): void }>();
const STORAGE = `ws://${location.host}/storage`;

async function refresh() {
  const spaces = await call<Array<{ name: string }>>('spaces').catch(() => []);
  if (!spaces.some((s) => s.name === 'Climb')) return;
  $('messages').textContent = JSON.stringify(await call('messages', 'Climb'), null, 1);
}

/** The services' Workers, by the node's key: the page starts them for it. */
const services = new Map<string, Worker>();

worker.onmessage = ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string; event?: string; state?: string; detail?: string; key?: string; base?: string; port?: MessagePort }>) => {
  if (data.event === 'service') {
    const service = new Worker('/service.js', { type: 'module' });
    services.set(data.key!, service);
    return service.postMessage({ base: data.base, port: data.port }, [data.port!]);
  }
  if (data.event === 'service-stop') {
    services.get(data.key!)?.terminate();
    return void services.delete(data.key!);
  }
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

/** Once a way in worked: online, into the group of dev.ts if this is the first time. */
async function goOn(firstTime: boolean) {
  $('doors').hidden = true;
  show('who', await call('whoami'));
  const { invite, link } = (await (await fetch('/dev/invite')).json()) as { invite: string; link: string };
  await call('connect', STORAGE, firstTime ? invite : undefined);
  if (firstTime) show('joined', ((await call('joinSpace', link)) as { name: string }).name);
  await refresh();
}

const words = () => $<HTMLInputElement>('words').value;
const name = () => $<HTMLInputElement>('name').value || 'Web';

/** A button's work, with what went wrong shown. */
const on = (id: string, work: () => Promise<void>) =>
  $(id).addEventListener('click', () => {
    work().catch((error: Error) => show('failed', error.message));
  });

on('create-passkey', async () => {
  const made = await call<{ words: string }>('create', name(), await makePasskey(name()));
  show('your words (shown once)', made.words);
  await goOn(true);
});
on('create-words', async () => {
  const made = await call<{ words: string }>('create', name());
  show('your words (shown once)', made.words);
  await goOn(true);
});
on('unlock-passkey', async () => {
  await call('unlock', await askPasskey());
  await goOn(false);
});
on('unlock-words', async () => {
  await call('unlock', { words: words() });
  await goOn(false);
});
on('arrive-passkey', async () => {
  await call('arrive', STORAGE, await askPasskey());
  await goOn(false);
});
on('arrive-words', async () => {
  await call('arrive', STORAGE, { words: words() });
  await goOn(false);
});

async function main() {
  (globalThis as { weave?: unknown }).weave = call;
  const { exists, ways } = await call<{ exists: boolean; ways: string[] }>('open');
  show('this browser', { exists, ways });
  document.querySelectorAll<HTMLElement>('[data-when]').forEach((el) => (el.hidden = (el.dataset.when === 'exists') !== exists));
  $('doors').hidden = false;
}

main().catch((error: Error) => show('failed', error.message));
