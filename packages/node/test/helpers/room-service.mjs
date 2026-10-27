// A service with a web page, for tests: it listens on a port of its own, serves it as a website of its project
// (weave.serve), and says who is asking (weave.who from @weave/sdk).
import { createServer } from 'node:http';
import { createRequire } from 'node:module';

const { connect } = createRequire(import.meta.url)('../../../sdk/src/index.cjs');
const weave = connect();

const server = createServer(async (req, res) => {
  const who = await weave.who(req).catch(() => undefined);
  res.setHeader('content-type', 'application/json');
  res.end(JSON.stringify({ service: process.env.WEAVE_SERVICE, who: who ? { did: who.did, name: who.name } : null }));
}).listen(0, '127.0.0.1', () => void weave.serve(server.address().port, { name: 'Board' }));
