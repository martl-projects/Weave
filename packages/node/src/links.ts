import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { AddressInfo } from 'node:net';
import { LINK_HOST, LINK_PORT, postLink } from '@weave/core';
import { Marked, type Tokens } from 'marked';
import type { Actor, Backend, MessageInfo, PostInfo } from './backend.ts';

export interface LinkServer {
  port: number;
  close(): Promise<void>;
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
 * looks. A strict Content-Security-Policy keeps whatever a post contains from
 * running scripts or loading anything from elsewhere.
 *
 *   GET  /<address>        the post and its chat
 *   POST /open/<address>   bring the Weave app to the post (same-origin forms only)
 */
export async function startLinks(backend: Backend, port = LINK_PORT): Promise<LinkServer> {
  const server: Server = createServer((req, res) => {
    handle(backend, req, res).catch((error: Error) => page(res, 500, 'Weave', `<p class="note">${escape(error.message)}</p>`));
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

async function handle(backend: Backend, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const host = req.headers.host ?? '';
  if (host.split(':')[0] !== LINK_HOST) return page(res, 403, 'Weave', '<p class="note">Open Weave links as http://weave.localhost:…</p>');
  const url = new URL(req.url ?? '/', `http://${host}`);
  const path = decodeURIComponent(url.pathname).replace(/^\/+/, '');

  if (req.method === 'POST' && path.startsWith('open/')) {
    // A form on one of these pages, nothing else: browsers send Origin with every POST.
    if (req.headers.origin !== `http://${host}`) return page(res, 403, 'Weave', '<p class="note">Not from a Weave page.</p>');
    const address = path.slice('open/'.length);
    const post = await backend.post(`http://${LINK_HOST}/${address}`);
    await backend.openInApp({ what: 'post', post: post.id });
    res.writeHead(303, { location: `/${address}?opened=1` });
    return void res.end();
  }
  if (req.method !== 'GET') return page(res, 405, 'Weave', '<p class="note">Only reading here.</p>');
  if (!path) return page(res, 200, 'Weave', '<h1>Weave</h1><p class="note">Post links open here: http://weave.localhost:7710/project~id/board/post. They show what you can see in Weave, on this computer only.</p>');

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

function page(res: ServerResponse, status: number, title: string, body: string): void {
  res.writeHead(status, {
    'content-type': 'text/html; charset=utf-8',
    'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
    'x-content-type-options': 'nosniff',
    'referrer-policy': 'no-referrer',
    'cache-control': 'no-store',
  });
  res.end(`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Weave</title><style>${STYLE}</style></head><body><main><div class="brand">Weave</div>${body}</main></body></html>`);
}
