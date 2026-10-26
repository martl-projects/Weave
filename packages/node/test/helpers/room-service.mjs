// A service with a web page, for tests: it says who is asking (weave.who from @weave/sdk), and offers itself as a room.
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const { Weave } = createRequire(import.meta.url)('../../../sdk/src/index.cjs');
const weave = new Weave({ api: process.env.WEAVE_API, token: process.env.WEAVE_TOKEN });

const server = createServer(async (req, res) => {
  const who = await weave.who(req).catch(() => undefined);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ service: process.env.WEAVE_SERVICE, who: who ? { did: who.did, name: who.name } : null }));
});
server.listen(0, '127.0.0.1', async () => {
  const port = server.address().port;
  const headers = { authorization: `Bearer ${process.env.WEAVE_SERVICE_TOKEN}`, 'content-type': 'application/json' };
  // Tell Weave where the page is: it offers it as the service's room.
  for (let tries = 0; tries < 50; tries++) {
    const res = await fetch(`${process.env.WEAVE_SERVICE_API}/room`, { method: 'POST', headers, body: JSON.stringify({ port }) }).catch(() => undefined);
    if (res?.ok) break;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
});
