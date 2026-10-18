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
  post <text...>             publish a post            [--group <g>] [--as <agent>] [--kind <kind>]
  feed                       show recent posts         [--group <g>] [-n <count>] [--kind <kinds>] [--all]
  watch                      stream new events (needs a running daemon)
  join <topic>               join a topic (a group of peers) on the DHT
  agent add <name>           create a key for an agent [--can <kinds>]  default: weave.post,weave.reply
  agent list                 list your agents
  bootstrap <host:port...>   use these DHT bootstrap nodes (e.g. a local testnet); --clear for defaults

groups (end-to-end encrypted):
  group create <name>        start a group
  group list                 groups you belong to
  group invite <group>       print an invite link       [--hours <n>]  default: 168
  group join <invite>        join with an invite link
  group members <group>      members and who invited them
  group remove <group> <who> remove a member and rotate the key (founder only)

people (<who> is a name you have seen or a did:key):
  follow <who> / unfollow <who>       public unless --private
  block <who> / unblock <who>         private unless --public
  mute <who> / unmute <who>           private unless --public
  people                     following, followers, friends, blocked, muted

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
    group: { type: 'string', short: 'g' },
    hours: { type: 'string' },
    private: { type: 'boolean' },
    public: { type: 'boolean' },
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
  const where = item.group ? `#${item.group.name} ` : item.private ? '(private) ' : '';
  return `${time}  ${who(item).padEnd(20)}  ${where}${kind}${body}`;
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
        if (event.signer === daemon.node.identity.did) return;
        const item = daemon.node.itemFor(event);
        if (item && CONTENT_KINDS.includes(item.kind)) console.log(line(item));
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
      const item = await (await backend()).publish({ kind: values.kind ?? 'weave.post', body: { text }, as: values.as, group: values.group });
      return out(item, () => line(item));
    }

    case 'feed': {
      const items = await (await backend()).feed({ limit: values.n ? Number(values.n) : 20, kinds: values.kind?.split(',') ?? (values.all ? undefined : CONTENT_KINDS), group: values.group });
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

    case 'group': {
      const [sub, ref, extra] = args;
      const b = await backend();
      if (sub === 'create' && ref) {
        const g = await b.createGroup(args.slice(1).join(' '));
        return out(g, () => `created group ${g.name}\n  invite people with: weave group invite "${g.name}"`);
      }
      if (sub === 'list') {
        const groups = await b.groups();
        return out(groups, () => groups.map((g) => `${g.name.padEnd(24)} ${g.members} member${g.members === 1 ? '' : 's'}, founded by ${g.founderName ?? g.founder}`).join('\n') || '(no groups)');
      }
      if (sub === 'invite' && ref) {
        const invite = await b.invite(ref, values.hours ? Number(values.hours) : undefined);
        return out({ invite }, () => `${invite}\n\nShare this link privately: whoever has it can read the group.\nThey join with: weave group join <link>`);
      }
      if (sub === 'join' && ref) {
        const g = await b.joinGroup(ref);
        return out(g, () => `joined ${g.name} (founded by ${g.founderName ?? g.founder})`);
      }
      if (sub === 'members' && ref) {
        const members = await b.members(ref);
        return out(members, () =>
          members.map((m) => `${(m.name ?? m.did).padEnd(24)} ${m.invitedBy ? `invited by ${m.invitedByName ?? m.invitedBy}` : 'founder'}`).join('\n'),
        );
      }
      if (sub === 'remove' && ref && extra) {
        await b.removeMember(ref, extra);
        return out({ removed: extra }, () => `removed ${extra} and rotated the group key`);
      }
      throw new Error('usage: weave group create|list|invite|join|members|remove — see "weave --help"');
    }

    case 'follow':
    case 'unfollow':
    case 'block':
    case 'unblock':
    case 'mute':
    case 'unmute': {
      const target = args.join(' ').trim();
      if (!target) throw new Error(`usage: weave ${command} <who>`);
      const on = !command.startsWith('un');
      const edge = command.replace(/^un/, '') as 'follow' | 'block' | 'mute';
      const isPrivate = values.private ? true : values.public ? false : undefined;
      await (await backend()).setEdge({ edge, who: target, on, private: isPrivate });
      const done = { follow: 'following', block: 'blocked', mute: 'muted' }[edge];
      return out({ edge, who: target, on }, () => `${on ? '' : 'no longer '}${done} ${target}`);
    }

    case 'people': {
      const social = await (await backend()).social();
      const list = (people: { did: string; name?: string }[]) => people.map((p) => p.name ?? p.did).join(', ') || '-';
      return out(social, () =>
        [
          `friends    ${list(social.friends)}`,
          `following  ${list(social.following)}`,
          `followers  ${list(social.followers)}`,
          `blocked    ${list(social.blocked)}`,
          `muted      ${list(social.muted)}`,
        ].join('\n'),
      );
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
