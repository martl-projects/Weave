import { useMemo, useState, type FormEvent, type ReactNode } from 'react';
import type { Actor, FeedItem, GroupInfo, IssueInfo, MemberInfo, Profile, ProposalInfo, Social, Theme, ThreadInfo } from '@weave/node/client';
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

function PostCard({ item, meDid, inGroup }: { item: FeedItem; meDid: string; inGroup?: boolean }) {
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
          {item.group && !inGroup && (
            <a className="badge group" href={`#/g/${item.group.id}`}>
              {item.group.name}
            </a>
          )}
          <time>{ago(item.time)}</time>
        </div>
        <Markdown text={textOf(item)} />
      </div>
    </article>
  );
}

function PostComposer({ groups, groupId }: { groups: GroupInfo[]; groupId?: string }) {
  const { values, field, reset } = useForm({ text: '', group: groupId ?? '' });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!values.text.trim()) return;
    const done = await attempt(() => api('publish', { kind: 'weave.post', body: { text: values.text }, group: values.group || undefined }));
    if (done) reset();
  };
  return (
    <form className="card composer-card" onSubmit={submit}>
      <textarea rows={2} placeholder="Share what you're working on…" {...field('text')} />
      <div className="row">
        {groupId ? (
          <span className="muted small">Only members of this group can read it.</span>
        ) : (
          <select {...field('group')}>
            <option value="">Everyone (public)</option>
            {groups.map((g) => (
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

export function FeedView({ groups, meDid }: { groups: GroupInfo[]; meDid: string }) {
  const { data } = useApi(() => api<FeedItem[]>('feed', { kinds: ['weave.post'], limit: 100 }), []);
  return (
    <Page title="Feed" subtitle="Public posts from people you're connected with, and the posts in your groups.">
      <PostComposer groups={groups} />
      <section className="stream">
        {[...(data ?? [])].reverse().map((item) => <PostCard key={item.id} item={item} meDid={meDid} />)}
        {data?.length === 0 && <p className="empty">Nothing here yet. Post something, or join a group with an invite link.</p>}
      </section>
    </Page>
  );
}

export function GroupPosts({ group, groups, meDid }: { group: GroupInfo; groups: GroupInfo[]; meDid: string }) {
  const { data } = useApi(() => api<FeedItem[]>('feed', { group: group.id, kinds: ['weave.post'], limit: 200 }), [group.id]);
  return (
    <Page title="Posts" subtitle="Updates and show-offs, for members of this group.">
      <PostComposer groups={groups} groupId={group.id} />
      <section className="stream">
        {[...(data ?? [])].reverse().map((item) => <PostCard key={item.id} item={item} meDid={meDid} inGroup />)}
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

export function SpaceView({ who, groups, meDid }: { who?: string; groups: GroupInfo[]; meDid: string }) {
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
      {p.me && <PostComposer groups={groups} />}
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
        {everyone.data?.length === 0 && <p className="empty">Nobody yet. Join a group to meet people.</p>}
      </section>
    </Page>
  );
}

// ---------------------------------------------------------------- discussion

export function DiscussionView({ group, threadId, meDid }: { group: GroupInfo; threadId?: string; meDid: string }) {
  const { data: threads } = useApi(() => api<ThreadInfo[]>('threads', group.id), [group.id]);
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
      <Page title={thread.title} subtitle={<a href={`#/g/${group.id}/discussion`}>← All discussions</a>}>
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
          const t = await attempt(() => api<ThreadInfo>('startThread', { group: group.id, ...start.values }));
          if (t) navigate(`#/g/${group.id}/discussion/${t.id}`);
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
          <a className="card thread-card" key={t.id} href={`#/g/${group.id}/discussion/${t.id}`}>
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

export function VotesView({ group, members, meDid }: { group: GroupInfo; members: MemberInfo[]; meDid: string }) {
  const { data: proposals } = useApi(() => api<ProposalInfo[]>('proposals', group.id), [group.id]);
  const { data: delegate } = useApi(() => api<Actor | null>('votingDelegate', group.id), [group.id]);
  const form = useForm({ title: '', text: '', hours: '72' });
  return (
    <Page title="Votes" subtitle="One vote per member. If you don't vote, your vote can follow someone you trust.">
      <div className="split">
        <div>
          <form
            className="card composer-card"
            onSubmit={async (e) => {
              e.preventDefault();
              if (!form.values.title.trim()) return;
              if (await attempt(() => api('propose', { group: group.id, title: form.values.title, text: form.values.text, hours: Number(form.values.hours) }))) form.reset();
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
          <p className="muted small">When you don't vote, your vote can follow someone you trust in this group. Voting yourself always wins.</p>
          <select
            value={delegate?.did ?? ''}
            onChange={(e) => attempt(() => api('delegateVote', { group: group.id, who: e.target.value || undefined }).then(bump), e.target.value ? 'Delegation saved' : 'You vote only for yourself now')}
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

export function IssuesView({ group, meDid }: { group: GroupInfo; meDid: string }) {
  const { data: issues } = useApi(() => api<IssueInfo[]>('issues', group.id), [group.id]);
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
          if (await attempt(() => api('openIssue', { group: group.id, title: form.values.title, labels }))) form.reset();
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

export function GroupDialog({ onClose }: { onClose(): void }) {
  const create = useForm({ name: '' });
  const join = useForm({ invite: '' });
  return (
    <Modal onClose={onClose} wide>
      <h3>Start or join a group</h3>
      <p className="muted small">Groups are end-to-end encrypted. Only members can read what's posted in them.</p>
      <div className="two">
        <form
          className="card form"
          onSubmit={async (e) => {
            e.preventDefault();
            const g = await attempt(() => api<GroupInfo>('createGroup', create.values.name), `Created ${create.values.name}`);
            if (g) {
              onClose();
              navigate(`#/g/${g.id}`);
            }
          }}
        >
          <h4>Start a group</h4>
          <input required maxLength={40} placeholder="e.g. Synth makers" {...create.field('name')} />
          <button className="btn primary">Create group</button>
        </form>
        <form
          className="card form"
          onSubmit={async (e) => {
            e.preventDefault();
            const g = await attempt(() => api<GroupInfo>('joinGroup', join.values.invite));
            if (g) {
              toast(`Joined ${g.name}`);
              onClose();
              navigate(`#/g/${g.id}`);
            }
          }}
        >
          <h4>Join with an invite</h4>
          <textarea required rows={3} placeholder="weave:invite:…" {...join.field('invite')} />
          <button className="btn primary">Join group</button>
        </form>
      </div>
    </Modal>
  );
}

export function InviteDialog({ group, onClose }: { group: GroupInfo; onClose(): void }) {
  const { data: link } = useApi(() => api<string>('invite', group.id), [group.id]);
  return (
    <Modal onClose={onClose}>
      <h3>Invite someone to {group.name}</h3>
      <p className="muted small">Send this link privately. Whoever has it can join and read the group, so treat it like a key. It expires in 7 days.</p>
      <textarea className="invite" readOnly rows={5} value={link ?? 'Creating invite…'} />
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
