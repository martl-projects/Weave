/**
 * Post cards inside a chat (MCP Apps, ui:// resources): weave_show's result
 * rendered as cards where the host supports it (Claude chat does; Claude Code
 * shows the tool's text instead). The page talks to the host over postMessage
 * (JSON-RPC: ui/initialize, then ui/notifications/tool-result) and loads
 * nothing from anywhere: the host's default policy blocks it anyway.
 */
export const POST_CARD_URI = 'ui://weave/post-cards';
export const MCP_APP_MIME = 'text/html;profile=mcp-app';

export const POST_CARD_HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Weave posts</title>
<style>
  :root { color-scheme: light dark; --bg: transparent; --card: #ffffff; --fg: #1d1b18; --muted: #6b665e; --line: #e4e0d8; --accent: #4b5bd6; }
  :root[data-theme="light"] { color-scheme: light; }
  :root[data-theme="dark"] { color-scheme: dark; --card: #1c1d22; --fg: #e9e6e0; --muted: #9a958c; --line: #2f3138; --accent: #8d99ff; }
  @media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { --card: #1c1d22; --fg: #e9e6e0; --muted: #9a958c; --line: #2f3138; --accent: #8d99ff; } }
  * { box-sizing: border-box; }
  body { margin: 0; padding: 2px; background: var(--bg); color: var(--fg); font: 14px/1.45 system-ui, -apple-system, "Segoe UI", sans-serif; }
  .note { color: var(--muted); font-size: 13px; margin: 0 0 8px; }
  .cards { display: grid; gap: 8px; }
  .card { border: 1px solid var(--line); border-radius: 10px; background: var(--card); padding: 12px 14px; }
  .where { color: var(--muted); font-size: 12px; display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
  .brand { font-weight: 700; letter-spacing: .04em; text-transform: uppercase; font-size: 11px; color: var(--accent); }
  .tag { border: 1px solid var(--line); border-radius: 4px; padding: 0 5px; }
  .title { font-weight: 600; font-size: 15px; margin: 4px 0; }
  .text { color: var(--fg); opacity: .85; font-size: 13px; overflow-wrap: anywhere; }
  .foot { display: flex; gap: 8px; align-items: center; margin-top: 10px; flex-wrap: wrap; }
  .meta { color: var(--muted); font-size: 12px; margin-right: auto; }
  button { font: inherit; font-size: 13px; padding: 4px 10px; border-radius: 6px; border: 1px solid var(--line); background: transparent; color: var(--fg); cursor: pointer; }
  button.primary { background: var(--accent); border-color: var(--accent); color: #fff; }
  .status { color: var(--muted); font-size: 12px; }
  .empty { color: var(--muted); }
</style>
</head>
<body>
<div id="root"><p class="empty">Waiting for posts…</p></div>
<script>
(() => {
  let nextId = 1;
  const pending = new Map();
  const send = (message) => window.parent.postMessage({ jsonrpc: '2.0', ...message }, '*');
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    send({ id, method, params });
  });
  const notify = (method, params) => send({ method, params });

  const singular = { ideas: 'idea', issues: 'issue', proposals: 'proposal', releases: 'release', posts: 'post', showcase: 'showcase post' };
  const kindOf = (p) => p.type === 'project' ? 'project' : (p.type === 'issue' || p.type === 'proposal') ? p.type : (singular[p.board] || 'post');
  // A preview: code blocks out, links as their text, no Markdown marks.
  const plain = (text) => String(text || '').replace(/\`\`\`[\\s\\S]*?\`\`\`/g, '[code]').replace(/!?\\[([^\\]]*)\\]\\([^)]*\\)/g, '$1').replace(/[*_\`>#]+/g, '').replace(/\\s+/g, ' ').trim();
  const el = (tag, className, text) => { const n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; };

  function resize() {
    notify('ui/notifications/size-changed', { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight });
  }

  function render(mentions) {
    const root = document.getElementById('root');
    root.replaceChildren();
    if (!Array.isArray(mentions) || mentions.length === 0) { root.append(el('p', 'empty', 'No posts.')); return resize(); }
    if (mentions[0].note) root.append(el('p', 'note', mentions[0].note));
    const cards = el('div', 'cards');
    for (const m of mentions) {
      const p = m.post || m;
      const card = el('div', 'card');
      const where = el('div', 'where');
      where.append(el('span', 'brand', 'Weave'), el('span', '', kindOf(p) + (p.space ? ' in ' + p.space.name : '')));
      if (p.issue && p.issue.status) where.append(el('span', 'tag', p.issue.status));
      card.append(where, el('div', 'title', p.title));
      const text = plain(p.text);
      if (text) card.append(el('div', 'text', text.length > 220 ? text.slice(0, 220) + '…' : text));
      const foot = el('div', 'foot');
      const by = p.by ? (p.by.name || 'someone') + (p.by.agent ? ' · ' + p.by.agent : '') : '';
      foot.append(el('span', 'meta', [by, '▲ ' + (p.score || 0), (p.chat || 0) + ' in chat'].filter(Boolean).join(' · ')));
      const status = el('span', 'status');
      const open = el('button', 'primary', 'Open in Weave');
      open.onclick = () => request('tools/call', { name: 'weave_open_in_app', arguments: { what: 'post', post: p.id } })
        .then(() => { status.textContent = 'Opened in Weave.'; }, () => { status.textContent = 'Weave isn\\'t reachable from here.'; });
      const page = el('button', '', 'Show page');
      page.onclick = () => request('ui/open-link', { url: p.url }).catch(() => { status.textContent = p.url; });
      foot.append(status, page, open);
      card.append(foot);
      cards.append(card);
    }
    root.append(cards);
    resize();
  }

  function fromResult(result) {
    if (result && result.structuredContent && result.structuredContent.posts) return result.structuredContent.posts;
    const text = result && Array.isArray(result.content) ? result.content.find((c) => c.type === 'text') : undefined;
    try { return text ? JSON.parse(text.text) : []; } catch { return []; }
  }

  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const msg = event.data;
    if (!msg || msg.jsonrpc !== '2.0') return;
    if (msg.id !== undefined && pending.has(msg.id) && !msg.method) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      return msg.error ? reject(msg.error) : resolve(msg.result);
    }
    if (msg.method === 'ui/notifications/tool-result') return render(fromResult(msg.params));
    if (msg.method === 'ui/notifications/host-context-changed' && msg.params && msg.params.theme) document.documentElement.dataset.theme = msg.params.theme;
    if (msg.method === 'ui/resource-teardown' && msg.id !== undefined) send({ id: msg.id, result: {} });
  });

  request('ui/initialize', { appInfo: { name: 'weave-post-cards', version: '1' }, appCapabilities: {}, protocolVersion: '2025-06-18' })
    .then((result) => {
      const theme = result && result.hostContext && result.hostContext.theme;
      if (theme) document.documentElement.dataset.theme = theme;
      notify('ui/notifications/initialized', {});
    })
    .catch(() => {});
  new ResizeObserver(resize).observe(document.body);
})();
</script>
</body>
</html>
`;
