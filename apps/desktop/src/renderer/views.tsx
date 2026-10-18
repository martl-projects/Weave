import { useState, type FormEvent, type ReactNode } from 'react';
import type { MembershipRequestInfo } from '@weave/node/client';
import type { Actor, Admission, BoardInfo, CommunityInfo, FeedItem, MemberInfo, PostInfo, Profile, ProjectInfo, ProjectStatus, Social, SpaceInfo, Theme } from '@weave/node/client';
import { ChatView } from './chat.tsx';
import { MembershipRequestCard, MySupport, SupportBox } from './memberships.tsx';
import { Icon } from './icons.tsx';
import { ago, api, applyAppTheme, bridge, bump, navigate, shortDid, themeVars, useApi } from './lib.ts';
import { boardIcon, copy, PostHeader, ShareDialog, spaceHref, spaceLabel, startChat, SubmitDialog, VoteBox } from './posts.tsx';
import { attempt, AsyncButton, Avatar, Markdown, Modal, Sprite, toast, WeaveMark } from './ui.tsx';

const textOf = (item: FeedItem): string => {
  const body = item.body as { text?: unknown; title?: unknown } | string | null;
  if (typeof body === 'string') return body;
  return [body?.title, body?.text].filter((x) => typeof x === 'string' && x).join('\n\n') || JSON.stringify(body);
};

/** A scrolling page inside the main pane, under a title bar. */
export function Page({ title, actions, children }: { title: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="pane-main">
      <header className="pane-head">
        <b>{title}</b>
        {actions && <span className="pane-tools">{actions}</span>}
      </header>
      <div className="pane-scroll sunken page">{children}</div>
    </section>
  );
}

/** Simple form state for small forms. */
function useForm<T extends Record<string, string>>(initial: T) {
  const [values, setValues] = useState(initial);
  const field = (name: keyof T) => ({
    value: values[name],
    onChange: (e: { target: { value: string } }) => setValues((v) => ({ ...v, [name]: e.target.value })),
  });
  return { values, field, reset: () => setValues(initial) };
}

// ---------------------------------------------------------------- your space (MySpace-style, in the person's theme)

function ThemeEditor({ me, onClose }: { me: Profile; onClose(): void }) {
  const [theme, setTheme] = useState<Theme>(me.theme);
  const [name, setName] = useState(me.name ?? '');
  const color = (key: 'accent' | 'background' | 'surface' | 'text', label: string) => (
    <label className="color">
      <input type="color" value={theme[key]} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} /> {label}
    </label>
  );
  return (
    <Modal title="Customize your space" onClose={onClose}>
      <p className="small">Your theme is public: friends see your space the way you style it.</p>
      <div className="field-row-stacked">
        <label htmlFor="me-name">Name</label>
        <input id="me-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset>
        <legend>Colors</legend>
        <div className="colors">
          {color('accent', 'Accent')}
          {color('background', 'Background')}
          {color('surface', 'Boxes')}
          {color('text', 'Text')}
        </div>
      </fieldset>
      <div className="field-row">
        <label htmlFor="me-font">Font</label>
        <select id="me-font" value={theme.font} onChange={(e) => setTheme({ ...theme, font: e.target.value as Theme['font'] })}>
          {['sans', 'serif', 'mono', 'rounded'].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
        <label htmlFor="me-pattern">Wallpaper</label>
        <select id="me-pattern" value={theme.pattern} onChange={(e) => setTheme({ ...theme, pattern: e.target.value as Theme['pattern'] })}>
          {['none', 'weave', 'dots', 'glow'].map((p) => (
            <option key={p}>{p}</option>
          ))}
        </select>
      </div>
      <div className="space-preview" style={themeVars(theme) as React.CSSProperties} data-pattern={theme.pattern}>
        <div className="space-box">
          <b style={{ color: 'var(--accent)' }}>{name || 'You'}</b>'s space
        </div>
      </div>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <AsyncButton
          className="default"
          onClick={async () => {
            const saved = await attempt(() => api<Profile>('setProfile', { name, theme }), 'Your space is updated');
            if (saved) {
              bump();
              onClose();
            }
          }}
        >
          Save
        </AsyncButton>
      </div>
    </Modal>
  );
}

export function SpaceView({ who, meDid }: { who?: string; meDid: string }) {
  const profile = useApi(() => api<Profile>('profile', who), [who]);
  const p = profile.data;
  const posts = useApi(() => (p ? api<FeedItem[]>('feed', { author: p.did, publicOnly: true, kinds: ['weave.post'], limit: 100 }) : Promise.resolve([])), [p?.did]);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState('');
  if (!p) return <Page title="Space">{null}</Page>;
  const name = p.name ?? shortDid(p.did);
  const edge = (kind: 'follow' | 'mute' | 'block', on: boolean, label: string) => (
    <AsyncButton onClick={() => attempt(() => api('setEdge', { edge: kind, who: p.did, on }).then(bump))}>{label}</AsyncButton>
  );
  return (
    <Page title={<>{p.me ? 'My space' : `${name}'s space`}</>} actions={p.me && <button onClick={() => setEditing(true)}>Customize…</button>}>
      <div className="space" style={themeVars(p.theme) as React.CSSProperties} data-pattern={p.theme.pattern}>
        <header className="space-box space-head">
          <Avatar did={p.did} size={96} />
          <div className="space-id">
            <h1>{name}</h1>
            <button className="did" title="Copy identity" onClick={() => copy(p.did, 'Identity copied')}>
              {p.did}
            </button>
            <div className="badges">
              {p.following && p.followsMe && <span className="tag friend">friend</span>}
              {!p.me && p.followsMe && !p.following && <span className="tag">follows you</span>}
              {p.blocked && <span className="tag rejected">blocked</span>}
              {p.muted && <span className="tag">muted</span>}
              <span className="small">
                {p.posts} public post{p.posts === 1 ? '' : 's'}
              </span>
            </div>
          </div>
          {p.me && (
            <div className="space-actions">
              <a className="button-link" href="#/keys">
                <Icon name="lock" /> Keys &amp; devices
              </a>
            </div>
          )}
          {!p.me && (
            <div className="space-actions">
              {p.following && p.followsMe && (
                <button className="default" onClick={() => startChat(p.did)}>
                  <Icon name="message" /> Message
                </button>
              )}
              {edge('follow', !p.following, p.following ? 'Unfollow' : 'Follow')}
              {edge('mute', !p.muted, p.muted ? 'Unmute' : 'Mute')}
              {edge('block', !p.blocked, p.blocked ? 'Unblock' : 'Block')}
            </div>
          )}
        </header>
        <SupportBox did={p.did} name={name} me={p.me} />
        {p.projects.length > 0 && (
          <section className="space-box">
            <h3>{name}'s projects</h3>
            <div className="showcase">
              {p.projects.map((project) => (
                <article className="showcase-item" key={project.id}>
                  <Sprite seed={project.id} size={48} />
                  <div>
                    <b>{project.name}</b> <span className={`tag status-${project.status}`}>{project.status}</span>
                    {project.description && <Markdown text={project.description} />}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        <section className="space-box">
          <h3>Posts</h3>
          {p.me && (
            <form
              className="space-compose"
              onSubmit={async (e) => {
                e.preventDefault();
                if (text.trim() && (await attempt(() => api('publish', { kind: 'weave.post', body: { text } }), 'Posted publicly'))) setText('');
              }}
            >
              <textarea rows={2} placeholder="A public note for everyone who follows you…" value={text} onChange={(e) => setText(e.target.value)} />
              <button>Post</button>
            </form>
          )}
          {[...(posts.data ?? [])].reverse().map((item) => (
            <div className="space-post" key={item.id}>
              <small>{ago(item.time)}</small>
              <Markdown text={textOf(item)} />
            </div>
          ))}
          {posts.data?.length === 0 && <p className="small">{p.me ? 'Your public posts show up here.' : `${name} hasn't posted publicly yet.`}</p>}
        </section>
      </div>
      {editing && (
        <ThemeEditor
          me={p}
          onClose={() => {
            setEditing(false);
            applyAppTheme(p.theme);
          }}
        />
      )}
    </Page>
  );
}

// ---------------------------------------------------------------- memberships

export function MembershipsView({ meDid, meName }: { meDid: string; meName?: string }) {
  return (
    <Page title={<><Icon name="star" /> Memberships</>}>
      <p className="small">Patreon-style: creators offer tiers, supporters ask to join. A tier is a group with its own chat, and creators can open projects to it. Memberships give access, never votes.</p>
      <div className="space">
        <SupportBox did={meDid} name={meName ?? 'you'} me />
        <section className="space-box">
          <h3>Supporting</h3>
          <MySupport />
        </section>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- people and inbox

/** Close, and copy a link to paste into any messenger. */
function CopyButtons({ text, what, onClose }: { text?: string; what: string; onClose(): void }) {
  return (
    <div className="buttons">
      <button onClick={onClose}>Close</button>
      <button className="default" disabled={!text} onClick={() => copy(text!, `${what} copied`)}>
        <Icon name="copy" /> Copy
      </button>
    </div>
  );
}

export function ContactDialog({ onClose }: { onClose(): void }) {
  const { data: link } = useApi(() => api<string>('contactLink'), []);
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const message = link ? `Add me on Weave${me?.name ? ` (${me.name})` : ''}: ${link}` : '';
  return (
    <Modal title="My contact link" onClose={onClose}>
      <p className="small">
        Your Weave address, like a phone number. Copy it and paste it into any chat: whoever adds it can find your node, follow you and see your public space. It holds no keys,
        and nothing private is shared until you invite them somewhere.
      </p>
      <textarea className="wide invite" readOnly rows={4} value={message || 'Making your link…'} />
      <CopyButtons text={link && message} what="Contact link" onClose={onClose} />
    </Modal>
  );
}

export function AddContactDialog({ onClose }: { onClose(): void }) {
  const [text, setText] = useState('');
  return (
    <Modal title="Add someone" onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = await attempt(() => api<Profile>('addContact', text), 'Added');
          if (p) {
            bump();
            onClose();
            navigate(`#/space/${encodeURIComponent(p.did)}`);
          }
        }}
      >
        <p className="small">Paste the contact link someone sent you, or the whole message it came in.</p>
        <textarea className="wide" required autoFocus rows={4} placeholder="Add me on Weave: weave:contact:…" value={text} onChange={(e) => setText(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default">Add</button>
        </div>
      </form>
    </Modal>
  );
}

export function PeopleView() {
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'contact' | 'add'>();
  const social = useApi(() => api<Social>('social'), []);
  const everyone = useApi(() => api<Profile[]>('directory', query || undefined), [query]);
  const s = social.data;
  return (
    <Page
      title={<><Icon name="users" /> People</>}
      actions={
        <>
          <button onClick={() => setDialog('add')}>
            <Icon name="userPlus" /> Add by link
          </button>
          <button onClick={() => setDialog('contact')}>
            <Icon name="share" /> My contact link
          </button>
        </>
      }
    >
      <div className="field-row search-row">
        <Icon name="search" />
        <input type="search" autoFocus placeholder="Search people by name…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search people" />
      </div>
      {s && (
        <div className="stats">
          {[
            [s.friends.length, 'friends'],
            [s.following.length, 'following'],
            [s.followers.length, 'followers'],
            [s.blocked.length + s.muted.length, 'blocked or muted'],
          ].map(([n, label]) => (
            <div className="stat sunken" key={label}>
              <b>{n}</b>
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}
      <p className="small">Everyone whose profile reached you. A friend is someone you follow who follows you back.</p>
      <div className="people">
        {(everyone.data ?? []).map((p) => (
          <div className="person" key={p.did}>
            <Avatar did={p.did} size={40} />
            <div className="grow">
              <a href={`#/space/${encodeURIComponent(p.did)}`}>
                <b>{p.name ?? shortDid(p.did)}</b>
              </a>
              <div>
                {p.following && p.followsMe ? <span className="tag friend">friend</span> : p.followsMe ? <span className="tag">follows you</span> : p.following ? <span className="tag">following</span> : null}
                {p.blocked && <span className="tag rejected">blocked</span>}
                {p.muted && <span className="tag">muted</span>}
                {p.contact && <span className="tag">in your contacts</span>}
              </div>
            </div>
            {p.following && p.followsMe && (
              <button onClick={() => startChat(p.did)}>
                <Icon name="message" /> Message
              </button>
            )}
            <AsyncButton onClick={() => attempt(() => api('setEdge', { edge: 'follow', who: p.did, on: !p.following }).then(bump))}>{p.following ? 'Unfollow' : 'Follow'}</AsyncButton>
          </div>
        ))}
        {everyone.data?.length === 0 &&
          (query ? (
            <p className="empty">
              Nobody called “{query}” has reached you yet. Ask them for their contact link and <button className="link" onClick={() => setDialog('add')}>add it</button>.
            </p>
          ) : (
            <p className="empty">Nobody yet. Send your contact link to friends, or join a community or project to meet people.</p>
          ))}
      </div>
      {dialog === 'contact' && <ContactDialog onClose={() => setDialog(undefined)} />}
      {dialog === 'add' && <AddContactDialog onClose={() => setDialog(undefined)} />}
    </Page>
  );
}

export function InboxView({ admissions }: { admissions: Admission[] }) {
  const { data: requests } = useApi(() => api<MembershipRequestInfo[]>('membershipRequests'), []);
  return (
    <Page title={<><Icon name="inbox" /> Inbox</>}>
      {admissions.length === 0 && requests?.length === 0 && <p className="empty">Nothing waiting for you.</p>}
      {(requests ?? []).map((r) => (
        <MembershipRequestCard key={r.id} request={r} />
      ))}
      {admissions.map((a) => (
        <AdmissionCard key={`${a.project.id}-${a.did}-${a.group.id}-${a.change}`} admission={a} />
      ))}
    </Page>
  );
}

/** Asking a project's maintainers about group newcomers (and those who left). */
export function AdmissionCard({ admission }: { admission: Admission }) {
  const [always, setAlways] = useState(false);
  const a = admission;
  const name = a.name ?? shortDid(a.did);
  const id = `always-${a.project.id}-${a.did}`;
  if (a.change === 'leave') {
    return (
      <div className="admission window">
        <div className="window-body">
          <Avatar did={a.did} size={32} />
          <div className="grow">
            <b>{name}</b> left group <b>{a.group.name}</b>. Remove them from <b>{a.project.name}</b>? The project key rotates.
          </div>
          <AsyncButton onClick={() => attempt(() => api('removeMember', a.project.id, a.did).then(bump), `Removed ${name}`)}>Remove</AsyncButton>
        </div>
      </div>
    );
  }
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={a.did} size={32} />
        <div className="grow">
          Do you allow <b>{name}</b> from group <b>{a.group.name}</b> to join <b>{a.project.name}</b>?
          <div>
            <input id={id} type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
            <label htmlFor={id}>Allow for all projects with group “{a.group.name}”</label>
          </div>
        </div>
        <AsyncButton onClick={() => attempt(() => api('decline', { project: a.project.id, who: a.did, group: a.group.id }).then(bump))}>Decline</AsyncButton>
        <AsyncButton className="default" onClick={() => attempt(() => api('admit', { project: a.project.id, who: a.did, group: a.group.id, always }).then(bump), `${name} is in`)}>
          Allow
        </AsyncButton>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- projects

/** A project's front page: the project as a post, with its general chat below. */
export function ProjectHome({ project, members, meDid, meName, spaces, onInvite }: { project: SpaceInfo; members: MemberInfo[]; meDid: string; meName?: string; spaces: SpaceInfo[]; onInvite(): void }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id), [project.id]);
  const [sharing, setSharing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  return (
    <section className="pane-main">
      <header className="pane-head">
        <b>p/{project.name}</b>
        <span className="pane-tools">
          <button onClick={() => setSubmitting(true)}>
            <Icon name="pencil" /> Post
          </button>
          <button onClick={onInvite}>
            <Icon name="userPlus" /> Invite
          </button>
        </span>
      </header>
      <div className="project-split">
        <div className="banner">
          <Sprite seed={project.id} size={88} className="banner-art" />
          <div className="banner-text">
            <h1>{project.name}</h1>
            {info && <span className={`tag status-${info.page.status}`}>{info.page.status}</span>} <span className="small">{members.length} participants · by {info?.founderName ?? '…'}</span>
            {info?.page.description ? <Markdown text={info.page.description} /> : <p className="small muted">No description yet{info?.maintainer ? ': add one in Settings.' : '.'}</p>}
          </div>
          {info?.post && (
            <div className="banner-side">
              <VoteBox post={info.post} />
              <button onClick={() => setSharing(true)}>
                <Icon name="share" /> Share
              </button>
              <button onClick={() => attempt(() => api('save', { target: info.post!.id, mode: info.post!.saved === 'pinned' ? null : 'pinned' }).then(bump), info.post!.saved === 'pinned' ? 'Unpinned' : 'Pinned to your home')}>
                <Icon name="mapPin" /> {info.post.saved === 'pinned' ? 'Unpin' : 'Pin'}
              </button>
            </div>
          )}
        </div>
        {boards && (
          <nav className="board-strip">
            {boards.map((b) => (
              <a key={b.name} className="board-chip" href={`#/p/${project.id}/b/${b.name}`}>
                <Icon name={boardIcon(b)} /> {b.title} <span className="count">{b.count}</span>
              </a>
            ))}
          </nav>
        )}
        <ChatView space={project} channel="general" meDid={meDid} meName={meName} members={members} />
      </div>
      {sharing && info?.post && <ShareDialog post={info.post} spaces={spaces} onClose={() => setSharing(false)} />}
      {submitting && <SubmitDialog spaces={spaces} space={project.id} onClose={() => setSubmitting(false)} />}
    </section>
  );
}

/** Above the proposals board: whose vote counts for yours when you don't vote. */
export function DelegationBar({ project, members, meDid }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: delegate } = useApi(() => api<Actor | null>('votingDelegate', project.id), [project.id]);
  return (
    <div className="board-intro">
      <Icon name="flag" /> One vote per participant. When you don't vote, your vote can follow:{' '}
      <select
        value={delegate?.did ?? ''}
        onChange={(e) => attempt(() => api('delegateVote', { project: project.id, who: e.target.value || undefined }).then(bump), e.target.value ? 'Delegation saved' : 'You vote only for yourself now')}
      >
        <option value="">nobody (only I vote for me)</option>
        {members
          .filter((m) => m.did !== meDid)
          .map((m) => (
            <option key={m.did} value={m.did}>
              {m.name ?? shortDid(m.did)}
            </option>
          ))}
      </select>
    </div>
  );
}

const STATUSES: ProjectStatus[] = ['idea', 'active', 'paused', 'shipped', 'archived'];

function BoardSettings({ project, boards }: { project: SpaceInfo; boards: BoardInfo[] }) {
  const add = useForm({ name: '', type: 'posts' });
  const set = (name: string, patch: Record<string, unknown>) => attempt(() => api('setBoard', { project: project.id, name, ...patch }).then(bump));
  const move = (i: number, by: number) => {
    const other = boards[i + by];
    if (!other) return;
    void set(boards[i].name, { position: other.position + (by > 0 ? 0.5 : -0.5) });
  };
  return (
    <fieldset>
      <legend>Boards</legend>
      <table className="boards-table">
        <tbody>
          {boards.map((b, i) => (
            <tr key={b.name}>
              <td>
                <Icon name={boardIcon(b)} />
              </td>
              <td>
                <input defaultValue={b.title} aria-label={`Title of ${b.name}`} onBlur={(e) => e.target.value !== b.title && set(b.name, { title: e.target.value })} />
              </td>
              <td className="small">{b.type}</td>
              <td>
                <select value={b.sort} aria-label="Default sort" onChange={(e) => set(b.name, { sort: e.target.value })}>
                  <option value="hot">hot</option>
                  <option value="new">new</option>
                  <option value="top">top</option>
                </select>
              </td>
              <td>
                <button className="small-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  ▲
                </button>
                <button className="small-btn" disabled={i === boards.length - 1} onClick={() => move(i, 1)} title="Move down">
                  ▼
                </button>
                <button className="small-btn" title="Remove board (its posts stay in the logs)" onClick={() => confirm(`Remove the board “${b.title}”?`) && set(b.name, { on: false })}>
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="field-row"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          if (await attempt(() => api('setBoard', { project: project.id, name: add.values.name, title: add.values.name, type: add.values.type, position: (boards.at(-1)?.position ?? 0) + 1 }).then(bump))) add.reset();
        }}
      >
        <input placeholder="New board, e.g. Showcase" required maxLength={32} {...add.field('name')} />
        <select {...add.field('type')} aria-label="Board type">
          <option value="posts">posts</option>
          <option value="issues">issues</option>
          <option value="proposals">proposals</option>
        </select>
        <button>Add board</button>
      </form>
    </fieldset>
  );
}

export function ProjectSettings({ project, spaces, members, meDid }: { project: SpaceInfo; spaces: SpaceInfo[]; members: MemberInfo[]; meDid: string }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: admissions } = useApi(() => api<Admission[]>('admissions', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id), [project.id]);
  const [description, setDescription] = useState<string>();
  const [inviting, setInviting] = useState('');
  if (!info) return <Page title="Settings">{null}</Page>;
  const myGroups = spaces.filter((s) => s.kind === 'group' && !info.groups.some((g) => g.id === s.id));
  const save = (patch: Partial<ProjectInfo['page']>) => attempt(() => api('setProjectPage', { project: project.id, ...patch }).then(bump), 'Page updated');
  return (
    <Page title={<><Icon name="gear" /> Settings · p/{info.name}</>}>
      {info.maintainer && (admissions?.length ?? 0) > 0 && (
        <fieldset>
          <legend>Waiting for you</legend>
          {admissions!.map((a) => (
            <AdmissionCard key={`${a.did}-${a.group.id}-${a.change}`} admission={a} />
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>About</legend>
        {info.maintainer ? (
          <>
            <textarea rows={4} className="wide" value={description ?? info.page.description} placeholder="What is this project? What will it become?" onChange={(e) => setDescription(e.target.value)} />
            <div className="field-row">
              <label htmlFor="status">Status</label>
              <select id="status" value={info.page.status} onChange={(e) => save({ status: e.target.value as ProjectStatus })}>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <input id="public" type="checkbox" checked={info.page.public} onChange={(e) => save({ public: e.target.checked })} />
              <label htmlFor="public">Show the page publicly in my space</label>
              <span className="grow" />
              <button className="default" disabled={description === undefined || description === info.page.description} onClick={() => save({ description }).then(() => setDescription(undefined))}>
                Save
              </button>
            </div>
          </>
        ) : info.page.description ? (
          <Markdown text={info.page.description} />
        ) : (
          <p className="small">No description yet.</p>
        )}
        <p className="small">Chat, boards and votes always stay among participants{info.page.public ? '; the page is public' : ''}.</p>
      </fieldset>
      {info.maintainer && boards && <BoardSettings project={project} boards={boards} />}
      <fieldset>
        <legend>Groups</legend>
        {info.groups.map((g) => {
          const id = `auto-${g.id}`;
          return (
            <div className="field-row" key={g.id}>
              <Icon name="users" /> <b>{g.name}</b>
              {info.maintainer ? (
                <>
                  <input id={id} type="checkbox" checked={g.auto} onChange={(e) => attempt(() => api('setRule', { project: project.id, group: g.id, auto: e.target.checked }).then(bump))} />
                  <label htmlFor={id}>admit newcomers automatically</label>
                </>
              ) : (
                <span className="small">{g.auto ? 'newcomers admitted automatically' : 'newcomers are asked about'}</span>
              )}
            </div>
          );
        })}
        {info.groups.length === 0 && <p className="small">No groups invited yet.</p>}
        {info.maintainer && myGroups.length > 0 && (
          <div className="field-row">
            <select value={inviting} onChange={(e) => setInviting(e.target.value)} aria-label="Group to invite">
              <option value="">Invite one of your groups…</option>
              {myGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <AsyncButton
              onClick={async () => {
                if (!inviting) return;
                await attempt(() => api('inviteGroup', { project: project.id, group: inviting }).then(bump), 'Group invited: its members take part now');
                setInviting('');
              }}
            >
              Invite group
            </AsyncButton>
          </div>
        )}
      </fieldset>
      <fieldset>
        <legend>Maintainers</legend>
        <p className="small">Maintainers decide who takes part, keep the boards and pin posts.</p>
        {members.map((m) => (
          <div className="field-row" key={m.did}>
            <Avatar did={m.did} size={16} />
            <span className="grow">
              {m.name ?? shortDid(m.did)}
              {m.did === meDid ? ' (you)' : ''} {m.maintainer && <span className="tag">maintainer</span>}
            </span>
            {info.maintainer && m.did !== info.founder && (
              <AsyncButton onClick={() => attempt(() => api('setMaintainer', { project: project.id, who: m.did, on: !m.maintainer }).then(bump))}>{m.maintainer ? 'Drop maintainer' : 'Make maintainer'}</AsyncButton>
            )}
          </div>
        ))}
      </fieldset>
    </Page>
  );
}

// ---------------------------------------------------------------- communities

export function CommunityBanner({ community, onInvite, onSubmit }: { community: SpaceInfo; onInvite(): void; onSubmit(): void }) {
  const { data: info } = useApi(() => api<CommunityInfo>('community', community.id), [community.id]);
  return (
    <div className="banner community">
      <Sprite seed={community.id} size={64} className="banner-art" />
      <div className="banner-text">
        <h1>r/{community.name}</h1>
        <span className="small">
          {community.members} member{community.members === 1 ? '' : 's'} · moderated by {info?.moderators.map((m) => m.name ?? shortDid(m.did)).join(', ') ?? '…'}
        </span>
        {info?.description && <Markdown text={info.description} />}
      </div>
      <div className="banner-side">
        <button className="default" onClick={onSubmit}>
          <Icon name="pencil" /> Submit post
        </button>
        <button onClick={onInvite}>
          <Icon name="userPlus" /> Invite
        </button>
      </div>
    </div>
  );
}

export function CommunityAbout({ community, members, meDid }: { community: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: info } = useApi(() => api<CommunityInfo>('community', community.id), [community.id]);
  const [description, setDescription] = useState<string>();
  if (!info) return <Page title="About">{null}</Page>;
  return (
    <Page title={<><Icon name="gear" /> About r/{info.name}</>}>
      <fieldset>
        <legend>Description</legend>
        {info.moderator ? (
          <>
            <textarea className="wide" rows={4} value={description ?? info.description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this community about?" />
            <div className="buttons">
              <AsyncButton className="default" onClick={() => attempt(() => api('setCommunity', { community: community.id, description: description ?? info.description }).then(bump), 'Saved')}>
                Save
              </AsyncButton>
            </div>
          </>
        ) : info.description ? (
          <Markdown text={info.description} />
        ) : (
          <p className="small">No description yet.</p>
        )}
        <p className="small">Communities are private for now: invite-only and end-to-end encrypted. Any member can invite; moderators pin posts and remove people.</p>
      </fieldset>
      <fieldset>
        <legend>Moderators</legend>
        {members.map((m) => {
          const isMod = info.moderators.some((x) => x.did === m.did);
          return (
            <div className="field-row" key={m.did}>
              <Avatar did={m.did} size={16} />
              <span className="grow">
                {m.name ?? shortDid(m.did)}
                {m.did === meDid ? ' (you)' : ''} {isMod && <span className="tag">moderator</span>}
              </span>
              {info.moderator && m.did !== info.founder && (
                <AsyncButton onClick={() => attempt(() => api('setModerator', { community: community.id, who: m.did, on: !isMod }).then(bump))}>{isMod ? 'Drop moderator' : 'Make moderator'}</AsyncButton>
              )}
            </div>
          );
        })}
      </fieldset>
    </Page>
  );
}

// ---------------------------------------------------------------- dialogs and entry screens

export function NewDialog({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<'project' | 'community' | 'group' | 'join'>('project');
  const form = useForm({ name: '', description: '', invite: '' });
  const go = (space?: SpaceInfo) => {
    if (!space) return;
    onClose();
    bump();
    navigate(spaceHref(space));
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { name, description, invite } = form.values;
    if (tab === 'project') go(await attempt(() => api<ProjectInfo>('createProject', { name, description }), `Created p/${name}`));
    if (tab === 'community') go(await attempt(() => api<CommunityInfo>('createCommunity', { name, description }), `Created r/${name}`));
    if (tab === 'group') go(await attempt(() => api<SpaceInfo>('createGroup', name), `Created g/${name}`));
    if (tab === 'join') {
      const space = await attempt(() => api<SpaceInfo>('joinSpace', invite));
      if (space) toast(`Joined ${spaceLabel(space)}`);
      go(space);
    }
  };
  const tabs = [
    ['project', 'Project'],
    ['community', 'Community'],
    ['group', 'Group'],
    ['join', 'Join with link'],
  ] as const;
  const blurb = {
    project: 'Something you build together. It shows up as a post with its own chat, and boards for releases, ideas, issues and proposals.',
    community: 'A board of posts that people join, like a subreddit. Every post gets its own chat. Private and invite-only for now.',
    group: 'A circle of people with its own chat. You can invite a whole group into a project.',
    join: 'Paste an invite link someone sent you.',
  }[tab];
  return (
    <Modal title="New" onClose={onClose}>
      <menu role="tablist">
        {tabs.map(([key, label]) => (
          <li key={key} role="tab" aria-selected={tab === key}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setTab(key);
              }}
            >
              {label}
            </a>
          </li>
        ))}
      </menu>
      <form className="window tab-body form" role="tabpanel" onSubmit={create}>
        <div className="window-body">
          <p className="small">{blurb}</p>
          {tab === 'join' ? (
            <textarea required rows={4} className="wide" placeholder="weave:invite:…" {...form.field('invite')} />
          ) : (
            <>
              <div className="field-row-stacked">
                <label htmlFor="new-name">Name</label>
                <input id="new-name" required autoFocus maxLength={40} placeholder={{ project: 'Modular synth case', community: 'Synths', group: 'Synth friends' }[tab]} {...form.field('name')} />
              </div>
              {tab !== 'group' && (
                <div className="field-row-stacked">
                  <label htmlFor="new-description">Description (optional)</label>
                  <textarea id="new-description" rows={3} {...form.field('description')} />
                </div>
              )}
            </>
          )}
          <p className="small">
            <Icon name="lock" /> End-to-end encrypted: only the people inside can read it.
          </p>
          <div className="buttons">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="default">{tab === 'join' ? 'Join' : 'Create'}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function InviteDialog({ space, onClose }: { space: SpaceInfo; onClose(): void }) {
  const { data: link, error } = useApi(() => api<string>('invite', space.id), [space.id]);
  return (
    <Modal title={`Invite someone to ${spaceLabel(space)}`} onClose={onClose}>
      {error ? (
        <p>{error}</p>
      ) : (
        <>
          <p className="small">Send this link privately. Whoever has it can join and read {space.name}, so treat it like a key. It expires in 7 days.</p>
          <textarea className="wide invite" readOnly rows={5} value={link ?? 'Creating invite…'} />
        </>
      )}
      <CopyButtons text={link} what="Invite link" onClose={onClose} />
    </Modal>
  );
}

/** A post opened from the home feed or a link, in any space or public. */
export function LonePost({ post, meDid, spaces }: { post: PostInfo; meDid: string; spaces: SpaceInfo[] }) {
  return (
    <Page title={post.title}>
      <PostHeader post={post} meDid={meDid} spaces={spaces} />
    </Page>
  );
}

export function NotConnected({ home, onRetry }: { home: string; onRetry(): void }) {
  return (
    <div className="desktop">
      <div className="window welcome">
        <div className="title-bar">
          <div className="title-bar-text">Weave</div>
        </div>
        <div className="window-body">
          <p>⚠ Can't reach your node. The Weave daemon for {home} isn't running and couldn't be started.</p>
          <div className="buttons">
            <button className="default" onClick={onRetry}>
              Try again
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

