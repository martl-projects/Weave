// A room's handler, for tests: on the port Weave gives it, it says who is asking (weave.who from @weave/sdk).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const { Weave } = createRequire(import.meta.url)('../../../sdk/src/index.cjs');
const weave = new Weave({ api: process.env.WEAVE_API, token: process.env.WEAVE_TOKEN });

createServer(async (req, res) => {
  const who = await weave.who(req).catch(() => undefined);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ room: process.env.WEAVE_ROOM, who: who ? { did: who.did, name: who.name } : null }));
}).listen(Number(process.env.PORT), '127.0.0.1');
