// A stand-in for the docker command line, for tests without Docker: `version` answers (unless FAKE_DOCKER_DOWN),
// `rm` and `stop` are written down in FAKE_DOCKER_DIR, and `run` serves the published port, answering every request
// with the variables the container got (by the names passed with -e), until it's stopped.
import { appendFileSync, existsSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';

const [command, ...args] = process.argv.slice(2);
const dir = process.env.FAKE_DOCKER_DIR;
const note = (line) => dir && appendFileSync(join(dir, 'docker.log'), `${line}\n`);

if (command === 'version') {
  if (process.env.FAKE_DOCKER_DOWN) {
    process.stderr.write('Cannot connect to the Docker daemon\n');
    process.exit(1);
  }
  process.stdout.write('27.0.0\n');
} else if (command === 'rm' || command === 'stop') {
  note(`${command} ${args.join(' ')}`);
  if (command === 'stop' && dir) writeFileSync(join(dir, `stopped-${args.at(-1)}`), '');
} else if (command === 'run') {
  note(`run ${args.join(' ')}`);
  const name = args[args.indexOf('--name') + 1];
  const names = args.flatMap((a, i) => (a === '-e' ? [args[i + 1]] : []));
  const published = args.find((a) => /^127\.0\.0\.1:\d+:\d+/.test(a));
  const port = published ? Number(published.split(':')[1]) : Number(process.env.FAKE_DOCKER_PORT);
  const env = Object.fromEntries(names.map((n) => [n, process.env[n] ?? null]));
  const server = createServer((req, res) => res.end(JSON.stringify({ image: args.at(-1), env, person: req.headers['x-weave-person'] ?? null })));
  server.listen(port, '127.0.0.1', () => process.stdout.write(`container ${name} up on ${port}\n`));
  setInterval(() => {
    if (dir && existsSync(join(dir, `stopped-${name}`))) process.exit(0);
  }, 100);
} else {
  process.stderr.write(`fake docker: ${command}?\n`);
  process.exit(1);
}
