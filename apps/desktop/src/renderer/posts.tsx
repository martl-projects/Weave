import { useState, type FormEvent, type ReactNode } from 'react';
import type { Actor, BoardInfo, MemberInfo, PostInfo, PostsQuery, ProposalInfo, SpaceInfo, SpaceRef } from '@weave/node/client';
import { ChatView } from './chat.tsx';
import { Icon, type IconName } from './icons.tsx';
import { ago, api, bump, navigate, plain, shortDid, useApi } from './lib.ts';
import { attempt, AsyncButton, Avatar, Markdown, Modal, Sprite, toast } from './ui.tsx';

// ---------------------------------------------------------------- names and links

const PREFIX: Record<SpaceRef['kind'], string> = { community: 'r', project: 'p', group: 'g' };

export const spaceLabel = (s: Pick<SpaceRef, 'kind' | 'name'>) => `${PREFIX[s.kind]}/${s.name}`;
export const spaceHref = (s: Pick<SpaceRef, 'kind' | 'id'>) => `#/${PREFIX[s.kind]}/${s.id}`;

export function postHref(p: PostInfo): string {
  if (p.type === 'project' && p.space) return `#/p/${p.space.id}`;
  if (p.space?.kind === 'community') return `#/r/${p.space.id}/post/${p.id}`;
  if (p.space?.kind === 'project') return `#/p/${p.space.id}/b/${p.board}/${p.id}`;
  return `#/post/${p.id}`;
}

export const actorName = (a: Actor, meDid: string) => (a.did === meDid && !a.agent ? 'you' : (a.name ?? shortDid(a.did)));

const BOARD_ICONS: Record<string, IconName> = { releases: 'megaphone', ideas: 'lightbulb', issues: 'bug', proposals: 'flag', posts: 'notes' };
export const boardIcon = (b: Pick<BoardInfo, 'name' | 'type'>): IconName => BOARD_ICONS[b.name] ?? (b.type === 'issues' ? 'bug' : b.type === 'proposals' ? 'flag' : 'notes');

export const SORTS = [
  { value: 'hot', label: 'Hot', icon: 'fire' as const },
  { value: 'new', label: 'New', icon: 'clock' as const },
  { value: 'top', label: 'Top', icon: 'trophy' as const },
];

/** Remembers a sort choice per list, in this browser only. */
function useSort(key: string, fallback?: string): [string | undefined, (s: string) => void] {
  const read = () => {
    try {
      return localStorage.getItem(`weave.sort.${key}`) ?? fallback;
    } catch {
      return fallback;
    }
  };
  const [sort, setSort] = useState(read);
  return [
    sort,
    (s: string) => {
      setSort(s);
      try {
        localStorage.setItem(`weave.sort.${key}`, s);
      } catch {}
    },
  ];
}

// ---------------------------------------------------------------- votes and actions

export function VoteBox({ post, vertical = true }: { post: PostInfo; vertical?: boolean }) {
  const vote = (value: number) => attempt(() => api('upvote', { target: post.id, value: post.myVote === value ? 0 : value }).then(bump));
  return (
    <div className={`votes${vertical ? '' : ' row'}`}>
      <button className={`vote up${post.myVote > 0 ? ' on' : ''}`} title="Upvote" onClick={() => vote(1)}>
        <Icon name="arrowUp" size={20} />
      </button>
      <b className="score">{post.score}</b>
      <button className={`vote down${post.myVote < 0 ? ' on' : ''}`} title="Downvote" onClick={() => vote(-1)}>
        <Icon name="arrowDown" size={20} />
      </button>
    </div>
  );
}

function PostActions({ post, spaces, curate }: { post: PostInfo; spaces: SpaceInfo[]; curate?: Curate }) {
  const [sharing, setSharing] = useState(false);
  const save = (mode: 'saved' | 'pinned' | null, done: string) => attempt(() => api('save', { target: post.id, mode }).then(bump), done);
  return (
    <div className="post-actions">
      <a href={postHref(post)}>
        <Icon name="message" /> {post.type === 'project' ? `${post.chat} messages` : `${post.chat} in chat`}
      </a>
      <button className="link" onClick={() => setSharing(true)}>
        <Icon name="share" /> share
      </button>
      <button className="link" onClick={() => save(post.saved === 'saved' ? null : 'saved', post.saved === 'saved' ? 'Removed from saved' : 'Saved')}>
        <Icon name="bookmark" /> {post.saved === 'saved' ? 'unsave' : 'save'}
      </button>
      <button className="link" onClick={() => save(post.saved === 'pinned' ? null : 'pinned', post.saved === 'pinned' ? 'Unpinned from your home' : 'Pinned to the top of your home')}>
        <Icon name="mapPin" /> {post.saved === 'pinned' ? 'unpin from home' : 'pin to home'}
      </button>
      {curate && (
        <>
          <button className="link" onClick={() => curate.toggle(post.id)}>
            <Icon name="star" /> {post.pinned ? 'unsticky' : 'sticky'}
          </button>
          {post.pinned && (
            <>
              <button className="link" title="Move up" onClick={() => curate.move(post.id, -1)}>
                ▲
              </button>
              <button className="link" title="Move down" onClick={() => curate.move(post.id, 1)}>
                ▼
              </button>
            </>
          )}
        </>
      )}
      {sharing && <ShareDialog post={post} spaces={spaces} onClose={() => setSharing(false)} />}
    </div>
  );
}

/** Pinning and ordering posts in a board, for maintainers and moderators. */
export interface Curate {
  toggle(id: string): void;
  move(id: string, by: number): void;
}

function useCurate(space: string | undefined, board: BoardInfo | undefined, allowed: boolean): Curate | undefined {
  if (!space || !board || !allowed) return undefined;
  const set = (pinned: string[]) => attempt(() => api('curate', { space, board: board.name, pinned }).then(bump));
  return {
    toggle: (id) => set(board.pinned.includes(id) ? board.pinned.filter((p) => p !== id) : [...board.pinned, id]),
    move: (id, by) => {
      const list = [...board.pinned];
      const i = list.indexOf(id);
      const j = i + by;
      if (i < 0 || j < 0 || j >= list.length) return;
      [list[i], list[j]] = [list[j], list[i]];
      void set(list);
    },
  };
}

// ---------------------------------------------------------------- rows and lists

function Badges({ post }: { post: PostInfo }) {
  return (
    <>
      {post.pinned && <span className="tag sticky">sticky</span>}
      {post.saved === 'pinned' && <span className="tag">on your home</span>}
      {post.type === 'project' && <span className="tag project">project</span>}
      {post.project && post.type !== 'project' && <span className="tag project">project: {post.project.name}</span>}
      {post.issue && <span className={`tag status-${post.issue.status}`}>{post.issue.status}</span>}
      {post.proposal && <span className={`tag ${post.proposal.closed ? (post.proposal.passed ? 'passed' : 'rejected') : 'voting'}`}>{post.proposal.closed ? (post.proposal.passed ? 'passed' : 'not passed') : 'voting'}</span>}
    </>
  );
}

export function PostRow({ post, meDid, spaces, showWhere = true, curate }: { post: PostInfo; meDid: string; spaces: SpaceInfo[]; showWhere?: boolean; curate?: Curate }) {
  const href = postHref(post);
  return (
    <article className={`post-row${post.pinned || post.saved === 'pinned' ? ' is-pinned' : ''}`}>
      <VoteBox post={post} />
      <a className="thumb" href={href}>
        <Sprite seed={post.project?.id ?? post.id} size={64} />
      </a>
      <div className="post-body">
        <a className="post-title" href={href}>
          {post.title}
        </a>{' '}
        <Badges post={post} />
        {post.link && (
          <a className="post-link" href={post.link} title={post.link}>
            ({new URL(post.link).hostname})
          </a>
        )}
        <div className="post-meta">
          {showWhere && post.space && (
            <>
              <a className="where" href={spaceHref(post.space)}>
                {spaceLabel(post.space)}
              </a>
              {post.space.kind === 'project' && post.board && post.type !== 'project' && <span className="where">/{post.board}</span>}
              {' · '}
            </>
          )}
          <a href={`#/space/${encodeURIComponent(post.by.did)}`}>u/{post.by.name ?? shortDid(post.by.did)}</a>
          {post.by.agent && <span className="agent-tag">{post.by.agent} · agent</span>}
          {' · '}
          {ago(post.time)}
          {post.active !== post.time && <> · active {ago(post.active)}</>}
        </div>
        {post.text && <p className="excerpt">{plain(post.text).slice(0, 220)}</p>}
        <PostActions post={post} spaces={spaces} curate={curate} />
      </div>
    </article>
  );
}

/** A Reddit-style list of posts with a sort switch in its title bar. */
export function PostList({
  title,
  query,
  spaces,
  meDid,
  empty,
  board,
  canCurate = false,
  toolbar,
  above,
}: {
  title: ReactNode;
  query: PostsQuery;
  spaces: SpaceInfo[];
  meDid: string;
  empty: ReactNode;
  board?: BoardInfo;
  canCurate?: boolean;
  toolbar?: ReactNode;
  above?: ReactNode;
}) {
  const [sort, setSort] = useSort(`${query.space ?? 'home'}/${query.board ?? ''}${query.saved ? '/saved' : ''}`, board?.sort);
  const { data: posts } = useApi(() => api<PostInfo[]>('posts', { ...query, sort }), [query, sort]);
  const curate = useCurate(query.space, board, canCurate);
  return (
    <section className="pane-main">
      <header className="pane-head">
        <b>{title}</b>
        <span className="pane-tools">
          {toolbar}
          <select value={sort ?? 'hot'} onChange={(e) => setSort(e.target.value)} aria-label="Sort posts">
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </span>
      </header>
      <div className="pane-scroll sunken">
        {above}
        {(posts ?? []).map((p) => (
          <PostRow key={p.id} post={p} meDid={meDid} spaces={spaces} showWhere={!query.space} curate={curate} />
        ))}
        {posts?.length === 0 && <div className="empty">{empty}</div>}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- one post

function IssueControls({ post, meDid }: { post: PostInfo; meDid: string }) {
  const issue = post.issue!;
  const mine = issue.assignee?.did === meDid && !issue.assignee.agent;
  return (
    <fieldset className="work">
      <legend>Issue</legend>
      <span>{issue.assignee ? <>Assigned to <b>{actorName(issue.assignee, meDid)}</b>{issue.assignee.agent ? ` · ${issue.assignee.agent}` : ''}</> : 'Nobody is on it yet.'}</span>
      {issue.labels.map((l) => (
        <span key={l} className="tag">
          {l}
        </span>
      ))}
      <span className="grow" />
      {!mine && issue.status !== 'done' && issue.status !== 'closed' && (
        <AsyncButton onClick={() => attempt(() => api('claimIssue', { issue: post.id }).then(bump), "It's yours")}>Take it</AsyncButton>
      )}
      <select value={issue.status} onChange={(e) => attempt(() => api('setIssueStatus', { issue: post.id, status: e.target.value }).then(bump))}>
        {['open', 'in-progress', 'done', 'closed'].map((s) => (
          <option key={s}>{s}</option>
        ))}
      </select>
    </fieldset>
  );
}

export function Tally({ p }: { p: ProposalInfo }) {
  const total = Math.max(1, p.yes + p.no + p.abstain);
  return (
    <>
      <div className="tally sunken">
        <span className="yes" style={{ width: `${(p.yes / total) * 100}%` }} />
        <span className="no" style={{ width: `${(p.no / total) * 100}%` }} />
        <span className="abstain" style={{ width: `${(p.abstain / total) * 100}%` }} />
      </div>
      <p className="small">
        Yes {p.yes} · No {p.no} · Abstain {p.abstain} · {p.voted} of {p.eligible} counted · quorum {p.quorum} {p.quorumReached ? '✓' : ''} ·{' '}
        {p.closed ? 'closed' : `open until ${new Date(p.deadline).toLocaleString()}`}
      </p>
    </>
  );
}

function ProposalControls({ post }: { post: PostInfo }) {
  const p = post.proposal!;
  const vote = (choice: 'yes' | 'no' | 'abstain', label: string) => (
    <AsyncButton className={p.myVote?.choice === choice && !p.myVote.via ? 'chosen' : ''} onClick={() => attempt(() => api('vote', { proposal: post.id, choice }).then(bump))}>
      {label}
    </AsyncButton>
  );
  return (
    <fieldset className="work">
      <legend>Vote · one per participant</legend>
      <div className="grow">
        <Tally p={p} />
        <span className="small">
          {p.myVote ? (
            <>
              Your vote: <b>{p.myVote.choice}</b>
              {p.myVote.via ? ` (via ${p.myVote.via.name ?? 'someone'})` : ''}
            </>
          ) : (
            'You have not voted.'
          )}
        </span>
      </div>
      {!p.closed && (
        <span className="vote-buttons">
          {vote('yes', 'Yes')}
          {vote('no', 'No')}
          {vote('abstain', 'Abstain')}
        </span>
      )}
    </fieldset>
  );
}

/** A shared project: what it is, and whether you can go in. */
function ProjectCard({ post }: { post: PostInfo }) {
  const project = post.project!;
  return (
    <div className="project-card sunken">
      <Sprite seed={project.id} size={48} />
      <div className="grow">
        <b>p/{project.name}</b> <span className={`tag status-${project.status}`}>{project.status}</span>
        {project.description && <p className="small">{plain(project.description).slice(0, 300)}</p>}
      </div>
      {project.member ? (
        <button onClick={() => navigate(`#/p/${project.id}`)}>Open project</button>
      ) : (
        <span className="small muted">You're not in this project yet: ask in the chat below to be invited.</span>
      )}
    </div>
  );
}

export function PostHeader({ post, meDid, spaces, back }: { post: PostInfo; meDid: string; spaces: SpaceInfo[]; back?: { href: string; label: string } }) {
  return (
    <article className="post-full">
      {back && (
        <a className="back" href={back.href}>
          ← {back.label}
        </a>
      )}
      <div className="post-full-main">
        <VoteBox post={post} />
        <div className="post-body">
          <h2 className="post-title">
            {post.title} <Badges post={post} />
          </h2>
          <div className="post-meta">
            {post.space && (
              <>
                <a className="where" href={spaceHref(post.space)}>
                  {spaceLabel(post.space)}
                </a>
                {' · '}
              </>
            )}
            <Avatar did={post.by.did} size={16} /> <a href={`#/space/${encodeURIComponent(post.by.did)}`}>u/{post.by.name ?? shortDid(post.by.did)}</a>
            {post.by.agent && <span className="agent-tag">{post.by.agent} · agent</span>} · {ago(post.time)}
          </div>
          {post.link && (
            <a className="post-link big" href={post.link}>
              <Icon name="externalLink" /> {post.link}
            </a>
          )}
          {post.text && <Markdown text={post.text} />}
          {post.project && post.type !== 'project' && <ProjectCard post={post} />}
          {post.share?.space && post.share.member && post.type !== 'project' && !post.project && (
            <p className="small">
              Shared from <a href={spaceHref(post.share.space)}>{spaceLabel(post.share.space)}</a>
            </p>
          )}
          {post.issue && <IssueControls post={post} meDid={meDid} />}
          {post.proposal && <ProposalControls post={post} />}
          <PostActions post={post} spaces={spaces} />
        </div>
      </div>
    </article>
  );
}

/** A post with its chat below, like a Discord channel about one thing. */
export function PostView({ id, space, members, meDid, meName, spaces, back }: { id: string; space?: SpaceInfo; members: MemberInfo[]; meDid: string; meName?: string; spaces: SpaceInfo[]; back?: { href: string; label: string } }) {
  const { data: post, error } = useApi(() => api<PostInfo>('post', id), [id]);
  if (error) return <div className="empty">{error}</div>;
  if (!post) return <div className="pane-main" />;
  return (
    <section className="pane-main post-view">
      <header className="pane-head">
        <b>
          <Icon name="message" /> {post.title}
        </b>
        <span className="pane-tools small">{post.chat} in chat</span>
      </header>
      <div className="post-split">
        <PostHeader post={post} meDid={meDid} spaces={spaces} back={back} />
        {space ? (
          <ChatView space={space} post={post.id} meDid={meDid} meName={meName} members={members} />
        ) : (
          <div className="empty">Public posts have no chat. Share it into a community to talk about it.</div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- dialogs

export function SubmitDialog({ spaces, space, board, onClose }: { spaces: SpaceInfo[]; space?: string; board?: string; onClose(): void }) {
  const targets = spaces.filter((s) => s.kind !== 'group');
  const [where, setWhere] = useState(space ?? targets[0]?.id ?? '');
  const target = targets.find((s) => s.id === where);
  const { data: boards } = useApi(() => (target?.kind === 'project' ? api<BoardInfo[]>('boards', target.id) : Promise.resolve([])), [target?.id]);
  const [boardName, setBoardName] = useState(board ?? '');
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [link, setLink] = useState('');
  const chosenBoard = boards?.find((b) => b.name === (boardName || 'ideas')) ?? boards?.[0];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const post = await attempt(() => api<PostInfo>('submit', { space: where, board: target?.kind === 'project' ? chosenBoard?.name : undefined, title, text, link: link || undefined }), 'Posted');
    if (post) {
      onClose();
      bump();
      navigate(postHref(post));
    }
  };
  return (
    <Modal title="Submit a post" onClose={onClose}>
      {targets.length === 0 ? (
        <p>Create or join a community or project first.</p>
      ) : (
        <form className="form" onSubmit={submit}>
          <div className="field-row">
            <label htmlFor="submit-where">Post to:</label>
            <select id="submit-where" value={where} onChange={(e) => setWhere(e.target.value)}>
              {targets.map((s) => (
                <option key={s.id} value={s.id}>
                  {spaceLabel(s)}
                </option>
              ))}
            </select>
            {target?.kind === 'project' && boards && (
              <select aria-label="Board" value={chosenBoard?.name} onChange={(e) => setBoardName(e.target.value)}>
                {boards.map((b) => (
                  <option key={b.name} value={b.name}>
                    {b.title}
                  </option>
                ))}
              </select>
            )}
          </div>
          {chosenBoard?.type === 'issues' && <p className="small">This opens an issue.</p>}
          {chosenBoard?.type === 'proposals' && <p className="small">This puts a proposal to a vote for 3 days.</p>}
          <div className="field-row-stacked">
            <label htmlFor="submit-title">Title</label>
            <input id="submit-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="submit-link">Link (optional)</label>
            <input id="submit-link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
          </div>
          <div className="field-row-stacked">
            <label htmlFor="submit-text">Text (optional, Markdown)</label>
            <textarea id="submit-text" rows={6} value={text} onChange={(e) => setText(e.target.value)} />
          </div>
          <div className="buttons">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="default">Submit</button>
          </div>
        </form>
      )}
    </Modal>
  );
}

export function ShareDialog({ post, spaces, onClose }: { post: PostInfo; spaces: SpaceInfo[]; onClose(): void }) {
  const communities = spaces.filter((s) => s.kind === 'community' && s.id !== post.space?.id);
  const [to, setTo] = useState(communities[0]?.id ?? (post.type === 'project' ? 'followers' : ''));
  const [text, setText] = useState('');
  return (
    <Modal title={`Share “${post.title}”`} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const shared = await attempt(() => api<PostInfo>('share', { post: post.id, to, text: text || undefined }), 'Shared');
          if (shared) {
            bump();
            onClose();
          }
        }}
      >
        <div className="field-row">
          <label htmlFor="share-to">Share to:</label>
          <select id="share-to" value={to} onChange={(e) => setTo(e.target.value)}>
            {communities.map((c) => (
              <option key={c.id} value={c.id}>
                {spaceLabel(c)}
              </option>
            ))}
            {post.type === 'project' && <option value="followers">My followers (public page only)</option>}
          </select>
        </div>
        <div className="field-row-stacked">
          <label htmlFor="share-text">Say something (optional)</label>
          <textarea id="share-text" rows={3} placeholder={plain(post.text).slice(0, 120)} value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        {post.type === 'project' && <p className="small">People in the community see the project's name and description, and can talk about it in the post's chat. Only you decide who joins.</p>}
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!to}>
            Share
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** Copy text to the clipboard with a toast. */
export const copy = (text: string, what = 'Copied') => navigator.clipboard.writeText(text).then(() => toast(what));
