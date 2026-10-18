import type { FeedItem, GroupInfo, MemberInfo, Profile, Social, Status, Theme } from '@weave/node/client';
import { api, bridge, type AppState } from './bridge.ts';

// ---------------------------------------------------------------- helpers

const root = document.getElementById('root')!;
const modalRoot = document.getElementById('modal')!;

const esc = (value: unknown): string =>
  String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const shortDid = (did: string) => `${did.slice(8, 14)}…${did.slice(-4)}`;

function hue(did: string): number {
  let h = 0;
  for (const c of did) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

const avatar = (did: string, name?: string, size = 36) =>
  `<span class="avatar" style="--h:${hue(did)};--s:${size}px">${esc((name ?? '?').slice(0, 1).toUpperCase())}</span>`;

function ago(time: string): string {
  const s = Math.max(0, (Date.now() - Date.parse(time)) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(time).toLocaleDateString();
}

const textOf = (item: FeedItem): string => {
  const body = item.body as { text?: unknown } | string | null;
  return typeof body === 'string' ? body : typeof body?.text === 'string' ? body.text : JSON.stringify(body);
};

const FONT_STACKS: Record<Theme['font'], string> = {
  sans: "'Inter', 'Segoe UI', system-ui, sans-serif",
  serif: "'Iowan Old Style', Georgia, 'Times New Roman', serif",
  mono: "'JetBrains Mono', 'Cascadia Code', Consolas, monospace",
  rounded: "'Nunito', 'Segoe UI Rounded', 'Segoe UI', system-ui, sans-serif",
};

/** Theme values as CSS custom properties; values are already sanitized by the node. */
const themeStyle = (t: Theme) =>
  `--accent:${t.accent};--bg:${t.background};--surface:${t.surface};--text:${t.text};--font:${FONT_STACKS[t.font]}`;

function applyAppTheme(theme: Theme): void {
  document.documentElement.setAttribute('style', themeStyle(theme));
  document.documentElement.dataset.pattern = theme.pattern;
}

function toast(text: string, kind: 'ok' | 'error' = 'ok'): void {
  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  el.textContent = text;
  document.body.appendChild(el);
  setTimeout(() => el.classList.add('out'), 2600);
  setTimeout(() => el.remove(), 3000);
}

function modal(html: string): void {
  modalRoot.innerHTML = `<div class="modal-back" data-action="close-modal"></div><div class="modal">${html}</div>`;
  modalRoot.hidden = false;
}

const closeModal = () => {
  modalRoot.hidden = true;
  modalRoot.innerHTML = '';
};

// ---------------------------------------------------------------- state

let state: AppState;
let me: Profile;
let groups: GroupInfo[] = [];
let status: Status | undefined;

async function refreshBasics(): Promise<void> {
  [me, groups, status] = await Promise.all([api<Profile>('profile'), api<GroupInfo[]>('groups'), api<Status>('status')]);
  applyAppTheme(me.theme);
}

const route = () => location.hash.replace(/^#\/?/, '').split('/').filter(Boolean).map(decodeURIComponent);

// ---------------------------------------------------------------- pieces

function sidebar(active: string): string {
  const link = (href: string, label: string, key: string, extra = '') =>
    `<a class="nav-item${active === key ? ' on' : ''}" href="#/${href}">${label}${extra}</a>`;
  return `
  <aside class="sidebar">
    <a class="brand" href="#/">${weaveMark(26)}<span>Weave</span></a>
    <nav>
      ${link('', 'Feed', 'feed')}
      ${link('space', 'My space', `space:${me.did}`)}
      ${link('people', 'People', 'people')}
      <div class="nav-head">Groups <a href="#/groups" class="nav-add" title="Create or join a group">+</a></div>
      ${groups.map((g) => link(`group/${g.id}`, `<span class="hash">#</span>${esc(g.name)}`, `group:${g.id}`, `<span class="count">${g.members}</span>`)).join('')}
      ${groups.length ? '' : '<a class="nav-item muted" href="#/groups">Create or join one</a>'}
    </nav>
    <a class="me" href="#/space">
      ${avatar(me.did, me.name, 32)}
      <span><b>${esc(me.name ?? 'You')}</b><small><i class="dot ${status && status.peers > 0 ? 'on' : ''}"></i>${status ? `${status.peers} peer${status.peers === 1 ? '' : 's'}` : ''}</small></span>
    </a>
  </aside>`;
}

function composer(groupId?: string): string {
  const options = [
    `<option value="">Everyone (public)</option>`,
    ...groups.map((g) => `<option value="${esc(g.id)}" ${g.id === groupId ? 'selected' : ''}>#${esc(g.name)} (members only)</option>`),
  ].join('');
  return `
  <form class="card composer" data-form="post">
    <textarea name="text" rows="2" placeholder="Share what you're working on…" required></textarea>
    <div class="row">
      ${groupId ? `<input type="hidden" name="group" value="${esc(groupId)}"><span class="muted small">Only members of this group can read it.</span>` : `<select name="group">${options}</select>`}
      <button class="btn primary">Post</button>
    </div>
  </form>`;
}

function postCard(item: FeedItem, inGroup = false): string {
  const name = item.authorName ?? shortDid(item.author);
  return `
  <article class="card post">
    <a href="#/space/${encodeURIComponent(item.author)}">${avatar(item.author, item.authorName)}</a>
    <div class="post-main">
      <div class="post-meta">
        <a class="name" href="#/space/${encodeURIComponent(item.author)}">${esc(name)}</a>
        ${item.signerName ? `<span class="badge agent" title="Posted by ${esc(name)}'s agent">${esc(item.signerName)}</span>` : ''}
        ${item.group && !inGroup ? `<a class="badge group" href="#/group/${esc(item.group.id)}">#${esc(item.group.name)}</a>` : ''}
        <time>${ago(item.time)}</time>
      </div>
      <p>${esc(textOf(item))}</p>
    </div>
  </article>`;
}

const posts = (items: FeedItem[], empty: string, inGroup = false) =>
  items.length ? [...items].reverse().map((item) => postCard(item, inGroup)).join('') : `<p class="empty">${empty}</p>`;

// ---------------------------------------------------------------- views

async function viewFeed(): Promise<string> {
  const items = await api<FeedItem[]>('feed', { kinds: ['weave.post', 'weave.reply'], limit: 100 });
  return `
  <header class="page-head"><h1>Feed</h1><p class="muted">Public posts from people you're connected with, and everything in your groups.</p></header>
  ${composer()}
  <section class="stream">${posts(items, 'Nothing here yet. Post something, or join a group with an invite link.')}</section>`;
}

async function viewSpace(who?: string): Promise<string> {
  const profile = await api<Profile>('profile', who);
  const items = await api<FeedItem[]>('feed', { author: profile.did, publicOnly: true, kinds: ['weave.post'], limit: 100 });
  const name = profile.name ?? shortDid(profile.did);
  const badges = [
    profile.following && profile.followsMe ? '<span class="badge friend">Friend</span>' : '',
    !profile.me && profile.followsMe && !profile.following ? '<span class="badge">Follows you</span>' : '',
    profile.blocked ? '<span class="badge warn">Blocked</span>' : '',
    profile.muted ? '<span class="badge">Muted</span>' : '',
  ].join('');
  const actions = profile.me
    ? `<button class="btn" data-action="edit-theme">Customize your space</button>`
    : `
      <button class="btn ${profile.following ? '' : 'primary'}" data-action="edge" data-edge="follow" data-on="${!profile.following}" data-who="${esc(profile.did)}">${profile.following ? 'Unfollow' : 'Follow'}</button>
      <button class="btn ghost" data-action="edge" data-edge="mute" data-on="${!profile.muted}" data-who="${esc(profile.did)}">${profile.muted ? 'Unmute' : 'Mute'}</button>
      <button class="btn ghost danger" data-action="edge" data-edge="block" data-on="${!profile.blocked}" data-who="${esc(profile.did)}">${profile.blocked ? 'Unblock' : 'Block'}</button>`;

  return `
  <div class="space" ${profile.me ? '' : `style="${themeStyle(profile.theme)}"`} data-pattern="${profile.me ? '' : profile.theme.pattern}">
    <header class="space-head">
      ${avatar(profile.did, profile.name, 84)}
      <div class="space-id">
        <h1>${esc(name)}</h1>
        <button class="did" data-action="copy" data-text="${esc(profile.did)}" title="Copy identity">${esc(profile.did)}</button>
        <div class="badges">${badges}<span class="muted small">${profile.posts} public post${profile.posts === 1 ? '' : 's'}</span></div>
      </div>
      <div class="space-actions">${actions}</div>
    </header>
    ${profile.me ? composer() : ''}
    <section class="stream">${posts(items, profile.me ? 'Your public posts show up here.' : `${esc(name)} hasn't posted publicly yet.`)}</section>
  </div>`;
}

async function viewGroups(): Promise<string> {
  return `
  <header class="page-head"><h1>Groups</h1><p class="muted">Groups are end-to-end encrypted. Only members can read what's posted in them.</p></header>
  <div class="two">
    <form class="card form" data-form="create-group">
      <h3>Start a group</h3>
      <label>Name<input name="name" required maxlength="40" placeholder="e.g. Synth makers"></label>
      <button class="btn primary">Create group</button>
    </form>
    <form class="card form" data-form="join-group">
      <h3>Join with an invite</h3>
      <label>Invite link<textarea name="invite" rows="3" required placeholder="weave:invite:…"></textarea></label>
      <button class="btn primary">Join group</button>
    </form>
  </div>
  <section class="grid">
    ${groups.map((g) => `
      <a class="card group-card" href="#/group/${esc(g.id)}">
        <h3><span class="hash">#</span>${esc(g.name)}</h3>
        <p class="muted">${g.members} member${g.members === 1 ? '' : 's'} · founded by ${esc(g.founder === me.did ? 'you' : (g.founderName ?? shortDid(g.founder)))}</p>
      </a>`).join('')}
  </section>`;
}

async function viewGroup(id: string): Promise<string> {
  const group = groups.find((g) => g.id === id);
  if (!group) return `<p class="empty">You're not in this group.</p>`;
  const [items, members] = await Promise.all([
    api<FeedItem[]>('feed', { group: id, kinds: ['weave.post', 'weave.reply'], limit: 200 }),
    api<MemberInfo[]>('members', id),
  ]);
  const founder = group.founder === me.did;
  return `
  <header class="page-head row-head">
    <div><h1><span class="hash">#</span>${esc(group.name)}</h1><p class="muted">${members.length} member${members.length === 1 ? '' : 's'} · end-to-end encrypted · key epoch ${group.epoch}</p></div>
    <button class="btn primary" data-action="invite" data-group="${esc(id)}">Invite someone</button>
  </header>
  <div class="split">
    <div>${composer(id)}<section class="stream">${posts(items, 'No posts yet. Say hello!', true)}</section></div>
    <aside class="card members">
      <h3>Members</h3>
      ${members.map((m) => `
        <div class="member">
          <a href="#/space/${encodeURIComponent(m.did)}">${avatar(m.did, m.name, 30)}</a>
          <div><a class="name" href="#/space/${encodeURIComponent(m.did)}">${esc(m.did === me.did ? 'You' : (m.name ?? shortDid(m.did)))}</a>
          <small class="muted">${m.invitedBy ? `invited by ${esc(m.invitedBy === me.did ? 'you' : (m.invitedByName ?? shortDid(m.invitedBy)))}` : 'founder'}</small></div>
          ${founder && m.did !== me.did ? `<button class="btn ghost small danger" data-action="remove-member" data-group="${esc(id)}" data-who="${esc(m.did)}" data-name="${esc(m.name ?? shortDid(m.did))}">Remove</button>` : ''}
        </div>`).join('')}
    </aside>
  </div>`;
}

async function viewPeople(): Promise<string> {
  const [social, everyone] = await Promise.all([api<Social>('social'), api<Profile[]>('directory')]);
  const row = (p: Profile) => `
    <div class="person">
      <a href="#/space/${encodeURIComponent(p.did)}">${avatar(p.did, p.name, 40)}</a>
      <div class="person-main">
        <a class="name" href="#/space/${encodeURIComponent(p.did)}">${esc(p.name ?? shortDid(p.did))}</a>
        <div class="badges">
          ${p.following && p.followsMe ? '<span class="badge friend">Friend</span>' : p.followsMe ? '<span class="badge">Follows you</span>' : p.following ? '<span class="badge">Following</span>' : ''}
          ${p.blocked ? '<span class="badge warn">Blocked</span>' : ''}${p.muted ? '<span class="badge">Muted</span>' : ''}
        </div>
      </div>
      <button class="btn small ${p.following ? '' : 'primary'}" data-action="edge" data-edge="follow" data-on="${!p.following}" data-who="${esc(p.did)}">${p.following ? 'Unfollow' : 'Follow'}</button>
    </div>`;
  return `
  <header class="page-head"><h1>People</h1><p class="muted">Everyone whose profile reached you. A friend is someone you follow who follows you back.</p></header>
  <div class="stats">
    <div><b>${social.friends.length}</b><span>friends</span></div>
    <div><b>${social.following.length}</b><span>following</span></div>
    <div><b>${social.followers.length}</b><span>followers</span></div>
    <div><b>${social.blocked.length + social.muted.length}</b><span>blocked or muted</span></div>
  </div>
  <section class="card people">${everyone.map(row).join('') || '<p class="empty">Nobody yet. Join a group or a topic to meet people.</p>'}</section>`;
}

function viewOnboarding(): string {
  return `
  <div class="onboarding">
    <form class="card form welcome" data-form="init">
      ${weaveMark(48)}
      <h1>Welcome to Weave</h1>
      <p class="muted">Your space, your keys, your friends. Your identity is created on this computer and never leaves it.</p>
      <label>What should people call you?<input name="name" required maxlength="40" autofocus placeholder="Your name"></label>
      <button class="btn primary">Create my space</button>
    </form>
  </div>`;
}

function themeEditor(): void {
  const t = me.theme;
  const color = (key: keyof Theme, label: string) => `<label class="color">${label}<input type="color" name="${key}" value="${t[key]}"></label>`;
  const select = (key: 'font' | 'pattern', label: string, options: string[]) =>
    `<label>${label}<select name="${key}">${options.map((o) => `<option ${t[key] === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
  modal(`
    <form class="form" data-form="theme">
      <h3>Customize your space</h3>
      <p class="muted small">Your theme is public: friends see your space the way you style it.</p>
      <label>Name<input name="name" value="${esc(me.name ?? '')}" maxlength="40" required></label>
      <div class="colors">${color('accent', 'Accent')}${color('background', 'Background')}${color('surface', 'Cards')}${color('text', 'Text')}</div>
      <div class="two">${select('font', 'Font', ['sans', 'serif', 'mono', 'rounded'])}${select('pattern', 'Background', ['none', 'weave', 'dots', 'glow'])}</div>
      <div class="row end"><button type="button" class="btn ghost" data-action="close-modal">Cancel</button><button class="btn primary">Save</button></div>
    </form>`);
}

// ---------------------------------------------------------------- render

let rendering = false;
let again = false;

async function render(): Promise<void> {
  if (rendering) return void (again = true);
  rendering = true;
  try {
    state = await bridge.state();
    if (!state.hasIdentity) {
      root.innerHTML = viewOnboarding();
      return;
    }
    if (!state.connected) {
      root.innerHTML = `<div class="onboarding"><div class="card welcome"><h1>Can't reach your node</h1><p class="muted">The Weave daemon for ${esc(state.home)} isn't running and couldn't be started.</p><button class="btn primary" data-action="reload">Try again</button></div></div>`;
      return;
    }
    await refreshBasics();
    const [view, arg] = route();
    const content =
      view === 'space' ? await viewSpace(arg) :
      view === 'groups' ? await viewGroups() :
      view === 'group' && arg ? await viewGroup(arg) :
      view === 'people' ? await viewPeople() :
      await viewFeed();
    const active =
      view === 'space' ? `space:${arg ?? me.did}` : view === 'group' ? `group:${arg}` : view === 'people' ? 'people' : view === 'groups' ? 'groups' : 'feed';
    const scroll = document.querySelector('.content')?.scrollTop ?? 0;
    root.innerHTML = `<div class="layout">${sidebar(active)}<main class="content">${content}</main></div>`;
    document.querySelector('.content')!.scrollTop = scroll;
  } catch (error) {
    toast((error as Error).message, 'error');
  } finally {
    rendering = false;
    if (again) {
      again = false;
      void render();
    }
  }
}

let pending: ReturnType<typeof setTimeout> | undefined;
const renderSoon = () => {
  clearTimeout(pending);
  pending = setTimeout(render, 150);
};

// ---------------------------------------------------------------- events

window.addEventListener('hashchange', () => {
  void render().then(() => document.querySelector('.content')?.scrollTo(0, 0));
});

document.addEventListener('click', async (e) => {
  const el = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
  if (!el) return;
  const { action, who, group, edge, on, text, name } = el.dataset;
  try {
    switch (action) {
      case 'close-modal':
        closeModal();
        return applyAppTheme(me.theme); // drop an unsaved theme preview
      case 'reload':
        return render();
      case 'copy':
        await navigator.clipboard.writeText(text ?? '');
        return toast('Copied');
      case 'edit-theme':
        return themeEditor();
      case 'edge':
        await api('setEdge', { edge, who, on: on === 'true' });
        toast(on === 'true' ? `${edge === 'follow' ? 'Following' : edge === 'block' ? 'Blocked' : 'Muted'}` : 'Undone');
        return render();
      case 'invite': {
        const link = await api<string>('invite', group);
        return modal(`
          <h3>Invite someone</h3>
          <p class="muted small">Send this link privately. Whoever has it can join and read the group, so treat it like a key. It expires in 7 days.</p>
          <textarea class="invite" readonly rows="5">${esc(link)}</textarea>
          <div class="row end"><button class="btn ghost" data-action="close-modal">Close</button><button class="btn primary" data-action="copy" data-text="${esc(link)}">Copy link</button></div>`);
      }
      case 'remove-member':
        if (!confirm(`Remove ${name} from the group? The group key will be rotated so they can't read anything new.`)) return;
        await api('removeMember', group, who);
        toast(`Removed ${name}, key rotated`);
        return render();
    }
  } catch (error) {
    toast((error as Error).message, 'error');
  }
});

document.addEventListener('submit', async (e) => {
  const form = (e.target as HTMLElement).closest<HTMLFormElement>('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const data = Object.fromEntries(new FormData(form)) as Record<string, string>;
  const button = form.querySelector('button.primary') as HTMLButtonElement | null;
  if (button) button.disabled = true;
  try {
    switch (form.dataset.form) {
      case 'init':
        await bridge.init(data.name);
        break;
      case 'post':
        await api('publish', { kind: 'weave.post', body: { text: data.text }, group: data.group || undefined });
        break;
      case 'create-group': {
        const g = await api<GroupInfo>('createGroup', data.name);
        location.hash = `#/group/${g.id}`;
        toast(`Created #${g.name}`);
        break;
      }
      case 'join-group': {
        const g = await api<GroupInfo>('joinGroup', data.invite);
        location.hash = `#/group/${g.id}`;
        toast(`Joined #${g.name}`);
        break;
      }
      case 'theme': {
        const { name, ...theme } = data;
        await api('setProfile', { name, theme });
        closeModal();
        toast('Your space is updated');
        break;
      }
    }
    await render();
  } catch (error) {
    toast((error as Error).message, 'error');
  } finally {
    if (button) button.disabled = false;
  }
});

// Live preview while editing the theme.
document.addEventListener('input', (e) => {
  const form = (e.target as HTMLElement).closest<HTMLFormElement>('form[data-form="theme"]');
  if (!form) return;
  const data = Object.fromEntries(new FormData(form)) as unknown as Theme;
  applyAppTheme({ ...me.theme, ...data });
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && !modalRoot.hidden) {
    closeModal();
    applyAppTheme(me.theme);
  }
});

bridge.onEvent(() => renderSoon());

function weaveMark(size: number): string {
  return `
  <svg class="mark" width="${size}" height="${size}" viewBox="0 0 32 32" aria-hidden="true">
    <g fill="none" stroke-width="4.5">
      <path d="M11 4v24" stroke="var(--accent)" stroke-linecap="round"/>
      <path d="M21 4v24" stroke="#39d0b4" stroke-linecap="round"/>
      <path d="M4 11h24" stroke="var(--bg)" stroke-width="8.5"/><path d="M4 11h24" stroke="#a693ff" stroke-linecap="round"/>
      <path d="M4 21h24" stroke="var(--bg)" stroke-width="8.5"/><path d="M4 21h24" stroke="var(--accent)" stroke-linecap="round"/>
      <path d="M11 6.5v9" stroke="var(--bg)" stroke-width="8.5"/><path d="M11 6v10" stroke="var(--accent)"/>
      <path d="M21 16.5v9" stroke="var(--bg)" stroke-width="8.5"/><path d="M21 16v10" stroke="#39d0b4"/>
    </g>
  </svg>`;
}

void render();
