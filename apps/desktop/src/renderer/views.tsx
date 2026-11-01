import { useState, type FormEvent, type ReactNode } from 'react';
import type { MembershipRequestInfo, PermissionRequest } from '@weave/node/client';
import { PermissionCard } from './agents.tsx';
import type { Actor, Admission, BoardInfo, CoauthorRequest, CommunityInfo, FeedItem, GranteeInfo, KnockInfo, MemberInfo, PostInfo, Profile, ProjectInfo, ProjectStatus, Social, SpaceInfo, Theme } from '@weave/node/client';
import { ChatView } from './chat.tsx';
import { TEXT_LIMITS } from '@weave/core/limits';
import { ImagePicker, RichEditor } from './editor.tsx';
import { MyProjects } from './hubprojects.tsx';
import { MembershipRequestCard, MySupport, SupportBox } from './memberships.tsx';
import { Icon } from './icons.tsx';
import { ago, api, applyAppTheme, bridge, bump, navigate, shortDid, themeVars, useAction, useApi } from './lib.ts';
import { boardIcon, copy, lifetimeText, PostHeader, ruleText, ShareDialog, spaceHref, spaceLabel, startChat, SubmitDialog, VoteBox } from './posts.tsx';
import { ask, attempt, AsyncButton, Avatar, BlobImage, Markdown, Modal, ProjectIcon, Sprite, toast, WeaveMark } from './ui.tsx';
import { HubAccounts } from './accounts.tsx';
import { VisitorsSettings } from './visitors.tsx';
import { PaymentsSettings } from './treasury.tsx';
import { HubBadges } from './badges.tsx';
import { SetupPackDialog } from './packs.tsx';
import { AvatarEditor, inPhotoOrder, SpacePhotoSettings } from './avatar-editor.tsx';
import { GroupPhoto } from './avatar.tsx';
import type { Pack } from '@weave/core';

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

// ---------------------------------------------------------------- your hub (MySpace-style, in the person's theme)

function ThemeEditor({ me, onClose }: { me: Profile; onClose(): void }) {
  const [theme, setTheme] = useState<Theme>(me.theme);
  const [name, setName] = useState(me.name ?? '');
  const color = (key: 'accent' | 'background' | 'surface' | 'text', label: string) => (
    <label className="color">
      <input type="color" value={theme[key]} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} /> {label}
    </label>
  );
  return (
    <Modal title="Customize your hub" onClose={onClose}>
      <p className="small">Your theme is public: friends see your hub the way you style it.</p>
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
          <b style={{ color: 'var(--accent)' }}>{name || 'You'}</b>'s hub
        </div>
      </div>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <AsyncButton
          className="default"
          onClick={async () => {
            const saved = await attempt(() => api<Profile>('setProfile', { name, theme }), 'Your hub is updated');
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
  const [avatar, setAvatar] = useState(false);
  const [text, setText] = useState('');
  if (!p) return <Page title="Hub">{null}</Page>;
  const name = p.name ?? shortDid(p.did);
  const edge = (kind: 'follow' | 'mute' | 'block', on: boolean, label: string) => (
    <AsyncButton onClick={() => attempt(() => api('setEdge', { edge: kind, who: p.did, on }).then(bump))}>{label}</AsyncButton>
  );
  return (
    <Page title={<>{p.me ? 'My hub' : `${name}'s hub`}</>} actions={
        p.me && (
          <>
            <button onClick={() => setAvatar(true)}>Avatar…</button> <button onClick={() => setEditing(true)}>Customize…</button>
          </>
        )
      }
    >
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
            <HubAccounts profile={p} />
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
        <HubBadges did={p.did} me={p.me} name={name} />
        <SupportBox did={p.did} name={name} me={p.me} />
        {p.me && <MyProjects name={name} />}
        {!p.me && p.projects.length > 0 && (
          <section className="space-box">
            <h3>{name}'s projects</h3>
            <div className="showcase">
              {p.projects.map((project) => (
                <article className="showcase-item" key={project.id}>
                  <ProjectIcon id={project.id} icon={project.icon} size={48} />
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
      {avatar && <AvatarEditor me={p} onClose={() => setAvatar(false)} />}
    </Page>
  );
}

// ---------------------------------------------------------------- memberships

export function MembershipsView({ meDid, meName }: { meDid: string; meName?: string }) {
  return (
    <Page title={<><Icon name="star" /> Memberships</>}>
      <p className="small">Patreon-style: creators offer tiers, supporters ask to join. A tier is a group with its own chat, and creators can open projects to it. Memberships give access, never votes.</p>
      <div className="space app-boxes">
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

export function InboxView({ admissions, knocks }: { admissions: Admission[]; knocks: KnockInfo[] }) {
  const { data: requests } = useApi(() => api<MembershipRequestInfo[]>('membershipRequests'), []);
  const { data: coauthors } = useApi(() => api<CoauthorRequest[]>('coauthorRequests'), []);
  const { data: asks } = useApi(() => api<PermissionRequest[]>('permissionRequests').catch(() => []), []);
  const { data: fading } = useApi(() => api<PostInfo[]>('fading').catch(() => []), []);
  return (
    <Page title={<><Icon name="inbox" /> Inbox</>}>
      {admissions.length === 0 && knocks.length === 0 && requests?.length === 0 && coauthors?.length === 0 && asks?.length === 0 && fading?.length === 0 && <p className="empty">Nothing waiting for you.</p>}
      {(fading ?? []).map((p) => (
        <FadingCard key={p.id} post={p} />
      ))}
      {(asks ?? []).map((r) => (
        <PermissionCard key={r.id} request={r} />
      ))}
      {(coauthors ?? []).map((c) => (
        <CoauthorCard key={`${c.post.id}-${c.agent ?? ''}`} request={c} />
      ))}
      {knocks.map((k) => (
        <KnockCard key={k.id} knock={k} />
      ))}
      {(requests ?? []).map((r) => (
        <MembershipRequestCard key={r.id} request={r} />
      ))}
      {admissions.map((a) => (
        <AdmissionCard key={`${a.project.id}-${a.did}-${a.group.id}-${a.change}`} admission={a} />
      ))}
    </Page>
  );
}

/** A post of yours that others will forget soon, by the rule of its board. */
export function FadingCard({ post }: { post: PostInfo }) {
  return (
    <div className="admission window">
      <div className="window-body">
        <Icon name="clock" />
        <div className="grow">
          <a href={`#/post/${post.id}`}>“{post.title}”</a>
          {post.space && <span className="small muted"> in {post.space.name}</span>}
          <div className="small muted">{post.lifetime ? lifetimeText(post.lifetime) : ''} Keep it, and its time starts again; maintainers and moderators can also pin it to keep it for good.</div>
        </div>
        <a className="button" href={`#/post/${post.id}`}>
          Open
        </a>
        <AsyncButton className="default" onClick={() => attempt(() => api('keepPost', post.id).then(bump), `Kept “${post.title}”`)}>
          Keep
        </AsyncButton>
      </div>
    </div>
  );
}

/** A post that names you (or your agent) as co-author. */
export function CoauthorCard({ request: r }: { request: CoauthorRequest }) {
  const who = r.agent ? `your agent ${r.agent}` : 'you';
  const answer = (on: boolean) => attempt(() => api('confirmCoauthor', { post: r.post.id, on, as: r.agent }).then(bump), on ? 'Confirmed: you show as co-author' : 'Declined');
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={r.by.did} size={32} />
        <div className="grow">
          <b>{r.by.name ?? shortDid(r.by.did)}</b>
          {r.by.agent && <span className="agent-tag">{r.by.agent} · agent</span>} names {who} as co-author of{' '}
          <a href={`#/post/${r.post.id}`}>“{r.post.title}”</a>
          {r.post.space && <span className="small muted"> in {r.post.space.name}</span>}.
          <div className="small muted">Confirming signs it with {r.agent ? `${r.agent}'s key` : 'your key'}: everyone can check it was really {who}.</div>
        </div>
        <AsyncButton onClick={() => answer(false)}>Decline</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          Confirm
        </AsyncButton>
      </div>
    </div>
  );
}

/** Someone asking to join with a link that needs your OK. */
export function KnockCard({ knock: k }: { knock: KnockInfo }) {
  const name = k.name ?? shortDid(k.did);
  const answer = (accept: boolean) => attempt(() => api('answerKnock', { knock: k.id, accept }).then(bump), accept ? `${name} is in` : `Turned ${name} away`);
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={k.did} size={32} />
        <div className="grow">
          <b>{name}</b> asks to join <b>{spaceLabel(k.space)}</b> with your link.
          {k.note && <blockquote className="knock-note">{k.note}</blockquote>}
          {k.access.length > 0 && <div className="small">The link gives: {k.access.map((r) => `${r.write ? 'write' : 'read'} ${r.board}`).join(', ')}</div>}
          <div className="small muted">{ago(k.time)}</div>
        </div>
        <AsyncButton onClick={() => answer(false)}>Turn away</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          Let in
        </AsyncButton>
      </div>
    </div>
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

/**
 * A project's front page: a hero card (icon, banner, title, subtitle, votes)
 * over its boards and general chat. The card expands into the project's page.
 */
export function ProjectHome({ project, members, meDid, meName, spaces, onInvite }: { project: SpaceInfo; members: MemberInfo[]; meDid: string; meName?: string; spaces: SpaceInfo[]; onInvite(): void }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id), [project.id]);
  const [sharing, setSharing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const page = info?.page;
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
        {/* Its page's banner, or else the background of its group photo. */}
        <div className={`hero${page?.banner || project.background ? ' has-banner' : ''}${project.membersOnBanner && members.length ? ' has-members' : ''}`}>
          {(page?.banner || project.background) && <BlobImage src={(page?.banner || project.background)!} className="hero-bg" />}
          <div className="hero-art">{page?.icon ? <BlobImage src={page.icon} alt="" /> : <Sprite seed={project.id} size={88} />}</div>
          <div className="hero-text">
            <h1>{page?.title || project.name}</h1>
            <div className="hero-meta">
              {page && <span className={`tag status-${page.status}`}>{page.status}</span>} <span className="small">{members.length} participants · by {info?.founderName ?? '…'}</span>
            </div>
            {page?.subtitle ? <p className="hero-subtitle">{page.subtitle}</p> : !page?.body && info && <p className="hero-subtitle muted">No page yet{info.maintainer ? ': write one in Settings.' : '.'}</p>}
            {(page?.body || info?.maintainer) && (
              <button className="hero-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {expanded ? '▲ Back to the chat' : '▼ Project page'}
              </button>
            )}
          </div>
          {/* Its members on the banner, standing together, if those who run it want them there. */}
          {project.membersOnBanner && members.length > 0 && <GroupPhoto className="hero-group" dids={inPhotoOrder(project, members.map((m) => m.did))} poses={project.photoPoses} />}
          {info?.post && (
            <div className="banner-side">
              <VoteBox post={info.post} />
              <button onClick={() => setSharing(true)}>
                <Icon name="share" /> Share
              </button>
              <button onClick={() => attempt(() => api('save', { target: info.post!.id, mode: info.post!.saved === 'pinned' ? null : 'pinned' }).then(bump), info.post!.saved === 'pinned' ? 'Unpinned' : 'Pinned to your home')}>
                <Icon name="mapPin" /> {info.post.saved === 'pinned' ? 'Unpin' : 'Pin'}
              </button>
              <FollowSpace space={project} />
            </div>
          )}
        </div>
        {expanded ? (
          <div className="project-page pane-scroll sunken page">
            {page?.body ? <Markdown text={page.body} rich /> : <p className="small">Nothing on the page yet.</p>}
            {info?.maintainer && (
              <p className="small">
                <a href={`#/p/${project.id}/settings`}>Edit the page in Settings</a>
              </p>
            )}
          </div>
        ) : (
          <>
            {boards && (
              <nav className="board-strip">
                {boards.map((b) => (
                  <a key={b.name} className="board-chip" href={`#/p/${project.id}/b/${b.name}`} title={b.access?.read || b.access?.write ? `Limited: ${accessSummary(b)}` : undefined}>
                    <Icon name={boardIcon(b)} /> {b.title} {(b.access?.read || b.access?.write) && <Icon name="lock" />} <span className="count">{b.count}</span>
                  </a>
                ))}
              </nav>
            )}
            <ChatView space={project} channel="general" meDid={meDid} meName={meName} members={members} />
          </>
        )}
      </div>
      {sharing && info?.post && <ShareDialog post={info.post} spaces={spaces} onClose={() => setSharing(false)} />}
      {submitting && <SubmitDialog spaces={spaces} space={project.id} onClose={() => setSubmitting(false)} />}
    </section>
  );
}

type PageDraft = Pick<ProjectInfo['page'], 'title' | 'subtitle' | 'body'> & { icon: string; banner: string };

/** Maintainers write the project page: title, subtitle, icon, banner and the page itself. */
function PageEditor({ info }: { info: ProjectInfo }) {
  const saved: PageDraft = { title: info.page.title, subtitle: info.page.subtitle, body: info.page.body, icon: info.page.icon ?? '', banner: info.page.banner ?? '' };
  const [draft, setDraft] = useState<PageDraft>(saved);
  const set = (patch: Partial<PageDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const changed = (Object.keys(saved) as Array<keyof PageDraft>).some((k) => draft[k] !== saved[k]);
  const save = (patch: Partial<ProjectInfo['page']>) => attempt(() => api('setProjectPage', { project: info.id, ...patch }).then(bump), 'Page updated');
  return (
    <>
      <div className="page-fields">
        <ImagePicker label="Icon" value={draft.icon} onChange={(icon) => set({ icon })} />
        <div className="grow">
          <label htmlFor="page-title">Title</label>
          <input id="page-title" className="wide" maxLength={100} placeholder={info.name} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          <label htmlFor="page-subtitle">Subtitle</label>
          <input id="page-subtitle" className="wide" maxLength={300} placeholder="One line on what this is" value={draft.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        </div>
      </div>
      <label>Banner</label>
      <ImagePicker label="Banner" wide value={draft.banner} onChange={(banner) => set({ banner })} />
      <label>Page</label>
      <RichEditor value={draft.body} onChange={(body) => set({ body })} placeholder="What is this project? What will it become? Images welcome." minHeight={220} max={TEXT_LIMITS.page} />
      <div className="field-row">
        <label htmlFor="status">Status</label>
        <select id="status" value={info.page.status} onChange={(e) => save({ status: e.target.value as ProjectStatus })}>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
        <input id="public" type="checkbox" checked={info.page.public} onChange={(e) => save({ public: e.target.checked })} />
        <label htmlFor="public">Show the page publicly on my hub</label>
        <span className="grow" />
        <button disabled={!changed} onClick={() => setDraft(saved)}>
          Discard
        </button>
        <button className="default" disabled={!changed} onClick={() => save(draft)}>
          Save page
        </button>
      </div>
    </>
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

/* Boards from a daemon older than board access have no `access` or `canWrite`: they read as open to everyone. */

/** "everyone", or who may read / write, in a few words. */
function accessSummary(b: BoardInfo): string {
  const names = (list?: GranteeInfo[]) => (list?.length ? list.map((g) => g.name ?? 'someone').join(', ') : 'maintainers');
  if (!b.access?.read && !b.access?.write) return 'everyone';
  if (!b.access?.read) return `${names(b.access?.write)} write`;
  return `${names(b.access?.read)} read${b.access?.write ? `, ${names(b.access?.write)} write` : ''}`;
}

const granteeKey = (g: GranteeInfo) => (g.group ? `group:${g.group}` : g.person!);

/** One side (read or write) of a board's access: everyone, or a chosen list. */
function GranteePicker({ label, value, onChange, members, groups }: { label: string; value: GranteeInfo[] | null; onChange(v: GranteeInfo[] | null): void; members: MemberInfo[]; groups: ProjectInfo['groups'] }) {
  const [adding, setAdding] = useState('');
  const id = label.toLowerCase();
  const options = [
    ...groups.map((g) => ({ key: `group:${g.id}`, info: { group: g.id, name: g.name }, label: `Group: ${g.name}` })),
    ...members.filter((m) => !m.maintainer).map((m) => ({ key: m.did, info: { person: m.did, name: m.name }, label: m.name ?? shortDid(m.did) })),
  ].filter((o) => !value?.some((g) => granteeKey(g) === o.key));
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="field-row">
        <input type="radio" id={`${id}-all`} checked={value === null} onChange={() => onChange(null)} />
        <label htmlFor={`${id}-all`}>Everyone in the project</label>
      </div>
      <div className="field-row">
        <input type="radio" id={`${id}-some`} checked={value !== null} onChange={() => onChange(value ?? [])} />
        <label htmlFor={`${id}-some`}>Only the maintainers and:</label>
      </div>
      {value !== null && (
        <div className="grantees">
          {value.map((g) => (
            <span key={granteeKey(g)} className="chip">
              {g.group ? <Icon name="users" /> : <Avatar did={g.person!} size={14} />} {g.name ?? 'someone'}
              <button className="small-btn" title="Remove" onClick={() => onChange(value.filter((x) => granteeKey(x) !== granteeKey(g)))}>
                ✕
              </button>
            </span>
          ))}
          {options.length > 0 && (
            <select
              value={adding}
              aria-label={`Add to ${label}`}
              onChange={(e) => {
                const option = options.find((o) => o.key === e.target.value);
                if (option) onChange([...value, option.info]);
                setAdding('');
              }}
            >
              <option value="">Add a person or group…</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {value.length === 0 && <span className="small muted">nobody else yet</span>}
        </div>
      )}
    </fieldset>
  );
}

function BoardAccessDialog({ project, board, onClose }: { project: SpaceInfo; board: BoardInfo; onClose(): void }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: members } = useApi(() => api<MemberInfo[]>('members', project.id), [project.id]);
  const [read, setRead] = useState<GranteeInfo[] | null>(board.access?.read ?? null);
  const [write, setWrite] = useState<GranteeInfo[] | null>(board.access?.write ?? null);
  const save = async () => {
    const list = (v: GranteeInfo[] | null) => (v === null ? null : v.map(granteeKey));
    if (await attempt(() => api('setBoardAccess', { project: project.id, board: board.name, read: list(read), write: list(write) }).then(bump), 'Access saved')) onClose();
  };
  return (
    <Modal title={`Who may use “${board.title}”`} onClose={onClose} wide>
      <p className="small">Maintainers always read and write. A board only some may read gets its own key, and people who lose access can't read what comes after.</p>
      {info && members && (
        <div className="access-sides">
          <GranteePicker label="Read" value={read} onChange={setRead} members={members} groups={info.groups} />
          <GranteePicker label="Write" value={write} onChange={setWrite} members={members} groups={info.groups} />
        </div>
      )}
      <p className="small">Write means posting, voting and chatting here{board.type === 'proposals' ? ': only writers vote on proposals' : ''}.</p>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <AsyncButton className="default" onClick={save}>
          Save
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** How long a board's posts stay: days after their last activity, and a size limit; empty for no limit. */
export function BoardRuleDialog({ space, board, onClose }: { space: SpaceInfo; board: BoardInfo; onClose(): void }) {
  const [days, setDays] = useState(board.rule?.keepDays ? String(board.rule.keepDays) : '');
  const [mb, setMb] = useState(board.rule?.maxMB ? String(board.rule.maxMB) : '');
  const save = async () => {
    const value = (v: string) => (v.trim() ? Number(v) : null);
    if (await attempt(() => api('setBoardRule', { space: space.id, board: board.name, keepDays: value(days), maxMB: value(mb) }).then(bump), 'Rule saved')) onClose();
  };
  return (
    <Modal title={`How long posts stay in “${board.title}”`} onClose={onClose}>
      <div className="field-row">
        <label>
          Days after their last activity <input type="number" min={1} value={days} placeholder="for good" onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <div className="field-row">
        <label>
          At most, in all (MB) <input type="number" min={1} value={mb} placeholder="no limit" onChange={(e) => setMb(e.target.value)} />
        </label>
      </div>
      <p className="small">
        Each upvote stretches a post's time. Pinned posts, issues, proposals and releases always stay, and so does everything on the devices of whoever wrote it. A new rule
        forgets nothing for its first 14 days, and authors are told two weeks ahead.
      </p>
      <div className="buttons">
        <button onClick={onClose}>Cancel</button>
        <AsyncButton className="default" onClick={save}>
          Save
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** A community's one board: how long its posts stay. */
function CommunityRule({ community, canSet }: { community: SpaceInfo; canSet: boolean }) {
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', community.id), [community.id]);
  const [open, setOpen] = useState(false);
  const board = boards?.[0];
  if (!board) return null;
  return (
    <fieldset>
      <legend>How long posts stay</legend>
      <p className="small">{board.rule ? ruleText(board.rule) : 'Posts stay for good: there is no rule for forgetting.'}</p>
      {canSet && (
        <div className="buttons">
          <button onClick={() => setOpen(true)}>Change…</button>
        </div>
      )}
      {open && <BoardRuleDialog space={community} board={board} onClose={() => setOpen(false)} />}
    </fieldset>
  );
}

function BoardSettings({ project, boards }: { project: SpaceInfo; boards: BoardInfo[] }) {
  const add = useForm({ name: '', type: 'posts' });
  const [editing, setEditing] = useState<BoardInfo>();
  const [ruling, setRuling] = useState<BoardInfo>();
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
        <thead>
          <tr className="small muted">
            <th />
            <th>Name</th>
            <th>Who</th>
            <th>Posts stay</th>
            <th>Sort</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {boards.map((b, i) => (
            <tr key={b.name}>
              <td title={b.type}>
                <Icon name={boardIcon(b)} />
              </td>
              <td>
                <input defaultValue={b.title} aria-label={`Title of ${b.name}`} onBlur={(e) => e.target.value !== b.title && set(b.name, { title: e.target.value })} />
              </td>
              <td>
                <button className="small-btn access-btn" title="Who may read and write" onClick={() => setEditing(b)}>
                  {b.access?.read || b.access?.write ? <Icon name="lock" /> : null} {accessSummary(b)}
                </button>
              </td>
              <td>
                <button className="small-btn" title={b.rule ? ruleText(b.rule) : 'Posts stay for good'} onClick={() => setRuling(b)} disabled={b.type !== 'posts' || b.name === 'releases'}>
                  <Icon name="clock" /> {b.type !== 'posts' || b.name === 'releases' ? 'for good' : b.rule?.keepDays ? `${b.rule.keepDays} days` : b.rule?.maxMB ? `${b.rule.maxMB} MB` : 'for good'}
                </button>
              </td>
              <td>
                <select value={b.sort} aria-label="Default sort" onChange={(e) => set(b.name, { sort: e.target.value })}>
                  <option value="hot">hot</option>
                  <option value="new">new</option>
                  <option value="top">top</option>
                </select>
              </td>
              <td className="board-actions">
                <button className="small-btn" disabled={i === 0} onClick={() => move(i, -1)} title="Move up">
                  ▲
                </button>
                <button className="small-btn" disabled={i === boards.length - 1} onClick={() => move(i, 1)} title="Move down">
                  ▼
                </button>
                <button className="small-btn" title="Remove board (its posts stay in the logs)" onClick={async () => (await ask(`Remove the board “${b.title}”? Its posts stay in the logs.`, 'Remove')) && set(b.name, { on: false })}>
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
      {editing && <BoardAccessDialog project={project} board={editing} onClose={() => setEditing(undefined)} />}
      {ruling && <BoardRuleDialog space={project} board={ruling} onClose={() => setRuling(undefined)} />}
    </fieldset>
  );
}

const SETTINGS_TABS = [
  ['page', 'Page'],
  ['boards', 'Boards'],
  ['people', 'People'],
  ['payments', 'Payments'],
  ['ownership', 'Ownership'],
] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number][0];

/** A project's settings, one tab at a time (#/p/<id>/settings/<tab>): its page, boards, people (and what newcomers read), payments, ownership. */
export function ProjectSettings({ project, spaces, members, meDid, tab: asked }: { project: SpaceInfo; spaces: SpaceInfo[]; members: MemberInfo[]; meDid: string; tab?: string }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: admissions } = useApi(() => api<Admission[]>('admissions', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id), [project.id]);
  if (!info) return <Page title="Settings">{null}</Page>;
  const waiting = info.maintainer ? (admissions?.length ?? 0) : 0;
  const tabs = SETTINGS_TABS.filter(([key]) => key !== 'boards' || info.maintainer);
  const tab: SettingsTab = tabs.find(([key]) => key === asked)?.[0] ?? (waiting ? 'people' : 'page');
  return (
    <Page title={<><Icon name="gear" /> Settings · p/{info.name}</>}>
      <menu role="tablist">
        {tabs.map(([key, label]) => (
          <li key={key} role="tab" aria-selected={tab === key}>
            <a href={`#/p/${project.id}/settings/${key}`}>
              {label}
              {key === 'people' && waiting > 0 && <span className="count"> {waiting}</span>}
            </a>
          </li>
        ))}
      </menu>
      {tab === 'page' && (
        <fieldset>
          <legend>Page</legend>
          {info.maintainer ? (
            <PageEditor key={JSON.stringify(info.page)} info={info} />
          ) : info.page.body ? (
            <Markdown text={info.page.body} rich />
          ) : (
            <p className="small">No page yet.</p>
          )}
          <p className="small muted">Chat, boards and votes always stay among participants{info.page.public ? '; the title, subtitle and icon are public' : ''}.</p>
        </fieldset>
      )}
      {tab === 'boards' && boards && <BoardSettings project={project} boards={boards} />}
      {tab === 'people' && (
        <>
          <PeopleSettings project={project} info={info} spaces={spaces} members={members} meDid={meDid} admissions={info.maintainer ? (admissions ?? []) : []} />
          <SpacePhotoSettings space={project} members={members} canSet={info.maintainer} />
          <NewcomerHistory space={project} canSet={info.maintainer} />
          <VisitorsSettings space={project} canSet={info.maintainer} />
        </>
      )}
      {tab === 'payments' && <PaymentsSettings project={project} spaces={spaces} />}
      {tab === 'ownership' && <SpaceOwnership space={project} members={members} meDid={meDid} canClose={info.maintainer} />}
    </Page>
  );
}

/** Who takes part: requests waiting, maintainers, and groups invited in. */
function PeopleSettings({ project, info, spaces, members, meDid, admissions }: { project: SpaceInfo; info: ProjectInfo; spaces: SpaceInfo[]; members: MemberInfo[]; meDid: string; admissions: Admission[] }) {
  const [inviting, setInviting] = useState('');
  const myGroups = spaces.filter((s) => s.kind === 'group' && !info.groups.some((g) => g.id === s.id));
  return (
    <>
      {admissions.length > 0 && (
        <fieldset>
          <legend>Waiting for you</legend>
          {admissions.map((a) => (
            <AdmissionCard key={`${a.did}-${a.group.id}-${a.change}`} admission={a} />
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>Participants</legend>
        <table className="people-table">
          <tbody>
            {members.map((m) => (
              <tr key={m.did}>
                <td>
                  <Avatar did={m.did} size={16} />
                </td>
                <td className="grow">
                  {m.name ?? shortDid(m.did)}
                  {m.did === meDid && <span className="muted"> (you)</span>}
                  {m.via && <span className="small muted"> · via {m.via.name}</span>}
                </td>
                <td>{m.did === info.founder ? <span className="tag">owner</span> : m.maintainer && <span className="tag">maintainer</span>}</td>
                <td>
                  {info.maintainer && m.did !== info.founder && (
                    <AsyncButton className="small-btn" onClick={() => attempt(() => api('setMaintainer', { project: project.id, who: m.did, on: !m.maintainer }).then(bump))}>
                      {m.maintainer ? 'Drop maintainer' : 'Make maintainer'}
                    </AsyncButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">Maintainers decide who takes part, keep the boards and pin posts.</p>
      </fieldset>
      <fieldset>
        <legend>Groups</legend>
        {info.groups.map((g) => {
          const id = `auto-${g.id}`;
          return (
            <div className="field-row" key={g.id}>
              <Icon name="users" /> <b className="grow">{g.name}</b>
              {info.maintainer ? (
                <>
                  <input id={id} type="checkbox" checked={g.auto} onChange={(e) => attempt(() => api('setRule', { project: project.id, group: g.id, auto: e.target.checked }).then(bump))} />
                  <label htmlFor={id}>admit its newcomers automatically</label>
                </>
              ) : (
                <span className="small">{g.auto ? 'newcomers admitted automatically' : 'newcomers are asked about'}</span>
              )}
            </div>
          );
        })}
        {info.groups.length === 0 && <p className="small muted">No groups invited. Invite one and all its members take part.</p>}
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
              Invite
            </AsyncButton>
          </div>
        )}
      </fieldset>
    </>
  );
}

// ---------------------------------------------------------------- what newcomers read

const HISTORY_CHOICES: Array<{ value: SpaceInfo['history']; label: string; detail: string }> = [
  { value: 'all', label: 'Everything', detail: 'Newcomers read all of its history, as everyone before them.' },
  { value: '30d', label: 'The last 30 days', detail: 'Newcomers read about the last month. Its key changes every month for that.' },
  { value: 'joining', label: 'From their invite on', detail: 'Each invite comes with a new key: newcomers read only what is written after it.' },
];

/** What newcomers get to read; whoever manages the space decides, everyone sees it. */
export function NewcomerHistory({ space, canSet }: { space: SpaceInfo; canSet: boolean }) {
  const word = KIND_WORD[space.kind];
  const set = (history: SpaceInfo['history']) =>
    attempt(() => api('setHistory', { space: space.id, history }).then(bump), `Newcomers to ${space.name} read ${HISTORY_CHOICES.find((c) => c.value === history)!.label.toLowerCase()}`);
  return (
    <fieldset>
      <legend>What newcomers read</legend>
      {HISTORY_CHOICES.map((c) => (
        <div key={c.value} className="field-row">
          <input id={`history-${space.id}-${c.value}`} type="radio" name={`history-${space.id}`} checked={space.history === c.value} disabled={!canSet} onChange={() => void set(c.value)} />
          <label htmlFor={`history-${space.id}-${c.value}`}>
            <span>
              <b>{c.label}</b>
              <span className="small"> · {c.detail}</span>
            </span>
          </label>
        </div>
      ))}
      <p className="small">
        {canSet
          ? `Either way they see who is in this ${word}, its roles${space.kind === 'project' ? ', boards and page' : ''}. Members who are in already keep everything.`
          : `Set by the ${space.kind === 'project' ? 'maintainers' : space.kind === 'community' ? 'moderators' : 'owner'}.`}
      </p>
    </fieldset>
  );
}

// ---------------------------------------------------------------- leaving, handing over, closing

const KIND_WORD = { group: 'group', project: 'project', community: 'community', direct: 'chat' } as const;

/** Leave a space, hand it over (owner), or close and reopen it (owner, maintainers). */
export function SpaceOwnership({ space, members, meDid, canClose }: { space: SpaceInfo; members: MemberInfo[]; meDid: string; canClose: boolean }) {
  const [to, setTo] = useState('');
  const owner = space.founder === meDid;
  const others = members.filter((m) => m.did !== meDid);
  const word = KIND_WORD[space.kind];
  const leave = async () => {
    if (!(await ask(`Leave ${space.name}? You stop receiving it, and its key rotates without you. You can come back with a new invite.`, 'Leave'))) return;
    if (await attempt(() => api('leave', space.id), `You left ${space.name}`)) {
      bump();
      navigate('#/');
    }
  };
  const handOver = async () => {
    const person = others.find((m) => m.did === to);
    if (!person) return;
    const name = person.name ?? shortDid(person.did);
    if (await ask(`Make ${name} the owner of ${space.name}? You stay in it${space.kind === 'group' ? '' : ` as a ${space.kind === 'community' ? 'moderator' : 'maintainer'}`}; only ${name} can hand it on again.`, 'Hand over')) {
      await attempt(() => api('handOver', { space: space.id, to: person.did }).then(bump), `${name} owns ${space.name} now`);
      setTo('');
    }
  };
  const close = async (closed: boolean) => {
    if (closed && !(await ask(`Close ${space.name}? Everything in it is kept and stays readable, but nobody can write or invite until it's opened again.`, 'Close'))) return;
    await attempt(() => api('closeSpace', { space: space.id, closed }).then(bump), closed ? `${space.name} is closed` : `${space.name} is open again`);
  };
  return (
    <fieldset>
      <legend>Leave, hand over or close</legend>
      {space.closed && (
        <p className="notice">
          <Icon name="lock" /> This {word} is closed: kept as it is, read-only.
        </p>
      )}
      <p className="small">
        Owner: <b>{owner ? 'you' : (members.find((m) => m.did === space.founder)?.name ?? shortDid(space.founder))}</b>
      </p>
      {owner ? (
        <>
          <div className="field-row">
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="New owner" disabled={!others.length}>
              <option value="">{others.length ? 'Hand over to…' : `Nobody else is in this ${word}`}</option>
              {others.map((m) => (
                <option key={m.did} value={m.did}>
                  {m.name ?? shortDid(m.did)}
                </option>
              ))}
            </select>
            <button onClick={() => void handOver()} disabled={!to}>
              Hand over
            </button>
          </div>
          <p className="small">To leave, hand it over first{others.length ? '' : ', or close it'}.</p>
        </>
      ) : (
        <div className="field-row">
          <AsyncButton onClick={leave}>Leave {space.name}…</AsyncButton>
        </div>
      )}
      {canClose && (
        <div className="field-row">
          {space.closed ? <AsyncButton onClick={() => close(false)}>Open it again</AsyncButton> : <AsyncButton onClick={() => close(true)}>Close {space.name}…</AsyncButton>}
          <span className="small">Closing keeps everything; nothing new can be written.</span>
        </div>
      )}
    </fieldset>
  );
}

/** A group's settings: who owns it, leaving and closing. */
export function GroupSettings({ group, members, meDid }: { group: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  return (
    <Page title={<><Icon name="gear" /> Settings · g/{group.name}</>}>
      <SpacePhotoSettings space={group} members={members} canSet={group.founder === meDid} />
      <NewcomerHistory space={group} canSet={group.founder === meDid} />
      <VisitorsSettings space={group} canSet={group.founder === meDid} />
      <SpaceOwnership space={group} members={members} meDid={meDid} canClose={group.founder === meDid} />
    </Page>
  );
}

// ---------------------------------------------------------------- communities

/** The top-level switch for a project or community: followed ones are on Home and tell you about new posts. */
function FollowSpace({ space }: { space: SpaceInfo }) {
  const on = !space.hiddenFromHome;
  const what = space.kind === 'project' ? 'the boards you follow here' : 'its posts';
  return (
    <button
      className={on ? 'chosen' : ''}
      title={on ? `On your Home with ${what}, and new ones notify you. Click to unfollow.` : `Follow to bring ${what} to your Home and get notified`}
      onClick={() => attempt(() => api('setHomeVisibility', { space: space.id, visible: !on }).then(bump), on ? `Unfollowed ${space.name}` : `Following ${space.name}`)}
    >
      {on ? '✓ Following' : 'Follow'}
    </button>
  );
}

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
        <FollowSpace space={community} />
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
      <CommunityRule community={community} canSet={info.moderator} />
      <SpacePhotoSettings space={community} members={members} canSet={info.moderator} />
      <NewcomerHistory space={community} canSet={info.moderator} />
      <VisitorsSettings space={community} canSet={info.moderator} />
      <SpaceOwnership space={community} members={members} meDid={meDid} canClose={info.moderator} />
    </Page>
  );
}

// ---------------------------------------------------------------- dialogs and entry screens

export function NewDialog({ onClose }: { onClose(): void }) {
  const [tab, setTab] = useState<'project' | 'community' | 'group' | 'join'>('project');
  const form = useForm({ name: '', description: '', invite: '', note: '' });
  // A new project can be set up at once with a pack (GitHub for it, say): walked through right after it's made.
  const { data: packs } = useApi(() => api<Pack[]>('setupPacks').catch(() => [] as Pack[]), []);
  const [withPack, setWithPack] = useState<string>();
  const [packFor, setPackFor] = useState<{ project: SpaceInfo; pack: Pack }>();
  const go = (space?: SpaceInfo) => {
    if (!space) return;
    onClose();
    bump();
    navigate(spaceHref(space));
  };
  const create = async (e: FormEvent) => {
    e.preventDefault();
    const { name, description, invite } = form.values;
    if (tab === 'project') {
      const made = await attempt(() => api<ProjectInfo>('createProject', { name, description }), `Created p/${name}`);
      const pack = packs?.find((p) => p.name === withPack);
      if (made && pack) {
        bump();
        navigate(spaceHref(made));
        return setPackFor({ project: made, pack });
      }
      go(made);
    }
    if (tab === 'community') go(await attempt(() => api<CommunityInfo>('createCommunity', { name, description }), `Created r/${name}`));
    if (tab === 'group') go(await attempt(() => api<SpaceInfo>('createGroup', name), `Created g/${name}`));
    if (tab === 'join') {
      const space = await attempt(() => api<SpaceInfo>('joinSpace', invite.trim(), form.values.note || undefined));
      if (space?.waiting) {
        toast(`Asked to join ${spaceLabel(space)}: you're in once they let you in`);
        onClose();
        return;
      }
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
    join: 'Paste an invite link someone sent you. Some links ask the person who sent them to let you in first.',
  }[tab];
  if (packFor) return <SetupPackDialog project={packFor.project} pack={packFor.pack} onClose={onClose} />;
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
            <>
              <textarea required rows={4} className="wide" placeholder="weave:invite:… or weave:knock:…" {...form.field('invite')} />
              {form.values.invite.trim().startsWith('weave:knock:') && (
                <div className="field-row-stacked">
                  <label htmlFor="join-note">This link asks the inviter first. A note for them (optional)</label>
                  <input id="join-note" maxLength={500} placeholder="Hi, it's me from…" {...form.field('note')} />
                </div>
              )}
            </>
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
              {tab === 'project' &&
                (packs ?? []).map((p) => (
                  <div className="field-row" key={p.name}>
                    <input type="checkbox" id={`new-pack-${p.name}`} checked={withPack === p.name} onChange={(e) => setWithPack(e.target.checked ? p.name : undefined)} />
                    <label htmlFor={`new-pack-${p.name}`}>
                      {p.title} <span className="small muted">(set up right after: {p.steps.length} steps)</span>
                    </label>
                  </div>
                ))}
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
  const [accept, setAccept] = useState(false);
  const [days, setDays] = useState(7);
  const [rights, setRights] = useState<Record<string, 'none' | 'read' | 'write'>>({});
  const [link, setLink] = useState<string>();
  const { data: boards } = useApi(() => (space.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space.id]);
  const limited = (boards ?? []).filter((b) => b.access?.read || b.access?.write);
  const create = async () => {
    const access = Object.entries(rights)
      .filter(([, r]) => r !== 'none')
      .map(([board, r]) => ({ board, read: true, ...(r === 'write' ? { write: true } : {}) }));
    setLink(await attempt(() => api<string>('invite', space.id, days * 24, { accept, access })));
  };
  return (
    <Modal title={`Invite someone to ${spaceLabel(space)}`} onClose={onClose}>
      {link ? (
        <>
          <p className="small">
            {accept
              ? 'Whoever has this link can ask to join. You decide in your Inbox, and only then do they get the keys.'
              : `Send this link privately. Whoever has it can join and read ${space.name}, so treat it like a key.`}{' '}
            It expires in {days} day{days === 1 ? '' : 's'}.
          </p>
          <textarea className="wide invite" readOnly rows={5} value={link} />
          <CopyButtons text={link} what="Invite link" onClose={onClose} />
        </>
      ) : (
        <div className="form">
          <div className="field-row">
            <input type="radio" id="invite-open" checked={!accept} onChange={() => setAccept(false)} />
            <label htmlFor="invite-open">Whoever has the link joins right away</label>
          </div>
          <div className="field-row">
            <input type="radio" id="invite-accept" checked={accept} onChange={() => setAccept(true)} />
            <label htmlFor="invite-accept">People ask, I let them in (the link carries no keys)</label>
          </div>
          {limited.length > 0 && (
            <fieldset>
              <legend>Limited boards</legend>
              {limited.map((b) => (
                <div className="field-row" key={b.name}>
                  <span className="grow">
                    <Icon name={boardIcon(b)} /> {b.title}
                  </span>
                  <select value={rights[b.name] ?? 'none'} aria-label={`Access to ${b.title}`} onChange={(e) => setRights((r) => ({ ...r, [b.name]: e.target.value as 'none' | 'read' | 'write' }))}>
                    <option value="none">{b.access?.read ? 'no access' : 'read only, like everyone'}</option>
                    {b.access?.read && <option value="read">may read</option>}
                    <option value="write">{b.access?.read ? 'may read and write' : 'may write'}</option>
                  </select>
                </div>
              ))}
            </fieldset>
          )}
          <div className="field-row">
            <label htmlFor="invite-days">Expires after</label>
            <select id="invite-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              <option value={1}>1 day</option>
              <option value={7}>7 days</option>
              <option value={30}>30 days</option>
            </select>
          </div>
          <div className="buttons">
            <button onClick={onClose}>Cancel</button>
            <AsyncButton className="default" onClick={create}>
              Create link
            </AsyncButton>
          </div>
        </div>
      )}
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

export function NotConnected({ home, error, onRetry }: { home: string; error?: string; onRetry(): void }) {
  const [busy, setBusy] = useState<'retry' | 'restart'>();
  const again = async (restart: boolean) => {
    setBusy(restart ? 'restart' : 'retry');
    try {
      await bridge.reconnect?.(restart);
    } finally {
      setBusy(undefined);
      onRetry();
    }
  };
  return (
    <div className="desktop">
      <div className="window welcome">
        <div className="title-bar">
          <div className="title-bar-text">Weave</div>
        </div>
        <div className="window-body">
          <p>⚠ Can't reach your node. The Weave daemon for {home} isn't running and couldn't be started.</p>
          {error && <p className="note">{error}</p>}
          <div className="buttons">
            <button className="default" disabled={!!busy} onClick={() => void again(false)}>
              {busy === 'retry' ? 'Trying…' : 'Try again'}
            </button>
            {bridge.reconnect && (
              <button disabled={!!busy} title="Stops the Weave daemon holding this home, even one that doesn't answer, and starts it again" onClick={() => void again(true)}>
                {busy === 'restart' ? 'Restarting…' : 'Restart the daemon'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

