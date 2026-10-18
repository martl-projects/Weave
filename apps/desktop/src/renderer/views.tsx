import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Actor, Admission, FeedItem, IssueInfo, MemberInfo, Profile, ProjectInfo, ProjectStatus, ProposalInfo, Social, SpaceInfo, Theme, ThreadInfo } from '@weave/node/client';
import { ago, api, applyAppTheme, bridge, bump, navigate, renderMarkdown, shortDid, themeVars, useApi } from './lib.ts';
import { attempt, AsyncButton, Avatar, Modal, toast, WeaveMark } from './ui.tsx';

const textOf = (item: FeedItem): string => {
  const body = item.body as { text?: unknown } | string | null;
  return typeof body === 'string' ? body : typeof body?.text === 'string' ? body.text : JSON.stringify(body);
};

const actorName = (a: Actor, meDid: string) => (a.did === meDid && !a.agent ? 'You' : (a.name ?? shortDid(a.did)));

function Markdown({ text }: { text: string }) {
  const html = useMemo(() => renderMarkdown(text), [text]);
  return <div className="md" dangerouslySetInnerHTML={{ __html: html }} />;
}

function Page({ title, subtitle, actions, children }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  return (
    <div className="page">
      <header className="page-head">
        <div>
          <h1>{title}</h1>
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
      {children}
    </div>
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

// ---------------------------------------------------------------- posts

function PostCard({ item, meDid, inSpace }: { item: FeedItem; meDid: string; inSpace?: boolean }) {
  return (
    <article className="card post">
      <a href={`#/space/${encodeURIComponent(item.author)}`}>
        <Avatar did={item.author} name={item.authorName} />
      </a>
      <div className="post-main">
        <div className="post-meta">
          <a className="name" href={`#/space/${encodeURIComponent(item.author)}`}>
            {item.author === meDid && !item.signerName ? 'You' : (item.authorName ?? shortDid(item.author))}
          </a>
          {item.signerName && <span className="agent-tag">{item.signerName} · AGENT</span>}
          {item.space && !inSpace && (
            <a className="badge group" href={`#/${item.space.kind === 'project' ? 'p' : 'g'}/${item.space.id}`}>
              {item.space.name}
            </a>
          )}
          <time>{ago(item.time)}</time>
        </div>
        <Markdown text={textOf(item)} />
      </div>
    </article>
  );
}

function PostComposer({ spaces, spaceId }: { spaces: SpaceInfo[]; spaceId?: string }) {
  const { values, field, reset } = useForm({ text: '', space: spaceId ?? '' });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.text.trim()) return;
    const done = await attempt(() => api('publish', { kind: 'weave.post', body: { text: values.text }, space: values.space || undefined }));
    if (done) reset();
  };
  return (
    <form className="card composer-card" onSubmit={submit}>
      <textarea rows={2} placeholder="Share what you're working on…" {...field('text')} />
      <div className="row">
        {spaceId ? (
          <span className="muted small">Only participants can read it.</span>
        ) : (
          <select {...field('space')}>
            <option value="">Everyone (public)</option>
            {spaces.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name} (members only)
              </option>
            ))}
          </select>
        )}
        <button className="btn primary">Post</button>
      </div>
    </form>
  );
}

export function FeedView({ spaces, meDid }: { spaces: SpaceInfo[]; meDid: string }) {
  const { data } = useApi(() => api<FeedItem[]>('feed', { kinds: ['weave.post'], limit: 100 }), []);
  return (
    <Page title="Feed" subtitle="Public posts from people you're connected with, and the posts in your projects and groups.">
      <PostComposer spaces={spaces} />
      <section className="stream">
        {[...(data ?? [])].reverse().map((item) => <PostCard key={item.id} item={item} meDid={meDid} />)}
        {data?.length === 0 && <p className="empty">Nothing here yet. Post something, or join a project or group with an invite link.</p>}
      </section>
    </Page>
  );
}

export function ProjectUpdates({ project, spaces, meDid }: { project: SpaceInfo; spaces: SpaceInfo[]; meDid: string }) {
  const { data } = useApi(() => api<FeedItem[]>('feed', { space: project.id, kinds: ['weave.post'], limit: 200 }), [project.id]);
  return (
    <Page title="Updates" subtitle="Progress and show-offs, for everyone taking part.">
      <PostComposer spaces={spaces} spaceId={project.id} />
      <section className="stream">
        {[...(data ?? [])].reverse().map((item) => <PostCard key={item.id} item={item} meDid={meDid} inSpace />)}
        {data?.length === 0 && <p className="empty">No posts yet.</p>}
      </section>
    </Page>
  );
}

// ---------------------------------------------------------------- spaces

function ThemeEditor({ me, onClose }: { me: Profile; onClose(): void }) {
  const [theme, setTheme] = useState<Theme>(me.theme);
  const [name, setName] = useState(me.name ?? '');
  const update = (patch: Partial<Theme>) => {
    const next = { ...theme, ...patch };
    setTheme(next);
    applyAppTheme(next); // live preview
  };
  const close = () => {
    applyAppTheme(me.theme);
    onClose();
  };
  const color = (key: 'accent' | 'background' | 'surface' | 'text', label: string) => (
    <label className="color">
      {label}
      <input type="color" value={theme[key]} onChange={(e) => update({ [key]: e.target.value })} />
    </label>
  );
  return (
    <Modal onClose={close}>
      <h3>Customize your space</h3>
      <p className="muted small">Your theme is public: friends see your space the way you style it.</p>
      <label className="field">
        Name
        <input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </label>
      <div className="colors">
        {color('accent', 'Accent')}
        {color('background', 'Background')}
        {color('surface', 'Cards')}
        {color('text', 'Text')}
      </div>
      <div className="two">
        <label className="field">
          Font
          <select value={theme.font} onChange={(e) => update({ font: e.target.value as Theme['font'] })}>
            {['sans', 'serif', 'mono', 'rounded'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        </label>
        <label className="field">
          Background
          <select value={theme.pattern} onChange={(e) => update({ pattern: e.target.value as Theme['pattern'] })}>
            {['none', 'weave', 'dots', 'glow'].map((p) => (
              <option key={p}>{p}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="row end">
        <button className="btn ghost" onClick={close}>
          Cancel
        </button>
        <AsyncButton
          className="btn primary"
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

export function SpaceView({ who, spaces, meDid }: { who?: string; spaces: SpaceInfo[]; meDid: string }) {
  const profile = useApi(() => api<Profile>('profile', who), [who]);
  const p = profile.data;
  const posts = useApi(() => (p ? api<FeedItem[]>('feed', { author: p.did, publicOnly: true, kinds: ['weave.post'], limit: 100 }) : Promise.resolve([])), [p?.did]);
  const [editing, setEditing] = useState(false);
  if (!p) return <div className="page" />;
  const name = p.name ?? shortDid(p.did);
  const edge = (kind: 'follow' | 'mute' | 'block', on: boolean, label: string, className = 'btn ghost') => (
    <AsyncButton className={className} onClick={() => attempt(() => api('setEdge', { edge: kind, who: p.did, on }).then(bump))}>
      {label}
    </AsyncButton>
  );
  return (
    <div className="space" style={p.me ? undefined : (themeVars(p.theme) as React.CSSProperties)} data-pattern={p.me ? undefined : p.theme.pattern}>
      <header className="space-head">
        <Avatar did={p.did} name={p.name} size={84} />
        <div className="space-id">
          <h1>{name}</h1>
          <button className="did" title="Copy identity" onClick={() => navigator.clipboard.writeText(p.did).then(() => toast('Copied'))}>
            {p.did}
          </button>
          <div className="badges">
            {p.following && p.followsMe && <span className="badge friend">Friend</span>}
            {!p.me && p.followsMe && !p.following && <span className="badge">Follows you</span>}
            {p.blocked && <span className="badge warn">Blocked</span>}
            {p.muted && <span className="badge">Muted</span>}
            <span className="muted small">
              {p.posts} public post{p.posts === 1 ? '' : 's'}
            </span>
          </div>
        </div>
        <div className="space-actions">
          {p.me ? (
            <button className="btn" onClick={() => setEditing(true)}>
              Customize your space
            </button>
          ) : (
            <>
              {edge('follow', !p.following, p.following ? 'Unfollow' : 'Follow', p.following ? 'btn' : 'btn primary')}
              {edge('mute', !p.muted, p.muted ? 'Unmute' : 'Mute')}
              {edge('block', !p.blocked, p.blocked ? 'Unblock' : 'Block', 'btn ghost danger')}
            </>
          )}
        </div>
      </header>
      {p.projects.length > 0 && (
        <section className="showcase">
          <h3>Projects</h3>
          <div className="project-cards">
            {p.projects.map((project) => (
              <article className="card project-card" key={project.id}>
                <div className="row">
                  <h4>{project.name}</h4>
                  <span className={`badge status-${project.status}`}>{project.status}</span>
                </div>
                {project.description && <Markdown text={project.description} />}
              </article>
            ))}
          </div>
        </section>
      )}
      {p.me && <PostComposer spaces={spaces} />}
      <section className="stream">
        {[...(posts.data ?? [])].reverse().map((item) => <PostCard key={item.id} item={item} meDid={meDid} />)}
        {posts.data?.length === 0 && <p className="empty">{p.me ? 'Your public posts show up here.' : `${name} hasn't posted publicly yet.`}</p>}
      </section>
      {editing && <ThemeEditor me={p} onClose={() => setEditing(false)} />}
    </div>
  );
}

// ---------------------------------------------------------------- people

export function PeopleView() {
  const social = useApi(() => api<Social>('social'), []);
  const everyone = useApi(() => api<Profile[]>('directory'), []);
  const s = social.data;
  return (
    <Page title="People" subtitle="Everyone whose profile reached you. A friend is someone you follow who follows you back.">
      {s && (
        <div className="stats">
          <div>
            <b>{s.friends.length}</b>
            <span>friends</span>
          </div>
          <div>
            <b>{s.following.length}</b>
            <span>following</span>
          </div>
          <div>
            <b>{s.followers.length}</b>
            <span>followers</span>
          </div>
          <div>
            <b>{s.blocked.length + s.muted.length}</b>
            <span>blocked or muted</span>
          </div>
        </div>
      )}
      <section className="card people">
        {(everyone.data ?? []).map((p) => (
          <div className="person" key={p.did}>
            <a href={`#/space/${encodeURIComponent(p.did)}`}>
              <Avatar did={p.did} name={p.name} />
            </a>
            <div className="person-main">
              <a className="name" href={`#/space/${encodeURIComponent(p.did)}`}>
                {p.name ?? shortDid(p.did)}
              </a>
              <div className="badges">
                {p.following && p.followsMe ? <span className="badge friend">Friend</span> : p.followsMe ? <span className="badge">Follows you</span> : p.following ? <span className="badge">Following</span> : null}
                {p.blocked && <span className="badge warn">Blocked</span>}
                {p.muted && <span className="badge">Muted</span>}
              </div>
            </div>
            <AsyncButton className={`btn small${p.following ? '' : ' primary'}`} onClick={() => attempt(() => api('setEdge', { edge: 'follow', who: p.did, on: !p.following }).then(bump))}>
              {p.following ? 'Unfollow' : 'Follow'}
            </AsyncButton>
          </div>
        ))}
        {everyone.data?.length === 0 && <p className="empty">Nobody yet. Join a project or group to meet people.</p>}
      </section>
    </Page>
  );
}

// ---------------------------------------------------------------- discussion

export function DiscussionView({ project, threadId, meDid }: { project: SpaceInfo; threadId?: string; meDid: string }) {
  const { data: threads } = useApi(() => api<ThreadInfo[]>('threads', project.id), [project.id]);
  const start = useForm({ title: '', text: '' });
  const reply = useForm({ text: '' });
  const thread = threadId ? threads?.find((t) => t.id === threadId) : undefined;

  if (threadId) {
    if (!thread) return <Page title="Discussion">{threads && <p className="empty">This discussion isn't here (yet).</p>}</Page>;
    const entry = (by: Actor, text: string, time: string, key: string, lead = false) => (
      <div className={`card entry${lead ? ' lead' : ''}`} key={key}>
        <Avatar did={by.did} name={by.name} size={34} />
        <div className="post-main">
          <div className="post-meta">
            <span className="name">{actorName(by, meDid)}</span>
            {by.agent && <span className="agent-tag">{by.agent} · AGENT</span>}
            <time>{ago(time)}</time>
          </div>
          <Markdown text={text} />
        </div>
      </div>
    );
    return (
      <Page title={thread.title} subtitle={<a href={`#/p/${project.id}/discussion`}>← All discussions</a>}>
        <section className="stream">
          {entry(thread.by, thread.text || '_(no details)_', thread.time, thread.id, true)}
          {thread.replies.map((r) => entry(r.by, r.text, r.time, r.id))}
        </section>
        <form
          className="card composer-card"
          onSubmit={async (e) => {
            e.preventDefault();
            if (!reply.values.text.trim()) return;
            if (await attempt(() => api('reply', { target: thread.id, text: reply.values.text }))) reply.reset();
          }}
        >
          <textarea rows={2} placeholder="Reply…" {...reply.field('text')} />
          <div className="row end">
            <button className="btn primary">Reply</button>
          </div>
        </form>
      </Page>
    );
  }

  return (
    <Page title="Discussion" subtitle="Longer conversations that need a decision or some thought.">
      <form
        className="card composer-card"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!start.values.title.trim()) return;
          const t = await attempt(() => api<ThreadInfo>('startThread', { project: project.id, ...start.values }));
          if (t) navigate(`#/p/${project.id}/discussion/${t.id}`);
        }}
      >
        <input placeholder="Start a discussion: what should we decide or figure out?" maxLength={200} {...start.field('title')} />
        <textarea rows={2} placeholder="Details (optional)" {...start.field('text')} />
        <div className="row end">
          <button className="btn primary">Start discussion</button>
        </div>
      </form>
      <section className="stream">
        {(threads ?? []).map((t) => (
          <a className="card thread-card" key={t.id} href={`#/p/${project.id}/discussion/${t.id}`}>
            <h3>{t.title}</h3>
            <p className="muted small">
              {actorName(t.by, meDid)}
              {t.by.agent ? ` · ${t.by.agent}` : ''} · {t.replies.length} repl{t.replies.length === 1 ? 'y' : 'ies'} · active {ago(t.active)}
            </p>
          </a>
        ))}
        {threads?.length === 0 && <p className="empty">No discussions yet.</p>}
      </section>
    </Page>
  );
}

// ---------------------------------------------------------------- votes

export function VotesView({ project, members, meDid }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: proposals } = useApi(() => api<ProposalInfo[]>('proposals', project.id), [project.id]);
  const { data: delegate } = useApi(() => api<Actor | null>('votingDelegate', project.id), [project.id]);
  const form = useForm({ title: '', text: '', hours: '72' });
  return (
    <Page title="Votes" subtitle="One vote per participant. If you don't vote, your vote can follow someone you trust.">
      <div className="split">
        <div>
          <form
            className="card composer-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!form.values.title.trim()) return;
              if (await attempt(() => api('propose', { project: project.id, title: form.values.title, text: form.values.text, hours: Number(form.values.hours) }))) form.reset();
            }}
          >
            <input placeholder="Propose something to decide together" maxLength={200} {...form.field('title')} />
            <textarea rows={2} placeholder="Why? What changes if it passes?" {...form.field('text')} />
            <div className="row">
              <select {...form.field('hours')}>
                <option value="24">Vote for 1 day</option>
                <option value="72">Vote for 3 days</option>
                <option value="168">Vote for a week</option>
              </select>
              <button className="btn primary">Put to a vote</button>
            </div>
          </form>
          <section className="stream">
            {(proposals ?? []).map((p) => {
              const total = Math.max(1, p.yes + p.no + p.abstain);
              const vote = (choice: 'yes' | 'no' | 'abstain', label: string) => (
                <AsyncButton
                  className={`btn small vote-${choice}${p.myVote?.choice === choice && !p.myVote.via ? ' chosen' : ''}`}
                  onClick={() => attempt(() => api('vote', { proposal: p.id, choice }).then(bump))}
                >
                  {label}
                </AsyncButton>
              );
              return (
                <article className="card proposal" key={p.id}>
                  <div className="row">
                    <h3>{p.title}</h3>
                    {p.closed ? <span className={`badge ${p.passed ? 'friend' : 'warn'}`}>{p.passed ? 'Passed' : 'Not passed'}</span> : <span className="muted small">open until {new Date(p.deadline).toLocaleString()}</span>}
                  </div>
                  {p.text && <Markdown text={p.text} />}
                  <div className="tally">
                    <span className="yes" style={{ width: `${(p.yes / total) * 100}%` }} />
                    <span className="no" style={{ width: `${(p.no / total) * 100}%` }} />
                    <span className="abstain" style={{ width: `${(p.abstain / total) * 100}%` }} />
                  </div>
                  <p className="muted small">
                    Yes {p.yes} · No {p.no} · Abstain {p.abstain} · {p.voted} of {p.eligible} counted · quorum {p.quorum} {p.quorumReached ? '✓' : ''} · proposed by {actorName(p.by, meDid)}
                  </p>
                  <div className="row">
                    <span className="muted small">
                      {p.myVote ? (
                        <>
                          Your vote: <b>{p.myVote.choice}</b>
                          {p.myVote.via ? ` (via ${p.myVote.via.name ?? 'someone'})` : ''}
                        </>
                      ) : (
                        'You have not voted.'
                      )}
                    </span>
                    {!p.closed && (
                      <span className="vote-buttons">
                        {vote('yes', 'Yes')}
                        {vote('no', 'No')}
                        {vote('abstain', 'Abstain')}
                      </span>
                    )}
                  </div>
                </article>
              );
            })}
            {proposals?.length === 0 && <p className="empty">No proposals yet.</p>}
          </section>
        </div>
        <aside className="card">
          <h3>Delegation</h3>
          <p className="muted small">When you don't vote, your vote can follow someone you trust in this project. Voting yourself always wins.</p>
          <select
            value={delegate?.did ?? ''}
            onChange={(e) => attempt(() => api('delegateVote', { project: project.id, who: e.target.value || undefined }).then(bump), e.target.value ? 'Delegation saved' : 'You vote only for yourself now')}
          >
            <option value="">Only I vote for me</option>
            {members
              .filter((m) => m.did !== meDid)
              .map((m) => (
                <option key={m.did} value={m.did}>
                  Follow {m.name ?? shortDid(m.did)}
                </option>
              ))}
          </select>
        </aside>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- issues

export function IssuesView({ project, meDid }: { project: SpaceInfo; meDid: string }) {
  const { data: issues } = useApi(() => api<IssueInfo[]>('issues', project.id), [project.id]);
  const form = useForm({ title: '', labels: '' });
  const column = (title: string, statuses: string[]) => {
    const list = (issues ?? []).filter((i) => statuses.includes(i.status));
    return (
      <div className="column">
        <h3>
          {title} <span className="muted">{list.length}</span>
        </h3>
        {list.map((i) => (
          <article className="card issue" key={i.id}>
            <h4>{i.title}</h4>
            {i.labels.length > 0 && (
              <div className="badges">
                {i.labels.map((l) => (
                  <span className="badge" key={l}>
                    {l}
                  </span>
                ))}
              </div>
            )}
            <p className="muted small">{i.assignee ? `→ ${actorName(i.assignee, meDid)}${i.assignee.agent ? ` · ${i.assignee.agent}` : ''}` : 'Nobody on it yet'}</p>
            <div className="row">
              {!(i.assignee?.did === meDid && !i.assignee.agent) && i.status !== 'done' && i.status !== 'closed' && (
                <AsyncButton className="btn small" onClick={() => attempt(() => api('claimIssue', { issue: i.id }).then(bump), "It's yours")}>
                  Take it
                </AsyncButton>
              )}
              <select value={i.status} onChange={(e) => attempt(() => api('setIssueStatus', { issue: i.id, status: e.target.value }).then(bump))}>
                {['open', 'in-progress', 'done', 'closed'].map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
            </div>
          </article>
        ))}
      </div>
    );
  };
  return (
    <Page title="Issues" subtitle="What needs doing, and who (or which agent) is on it.">
      <form
        className="card composer-card inline"
        onSubmit={async (e) => {
          e.preventDefault();
          if (!form.values.title.trim()) return;
          const labels = form.values.labels.split(',').map((l) => l.trim()).filter(Boolean);
          if (await attempt(() => api('openIssue', { project: project.id, title: form.values.title, labels }))) form.reset();
        }}
      >
        <input placeholder="What needs doing?" maxLength={200} {...form.field('title')} />
        <input placeholder="labels, comma separated" {...form.field('labels')} />
        <button className="btn primary">Open issue</button>
      </form>
      <div className="board">
        {column('Open', ['open'])}
        {column('In progress', ['in-progress'])}
        {column('Done', ['done', 'closed'])}
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- dialogs and entry screens

export function NewDialog({ onClose }: { onClose(): void }) {
  const project = useForm({ name: '', description: '' });
  const group = useForm({ name: '' });
  const join = useForm({ invite: '' });
  const go = (space?: SpaceInfo) => {
    if (!space) return;
    onClose();
    navigate(`#/${space.kind === 'project' ? 'p' : 'g'}/${space.id}`);
  };
  return (
    <Modal onClose={onClose} wide>
      <h3>Start something</h3>
      <p className="muted small">
        A <b>project</b> is something you build together: chat, discussion, votes, issues and a page. A <b>group</b> is a circle of people with its own chat,
        which you can invite into projects as a whole. Both are end-to-end encrypted.
      </p>
      <div className="three">
        <form
          className="card form"
          onSubmit={async (e) => {
            e.preventDefault();
            go(await attempt(() => api<ProjectInfo>('createProject', project.values), `Created ${project.values.name}`));
          }}
        >
          <h4>🛠️ New project</h4>
          <input required maxLength={40} placeholder="e.g. Modular synth case" {...project.field('name')} />
          <textarea rows={2} placeholder="What are you building? (optional)" {...project.field('description')} />
          <button className="btn primary">Create project</button>
        </form>
        <form
          className="card form"
          onSubmit={async (e) => {
            e.preventDefault();
            go(await attempt(() => api<SpaceInfo>('createGroup', group.values.name), `Created ${group.values.name}`));
          }}
        >
          <h4>👥 New group</h4>
          <input required maxLength={40} placeholder="e.g. Synth friends" {...group.field('name')} />
          <button className="btn primary">Create group</button>
        </form>
        <form
          className="card form"
          onSubmit={async (e) => {
            e.preventDefault();
            const space = await attempt(() => api<SpaceInfo>('joinSpace', join.values.invite));
            if (space) toast(`Joined ${space.name}`);
            go(space);
          }}
        >
          <h4>🔗 Join with a link</h4>
          <textarea required rows={3} placeholder="weave:invite:…" {...join.field('invite')} />
          <button className="btn primary">Join</button>
        </form>
      </div>
    </Modal>
  );
}

export function InviteDialog({ space, onClose }: { space: SpaceInfo; onClose(): void }) {
  const { data: link, error } = useApi(() => api<string>('invite', space.id), [space.id]);
  return (
    <Modal onClose={onClose}>
      <h3>Invite someone to {space.name}</h3>
      {error ? (
        <p className="muted">{error}</p>
      ) : (
        <>
          <p className="muted small">Send this link privately. Whoever has it can join and read {space.name}, so treat it like a key. It expires in 7 days.</p>
          <textarea className="invite" readOnly rows={5} value={link ?? 'Creating invite…'} />
        </>
      )}
      <div className="row end">
        <button className="btn ghost" onClick={onClose}>
          Close
        </button>
        <button className="btn primary" disabled={!link} onClick={() => navigator.clipboard.writeText(link!).then(() => toast('Invite link copied'))}>
          Copy link
        </button>
      </div>
    </Modal>
  );
}

/** Asking a project's maintainers about group newcomers (and those who left). */
export function AdmissionCard({ admission }: { admission: Admission }) {
  const [always, setAlways] = useState(false);
  const a = admission;
  const name = a.name ?? shortDid(a.did);
  if (a.change === 'leave') {
    return (
      <div className="admission">
        <Avatar did={a.did} name={a.name} size={34} />
        <div className="admission-text">
          <b>{name}</b> left group <b>{a.group.name}</b>. Remove them from <b>{a.project.name}</b>? The project key rotates.
        </div>
        <AsyncButton className="btn small danger" onClick={() => attempt(() => api('removeMember', a.project.id, a.did).then(bump), `Removed ${name}`)}>
          Remove
        </AsyncButton>
      </div>
    );
  }
  return (
    <div className="admission">
      <Avatar did={a.did} name={a.name} size={34} />
      <div className="admission-text">
        <b>{name}</b> from group <b>{a.group.name}</b> wants into <b>{a.project.name}</b>.
        <label className="check">
          <input type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} /> Allow automatically for all projects with group “{a.group.name}”
        </label>
      </div>
      <AsyncButton className="btn small" onClick={() => attempt(() => api('decline', { project: a.project.id, who: a.did, group: a.group.id }).then(bump))}>
        Decline
      </AsyncButton>
      <AsyncButton className="btn small primary" onClick={() => attempt(() => api('admit', { project: a.project.id, who: a.did, group: a.group.id, always }).then(bump), `${name} is in`)}>
        Allow
      </AsyncButton>
    </div>
  );
}

const STATUSES: ProjectStatus[] = ['idea', 'active', 'paused', 'shipped', 'archived'];

export function ProjectPageView({ project, spaces, members, meDid }: { project: SpaceInfo; spaces: SpaceInfo[]; members: MemberInfo[]; meDid: string }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: admissions } = useApi(() => api<Admission[]>('admissions', project.id), [project.id]);
  const [description, setDescription] = useState<string>();
  const [inviting, setInviting] = useState('');
  if (!info) return <div className="page" />;
  const myGroups = spaces.filter((s) => s.kind === 'group' && !info.groups.some((g) => g.id === s.id));
  const save = (patch: Partial<ProjectInfo['page']>) => attempt(() => api('setProjectPage', { project: project.id, ...patch }).then(bump), 'Page updated');
  return (
    <Page title={info.name} subtitle={<span className={`badge status-${info.page.status}`}>{info.page.status}</span>}>
      {info.maintainer && (admissions?.length ?? 0) > 0 && (
        <section className="card admissions">
          <h3>Waiting for you</h3>
          {admissions!.map((a) => (
            <AdmissionCard key={`${a.did}-${a.group.id}-${a.change}`} admission={a} />
          ))}
        </section>
      )}
      <section className="card">
        <h3>About</h3>
        {info.maintainer ? (
          <>
            <textarea rows={4} value={description ?? info.page.description} placeholder="What is this project? What will it become?" onChange={(e) => setDescription(e.target.value)} />
            <div className="row">
              <select value={info.page.status} onChange={(e) => save({ status: e.target.value as ProjectStatus })}>
                {STATUSES.map((s) => (
                  <option key={s}>{s}</option>
                ))}
              </select>
              <label className="check">
                <input type="checkbox" checked={info.page.public} onChange={(e) => save({ public: e.target.checked })} /> Show this page publicly in my space
              </label>
              <button className="btn primary" disabled={description === undefined || description === info.page.description} onClick={() => save({ description }).then(() => setDescription(undefined))}>
                Save
              </button>
            </div>
          </>
        ) : info.page.description ? (
          <Markdown text={info.page.description} />
        ) : (
          <p className="muted">No description yet.</p>
        )}
        <p className="muted small">Chat, discussion, votes and issues always stay among participants{info.page.public ? '; this page is public' : ''}.</p>
      </section>
      <div className="two">
        <section className="card">
          <h3>Groups</h3>
          {info.groups.map((g) => (
            <div className="row line" key={g.id}>
              <span>👥 {g.name}</span>
              {info.maintainer ? (
                <label className="check small">
                  <input type="checkbox" checked={g.auto} onChange={(e) => attempt(() => api('setRule', { project: project.id, group: g.id, auto: e.target.checked }).then(bump))} /> admit newcomers automatically
                </label>
              ) : (
                <span className="muted small">{g.auto ? 'newcomers admitted automatically' : 'newcomers are asked about'}</span>
              )}
            </div>
          ))}
          {info.groups.length === 0 && <p className="muted small">No groups invited yet.</p>}
          {info.maintainer && myGroups.length > 0 && (
            <div className="row">
              <select value={inviting} onChange={(e) => setInviting(e.target.value)}>
                <option value="">Invite one of your groups…</option>
                {myGroups.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name}
                  </option>
                ))}
              </select>
              <AsyncButton
                className="btn small primary"
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
        </section>
        <section className="card">
          <h3>Maintainers</h3>
          <p className="muted small">Maintainers decide who takes part: they invite, admit and remove, and set rules for groups.</p>
          {members.map((m) => (
            <div className="row line" key={m.did}>
              <span>
                {m.name ?? shortDid(m.did)}
                {m.did === meDid ? ' (you)' : ''} {m.maintainer && <span className="badge">maintainer</span>}
              </span>
              {info.maintainer && m.did !== info.founder && (
                <AsyncButton className="btn small ghost" onClick={() => attempt(() => api('setMaintainer', { project: project.id, who: m.did, on: !m.maintainer }).then(bump))}>
                  {m.maintainer ? 'Remove as maintainer' : 'Make maintainer'}
                </AsyncButton>
              )}
            </div>
          ))}
        </section>
      </div>
    </Page>
  );
}

export function Onboarding({ onDone }: { onDone(): void }) {
  const [name, setName] = useState('');
  return (
    <div className="onboarding">
      <form
        className="card form welcome"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await attempt(() => bridge.init(name).then(() => true))) onDone();
        }}
      >
        <WeaveMark size={48} />
        <h1>Welcome to Weave</h1>
        <p className="muted">Your space, your keys, your friends. Your identity is created on this computer and never leaves it.</p>
        <label className="field">
          What should people call you?
          <input required maxLength={40} autoFocus placeholder="Your name" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="btn primary">Create my space</button>
      </form>
    </div>
  );
}

export function NotConnected({ home, onRetry }: { home: string; onRetry(): void }) {
  return (
    <div className="onboarding">
      <div className="card welcome">
        <h1>Can't reach your node</h1>
        <p className="muted">The Weave daemon for {home} isn't running and couldn't be started.</p>
        <button className="btn primary" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}
