// A small service for tests: it answers every request addressed to it with "echo: <text>", through its own token.
const api = process.env.WEAVE_SERVICE_API;
const headers = { authorization: `Bearer ${process.env.WEAVE_SERVICE_TOKEN}`, 'content-type': 'application/json' };
const answered = new Set();

async function round() {
  const res = await fetch(`${api}/events`, { headers });
  const { result } = await res.json();
  for (const item of result ?? []) {
    if (item.kind !== 'weave.service.request' || answered.has(item.id)) continue;
    answered.add(item.id);
    await fetch(`${api}/answer`, { method: 'POST', headers, body: JSON.stringify({ request: item.id, text: `echo: ${item.body?.text ?? ''}` }) });
  }
}

for (;;) {
  await round().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 200));
}
