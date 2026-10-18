#!/usr/bin/env node
import { parseArgs } from 'node:util';
import {
  connectDaemon,
  loadConfig,
  parseBootstrap,
  resolveHome,
  saveConfig,
  startDaemon,
  WeaveNode,
  type Backend,
  type FeedItem,
} from '@weave/node';

const HELP = `weave — peer-to-peer projects for people and their agents

usage: weave <command> [options]

  init <name>                create your identity in the Weave home
  whoami                     show your identity and agents
  daemon                     run your node: connect to peers, serve the local API
  status                     node status: peers, topics, logs
  post <text...>             publish a post            [--as <agent>] [--kind <kind>]
  feed                       show recent posts         [-n <count>] [--kind <kinds>] [--all]
  watch                      stream new events (needs a running daemon)
  join <topic>               join a topic (a group of peers) on the DHT
  agent add <name>           create a key for an agent [--can <kinds>]  default: weave.post,weave.reply
  agent list                 list your agents
  bootstrap <host:port...>   use these DHT bootstrap nodes (e.g. a local testnet); --clear for defaults

global options:
  --home <dir>   Weave home (default: $WEAVE_HOME or ~/.weave)
  --json         machine-readable output, one JSON value per line
`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    home: { type: 'string' },
    json: { type: 'boolean', default: false },
    as: { type: 'string' },
    kind: { type: 'string' },
    can: { type: 'string' },
    n: { type: 'string', short: 'n' },
    clear: { type: 'boolean', default: false },
    all: { type: 'boolean', default: false },
    help: { type: 'boolean', short: 'h', default: false },
  },
});

const home = resolveHome(values.home);
const [command, ...args] = positionals;

/** The running daemon if there is one; otherwise the node opened directly (offline). */
async function backend(options: { needsDaemon?: boolean } = {}): Promise<Backend> {
  const daemon = await connectDaemon(home);
  if (daemon) return daemon;
  if (options.needsDaemon) throw new Error('no daemon running for this home — start one with "weave daemon"');
  return WeaveNode.open(home.dir);
}

function out(value: unknown, text: () => string): void {
  console.log(values.json ? JSON.stringify(value) : text());
}

/** Kinds people read; profile and delegation events are shown with --all or --kind. */
const CONTENT_KINDS = ['weave.post', 'weave.reply'];

const who = (item: FeedItem): string => {
  const author = item.authorName ?? item.author.slice(8, 20);
  return item.signerName ? `${author} · ${item.signerName}` : author;
};

function line(item: FeedItem): string {
  const time = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const body = typeof item.body === 'string' ? item.body : (item.body as { text?: unknown } | null)?.text ?? JSON.stringify(item.body);
  const kind = item.kind === 'weave.post' ? '' : `[${item.kind}] `;
  return `${time}  ${who(item).padEnd(20)}  ${kind}${body}`;
}

async function main(): Promise<void> {
  if (!command || values.help) return void console.log(HELP);

  switch (command) {
    case 'init': {
      const name = args.join(' ').trim();
      if (!name) throw new Error('usage: weave init <name>');
      const node = WeaveNode.init(name, home.dir);
      return out({ did: node.identity.did, name, home: home.dir }, () => `created identity for ${name}\n  ${node.identity.did}\n  in ${home.dir}`);
    }

    case 'whoami': {
      const me = await (await backend()).whoami();
      return out(me, () => [`${me.name ?? '(no name)'}  ${me.did}`, ...me.agents.map((a) => `  agent ${a.name}  ${a.did}  can: ${a.permissions.join(', ')}`)].join('\n'));
    }

    case 'daemon': {
      const daemon = await startDaemon(home.dir);
      const status = await daemon.node.status();
      console.log(`weave daemon for ${status.name ?? status.did}`);
      console.log(`  home ${home.dir}\n  api  http://127.0.0.1:${daemon.port}\n  topics ${status.topics.join(', ') || '(none)'}`);
      daemon.node.replica.onAppend((event) => {
        if (event.signer !== daemon.node.identity.did && CONTENT_KINDS.includes(event.kind)) console.log(line(daemon.node.toItem(event)));
      });
      const shutdown = async () => {
        await daemon.stop();
        process.exit(0);
      };
      process.on('SIGINT', shutdown);
      process.on('SIGTERM', shutdown);
      return new Promise(() => {}); // run until stopped
    }

    case 'status': {
      const s = await (await backend()).status();
      return out(s, () =>
        [
          `${s.name ?? '(no name)'}  ${s.did}`,
          `  ${s.online ? `online, ${s.peers} peer${s.peers === 1 ? '' : 's'}` : 'offline (no daemon running)'}`,
          `  topics: ${s.topics.join(', ') || '(none)'}`,
          `  ${s.events} events in ${s.logs} logs${s.pending ? `, ${s.pending} pending` : ''}`,
        ].join('\n'),
      );
    }

    case 'post': {
      const text = args.join(' ').trim();
      if (!text) throw new Error('usage: weave post <text>');
      const item = await (await backend()).publish({ kind: values.kind ?? 'weave.post', body: { text }, as: values.as });
      return out(item, () => line(item));
    }

    case 'feed': {
      const items = await (await backend()).feed({ limit: values.n ? Number(values.n) : 20, kinds: values.kind?.split(',') ?? (values.all ? undefined : CONTENT_KINDS) });
      if (values.json) return items.forEach((item) => console.log(JSON.stringify(item)));
      return console.log(items.map(line).join('\n') || '(nothing yet)');
    }

    case 'watch': {
      const client = await backend({ needsDaemon: true });
      const controller = new AbortController();
      process.on('SIGINT', () => controller.abort());
      return client.watch((item) => console.log(values.json ? JSON.stringify(item) : line(item)), controller.signal);
    }

    case 'join': {
      const [topic] = args;
      if (!topic) throw new Error('usage: weave join <topic>');
      await (await backend()).join(topic);
      return out({ joined: topic }, () => `joined ${topic}`);
    }

    case 'agent': {
      const [sub, name] = args;
      if (sub === 'add' && name) {
        const permissions = (values.can ?? 'weave.post,weave.reply').split(',').map((p) => p.trim()).filter(Boolean);
        const agent = await (await backend()).addAgent(name, permissions);
        return out(agent, () => `agent ${agent.name} created\n  ${agent.did}\n  can: ${agent.permissions.join(', ')}\n  use it with: weave post --as ${agent.name} "..."`);
      }
      if (sub === 'list') {
        const { agents } = await (await backend()).whoami();
        return out(agents, () => agents.map((a) => `${a.name}  ${a.did}  can: ${a.permissions.join(', ')}`).join('\n') || '(no agents)');
      }
      throw new Error('usage: weave agent add <name> [--can <kinds>] | weave agent list');
    }

    case 'bootstrap': {
      const config = loadConfig(home);
      config.bootstrap = values.clear ? [] : args.map(parseBootstrap);
      if (!values.clear && !config.bootstrap.length) throw new Error('usage: weave bootstrap <host:port...> | --clear');
      saveConfig(home, config);
      return out(config, () => `bootstrap: ${config.bootstrap.map((b) => `${b.host}:${b.port}`).join(', ') || 'public defaults'} (restart the daemon to apply)`);
    }

    default:
      throw new Error(`unknown command "${command}" — see "weave --help"`);
  }
}

main().catch((error: Error) => {
  console.error(`weave: ${error.message}`);
  process.exitCode = 1;
});
