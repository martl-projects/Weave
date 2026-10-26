import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LINK_HOST, LINK_PORT, personTargetOf, postLink } from '@weave/core';
import { Marked, type Tokens } from 'marked';
import type { Actor, Backend, MessageInfo, PostInfo, Profile } from './backend.ts';

export interface LinkServer {
  port: number;
  close(): Promise<void>;
}

/** Setting up a GitHub App from this computer's pages (see Services.githubAppSetup): what only the browser reaches. */
export interface GitHubAppFlow {
  manifest(state: string): { action: string; manifest: string; org?: string; service: string };
  created(input: { code: string; state: string }): Promise<{ name: string; install: string; service: string }>;
}

/**
 * Post addresses on this computer: http://weave.localhost:7710/<project~id/board/post/title>
 * shows that post, read-only, so a link an agent writes in Claude Code (or anywhere)
 * opens it in a browser or Claude Code's browser pane, with a button that brings
 * the Weave app to it.
 *
 * Only for this computer: it listens on 127.0.0.1 and answers only to the name
 * weave.localhost (a web page can't reach it by DNS rebinding, and other sites
 * can't read its responses). Nothing on it changes anything but where the app
 * looks, with one exception that needs a secret: setting up the person's own
 * GitHub App, started in Weave, which GitHub sends back here with the setup's
 * random state (unguessable, used once, an hour at most). A strict
 * Content-Security-Policy keeps whatever a post contains from running scripts
 * or loading anything from elsewhere.
 *
 *   GET  /<address>              the post and its chat, or a person (@name~key)
 *   POST /open/<address>         bring the Weave app to it (same-origin forms only)
 *   GET  /github/new-app?state   the App's description, sent to GitHub with one click
 *   GET  /github/app-created?code&state   GitHub's way back: the App's ID and key go to the GitHub service
 */
export async function startLinks(backend: Backend, port = LINK_PORT, githubApp?: GitHubAppFlow): Promise<LinkServer> {
  const server: Server = createServer((req, res) => {
    handle(backend, req, res, githubApp).catch((error: Error) => page(res, 500, 'Weave', `<p class="note">${escape(error.message)}</p>`));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });
  return {
    port: (server.address() as AddressInfo).port,
    close: () =>
      new Promise((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
}

async function handle(backend: Backend, req: IncomingMessage, res: ServerResponse, githubApp?: GitHubAppFlow): Promise<void> {
  const host = req.headers.host ?? '';
  if (host.split(':')[0] !== LINK_HOST) return page(res, 403, 'Weave', '<p class="note">Open Weave links as http://weave.localhost:…</p>');
  const url = new URL(req.url ?? '/', `http://${host}`);
  const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');

  if (req.method === 'GET' && githubApp && (path === 'github/new-app' || path === 'github/app-created')) {
    const state = url.searchParams.get('state') ?? '';
    try {
      if (path === 'github/new-app') {
        const { action, manifest, org, service } = githubApp.manifest(state);
        // No scripts here: one button sends GitHub the App's description (and only GitHub may receive it).
        return page(
          res,
          200,
          'Your GitHub App',
          `<h1>Your own GitHub App</h1><p>Weave's GitHub service (${escape(service)}) will act as an App of yours${org ? ` in <b>${escape(org)}</b>` : ''}: it keeps your linked repositories' access in step with your spaces and hands their release files to participants, without anyone signing in.</p><p class="note">It asks for Administration (read and write), Contents (read) and Metadata (read), and no webhooks. You confirm it on GitHub, then install it on the repositories it should manage.</p><form method="post" action="${escape(action)}"><input type="hidden" name="manifest" value="${escape(manifest)}"><button>Continue on GitHub</button></form>`,
          'https://github.com',
        );
      }
      const created = await githubApp.created({ code: url.searchParams.get('code') ?? '', state });
      // Next and last: installing it, on GitHub.
      res.writeHead(303, { location: created.install, 'cache-control': 'no-store', 'referrer-policy': 'no-referrer' });
      return void res.end();
    } catch (error) {
      return page(res, 400, 'Your GitHub App', `<h1>Your own GitHub App</h1><p class="note">${escape((error as Error).message)}</p>`);
    }
  }

  if (req.method === 'POST' && path.startsWith('open/')) {
    // A form on one of these pages, nothing else: browsers send Origin with every POST.
    if (req.headers.origin !== `http://${host}`) return page(res, 403, 'Weave', '<p class="note">Not from a Weave page.</p>');
    const address = path.slice('open/'.length);
    if (personTargetOf(address)) await backend.openInApp({ what: 'person', who: address });
    else await backend.openInApp({ what: 'post', post: (await backend.post(`http://${LINK_HOST}/${address}`)).id });
    res.writeHead(303, { location: `/${address}?opened=1` });
    return void res.end();
  }
  if (req.method !== 'GET') return page(res, 405, 'Weave', '<p class="note">Only reading here.</p>');
  if (!path) return page(res, 200, 'Weave', '<h1>Weave</h1><p class="note">Post links open here: http://weave.localhost:7710/project~id/board/post. They show what you can see in Weave, on this computer only.</p>');

  if (personTargetOf(path)) {
    let person: Profile;
    try {
      person = await backend.profile(path);
    } catch {
      return page(res, 404, 'Not here', `<h1>Not here</h1><p class="note">Nobody with this address is known on this computer yet.</p>`);
    }
    return page(res, 200, person.name ?? 'Someone', personPage(person, path, url.searchParams.has('opened')));
  }

  let post: PostInfo;
  try {
    post = await backend.post(`http://${LINK_HOST}/${path}`);
  } catch {
    return page(res, 404, 'Not here', `<h1>Not here</h1><p class="note">This post isn't on this computer. It may be in a project or community you're not in, or it hasn't reached you yet.</p>${openButton(path, 'Open Weave')}`);
  }
  const chat = post.space && post.type !== 'project' ? await backend.messages(undefined, { post: post.id, limit: 50 }).catch(() => [] as MessageInfo[]) : [];
  return page(res, 200, post.title, postPage(post, chat, path, url.searchParams.has('opened')));
}

// ---------------------------------------------------------------- the page

function postPage(post: PostInfo, chat: MessageInfo[], path: string, opened: boolean): string {
  const where = post.space ? `${post.space.kind === 'community' ? 'r' : 'p'}/${post.space.name}${post.board && post.type !== 'project' ? ` · ${post.board}` : ''}` : 'public post';
  const status = post.issue ? ` · <span class="tag">${escape(post.issue.status)}</span>` : '';
  return `
<header>
  <div class="where">${escape(where)}${status}</div>
  <h1>${escape(post.title)}</h1>
  <div class="by">${escape(actor(post.by))} · ${escape(when(post.time))}${post.edited ? ` · edited ${escape(when(post.edited))}` : ''} · ${post.score} points · ${post.chat} in chat</div>
</header>
<div class="actions">${opened ? '<span class="note">Opened in Weave.</span>' : openButton(path, 'Open in Weave')}<code>${escape(postLink(post.id))}</code></div>
${post.link && /^https?:\/\//.test(post.link) ? `<p><a href="${escape(post.link)}" rel="noreferrer">${escape(post.link)}</a></p>` : ''}
<article>${markdown(post.text) || '<p class="note">No text.</p>'}</article>
${post.type === 'project' ? '<p class="note">The project\'s chat is in its channels, in Weave.</p>' : ''}
${chat.length ? `<section><h2>Chat</h2>${chat.map((m) => `<div class="msg"><div class="by">${escape(actor(m.by))} · ${escape(when(m.time))}</div>${markdown(m.text)}</div>`).join('')}</section>` : ''}`;
}

function personPage(person: Profile, path: string, opened: boolean): string {
  const state = person.me ? 'you' : person.following && person.followsMe ? 'friend' : person.following ? 'you follow them' : person.followsMe ? 'follows you' : person.contact ? 'in your address book' : '';
  const projects = person.projects.map((p) => `<li>${escape(p.name)}</li>`).join('');
  return `
<header>
  <div class="where">person${state ? ` · ${escape(state)}` : ''}${person.company ? ` · ${escape(person.company.name ?? 'company account')}` : ''}</div>
  <h1>${escape(person.name ?? 'Someone')}</h1>
  <div class="by">${person.posts} public posts</div>
</header>
<div class="actions">${opened ? '<span class="note">Opened in Weave.</span>' : openButton(path, 'Open in Weave')}<code>${escape(person.did)}</code></div>
${projects ? `<section><h2>Projects</h2><ul>${projects}</ul></section>` : ''}`;
}

const openButton = (path: string, label: string) => `<form method="post" action="/open/${escape(encodeURI(path))}"><button>${escape(label)}</button></form>`;

const actor = (a: Actor) => (a.agent ? `${a.name ?? 'someone'} · ${a.agent}` : (a.name ?? 'someone'));
const when = (iso: string) => new Date(iso).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });

const escape = (text: string) => text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

/** Markdown without raw HTML, remote images or script links: whatever a post holds stays text. */
const md = new Marked({
  gfm: true,
  breaks: true,
  renderer: {
    html: ({ text }: Tokens.HTML | Tokens.Tag) => escape(text),
    image: ({ text }: Tokens.Image) => `<span class="note">[image${text ? `: ${escape(text)}` : ''}]</span>`,
    link({ href, tokens }: Tokens.Link) {
      const label = this.parser.parseInline(tokens);
      return /^(https?:|mailto:|weave:)/i.test(href) ? `<a href="${escape(href)}" rel="noreferrer">${label}</a>` : label;
    },
  },
});
const markdown = (text: string) => (text ? (md.parse(text, { async: false }) as string) : '');

const STYLE = `
:root { color-scheme: light dark; --bg: #fbfaf7; --fg: #1d1b18; --muted: #6b665e; --line: #e4e0d8; --accent: #4b5bd6; }
@media (prefers-color-scheme: dark) { :root { --bg: #15161a; --fg: #e9e6e0; --muted: #9a958c; --line: #2b2d33; --accent: #8d99ff; } }
* { box-sizing: border-box; }
body { margin: 0; background: var(--bg); color: var(--fg); font: 15px/1.55 system-ui, -apple-system, "Segoe UI", sans-serif; }
main { max-width: 760px; margin: 0 auto; padding: 24px 16px 48px; }
.brand { font-weight: 700; color: var(--muted); font-size: 13px; letter-spacing: .04em; text-transform: uppercase; }
h1 { font-size: 24px; line-height: 1.25; margin: 6px 0; }
h2 { font-size: 16px; margin: 28px 0 8px; }
.where, .by, .note { color: var(--muted); font-size: 13px; }
.tag { border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; align-items: center; margin: 14px 0 18px; }
.actions code { color: var(--muted); font-size: 12px; overflow-wrap: anywhere; }
button { font: inherit; padding: 6px 14px; border-radius: 6px; border: 1px solid var(--accent); background: var(--accent); color: #fff; cursor: pointer; }
article { border-top: 1px solid var(--line); padding-top: 8px; overflow-wrap: anywhere; }
a { color: var(--accent); }
pre, code { font-family: ui-monospace, Consolas, monospace; }
pre { overflow-x: auto; background: color-mix(in srgb, var(--line) 50%, transparent); padding: 10px; border-radius: 6px; }
blockquote { margin: 0; padding-left: 12px; border-left: 3px solid var(--line); color: var(--muted); }
.msg { border-top: 1px solid var(--line); padding: 8px 0; }
.msg p { margin: 4px 0; }`;

/** A page; `formsTo` lets its forms go to that one other site (GitHub, for setting up an App). */
function page(res: ServerResponse, status: number, title: string, body: string, formsTo?: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': `default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'${formsTo ? ` ${formsTo}` : ''}; base-uri 'none'; frame-ancestors 'none'`,
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Weave</title><style>${STYLE}</style></head><body><main><div class="brand">Weave</div>${body}</main></body></html>`);
}
