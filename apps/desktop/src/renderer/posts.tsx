import { useState, type FormEvent, type ReactNode } from 'react';
import type { Actor, BoardInfo, MemberInfo, PostInfo, PostsQuery, ProposalInfo, SpaceInfo, SpaceRef } from '@weave/node/client';
import { ChatView } from './chat.tsx';
import { Icon, type IconName } from './icons.tsx';
import { ago, api, bump, navigate, plain, postLink, shortDid, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Avatar, BlobImage, Markdown, Modal, ProjectIcon, Sprite, toast } from './ui.tsx';
import { TEXT_LIMITS } from '@weave/core/limits';
import { ImagePicker, RichEditor } from './editor.tsx';
import { Marks } from './marks.tsx';
import { AuthorAvatar, PostScene, postScene } from './avatar.tsx';
import { PicturePicker } from './avatar-editor.tsx';

// ---------------------------------------------------------------- names and links

const PREFIX: Record<SpaceRef['kind'], string> = { community: 'r', project: 'p', group: 'g', direct: 'd' };

export const spaceLabel = (s: Pick<SpaceRef, 'kind' | 'name'>) => (s.kind === 'direct' ? `@${s.name}` : `${PREFIX[s.kind]}/${s.name}`);
export const spaceHref = (s: Pick<SpaceRef, 'kind' | 'id'>) => `#/${PREFIX[s.kind]}/${s.id}`;

export function postHref(p: PostInfo): string {
  if (p.type === 'project' && p.space) return `#/p/${p.space.id}`;
  if (p.space?.kind === 'community') return `#/r/${p.space.id}/post/${p.id}`;
  if (p.space?.kind === 'project') return `#/p/${p.space.id}/b/${p.board}/${p.id}`;
  return `#/post/${p.id}`;
}

/** Open (or start) the direct chat with a friend. */
export async function startChat(did: string): Promise<void> {
  const chat = await attempt(() => api<SpaceInfo>('openChat', did));
  if (chat) {
    bump();
    navigate(`#/d/${chat.id}`);
  }
}

/**
 * A post's co-authors after its byline: "with Lena ✓, Lena · codex ✓". Its
 * author also sees who was asked or declined. Each confirmation is signed by
 * the co-author (or their own person), so this is never just a claim.
 */
export function Coauthors({ post }: { post: PostInfo }) {
  if (!post.coauthors?.length) return null;
  return (
    <span className="coauthors" title="Co-authors confirm with their own signature">
      {' with '}
      {post.coauthors.map((c, i) => (
        <span key={`${c.did}-${c.agent ?? ''}`} className={`coauthor ${c.state}`}>
          {i > 0 && ', '}
          <a href={`#/space/${encodeURIComponent(c.did)}`}>{c.name ?? shortDid(c.did)}</a>
          {c.agent && <span className="agent-tag">{c.agent} · agent</span>}
          {c.state === 'confirmed' ? ' ✓' : c.state === 'declined' ? ' (declined)' : ' (asked)'}
        </span>
      ))}
    </span>
  );
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

/** What you may change about a post: edit your own, delete your own or (moderating) anyone's. */
export interface Editing {
  meDid: string;
  /** You maintain or moderate the post's space. */
  moderator?: boolean;
  /** Where to go once the post is deleted. */
  onDeleted?(): void;
}

function PostActions({ post, spaces, curate, editing }: { post: PostInfo; spaces: SpaceInfo[]; curate?: Curate; editing?: Editing }) {
  const [sharing, setSharing] = useState(false);
  const [changing, setChanging] = useState(false);
  const own = post.type === 'post' && !!editing && post.by.did === editing.meDid;
  const mayDelete = post.type === 'post' && (own || !!editing?.moderator);
  const remove = async () => {
    const question = own
      ? `Delete “${post.title}” and hide its chat? People who already have it keep a copy in their logs.`
      : `Delete “${post.title}” by ${post.by.name ?? 'someone'} for everyone here? It stays in the logs, out of sight.`;
    if (!(await ask(question, 'Delete'))) return;
    const done = await attempt(() => api('deletePost', { post: post.id }).then(() => true), 'Deleted');
    if (done) {
      editing?.onDeleted?.();
      bump();
    }
  };
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
      {own && (
        <button className="link" onClick={() => setChanging(true)}>
          <Icon name="pencil" /> edit
        </button>
      )}
      {mayDelete && (
        <button className="link" onClick={remove}>
          <Icon name="trash" /> delete
        </button>
      )}
      {sharing && <ShareDialog post={post} spaces={spaces} onClose={() => setSharing(false)} />}
      {changing && <EditPostDialog post={post} onClose={() => setChanging(false)} />}
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

/** Where a post is: its project's (or community's) little icon and name, as in the sidebar. */
function Where({ space, spaces }: { space: NonNullable<PostInfo['space']>; spaces: SpaceInfo[] }) {
  return (
    <a className="where" href={spaceHref(space)}>
      {space.kind !== 'direct' && <ProjectIcon id={space.id} icon={spaces.find((s) => s.id === space.id)?.icon} size={16} className="where-icon" />} {spaceLabel(space)}
    </a>
  );
}

export function PostRow({ post, meDid, spaces, showWhere = true, curate, moderator }: { post: PostInfo; meDid: string; spaces: SpaceInfo[]; showWhere?: boolean; curate?: Curate; moderator?: boolean }) {
  const href = postHref(post);
  return (
    <article className={`post-row${post.pinned || post.saved === 'pinned' ? ' is-pinned' : ''}`} data-post={post.id} title="Ctrl+click: work on it in Claude">
      <VoteBox post={post} />
      <a className={`thumb${post.image || postScene(post) ? ' has-image' : ''}${post.scene === 'none' && !post.image ? ' no-picture' : ''}`} href={href}>
        {post.scene === 'none' && !post.image ? null : postScene(post) ? <PostScene post={post} scene={postScene(post)!} size={128} close /> : post.image ? <BlobImage src={post.image} alt="" /> : post.project ? <ProjectIcon id={post.project.id} icon={post.project.icon} size={64} /> : <Sprite seed={post.id} size={64} />}
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
              <Where space={post.space} spaces={spaces} />
              {post.space.kind === 'project' && post.board && post.type !== 'project' && <span className="where">/{post.board}</span>}
              {' · '}
            </>
          )}
          <a href={`#/space/${encodeURIComponent(post.by.did)}`}>u/{post.by.name ?? shortDid(post.by.did)}</a>
          {!post.by.agent && <Marks did={post.by.did} slot="author" space={post.space?.id} />}
          {post.by.agent && <span className="agent-tag" title={post.by.session ? `Written in its session ${post.by.session.name}` : undefined}>{post.by.agent} · agent{post.by.session ? ` · in ${post.by.session.name}` : ''}</span>}
          <Coauthors post={post} />
          {' · '}
          {ago(post.time)}
          {post.edited && <span title={`edited ${new Date(post.edited).toLocaleString()}`}> · edited</span>}
          {post.active !== post.time && <> · active {ago(post.active)}</>}
        </div>
        {post.text && <p className="excerpt">{plain(post.text).slice(0, 220)}</p>}
        <PostActions post={post} spaces={spaces} curate={curate} editing={{ meDid, moderator }} />
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
          {board?.following !== undefined && query.space && (
            <button
              className={board.following ? 'chosen' : ''}
              title={board.following ? 'Its posts come to your Home and notify you. Click to stop.' : 'Bring its posts to your Home and get notified about new ones'}
              onClick={() => attempt(() => api('followBoard', { project: query.space, board: board.name, on: !board.following }).then(bump), board.following ? `Stopped following ${board.title}` : `Following ${board.title}`)}
            >
              {board.following ? '✓ Following' : 'Follow'}
            </button>
          )}
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
        {board?.rule && (
          <p className="small rule-line">
            <Icon name="clock" /> {ruleText(board.rule)}
          </p>
        )}
        {above}
        {(posts ?? []).map((p) => (
          <PostRow key={p.id} post={p} meDid={meDid} spaces={spaces} showWhere={!query.space} curate={curate} moderator={canCurate && !!query.space} />
        ))}
        {posts?.length === 0 && <div className="empty">{empty}</div>}
        {query.space && posts?.some((p) => p.heldBy) && (
          <div className="buttons load-older">
            <AsyncButton onClick={() => attempt(() => api('fetchOlder', { space: query.space! }).then(bump), 'Asked the members for the month before')}>Load older</AsyncButton>
            <span className="small muted">Older posts are with the members who keep them.</span>
          </div>
        )}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- how long things stay

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: new Date(iso).getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });

/** Why a post stays for good, or until when and what stretched it. */
export function lifetimeText(l: NonNullable<PostInfo['lifetime']>): string {
  const yours = l.yours ? ' Your devices keep it regardless.' : '';
  if ('forever' in l) return { pinned: 'Stays for good: it is pinned.', permanent: 'Stays for good: issues, proposals and releases always do.', 'no-rule': 'Stays for good: this board has no rule for forgetting.' }[l.forever];
  if (l.full) return `Goes now: the board is over its size, and this post would go soonest.${yours}`;
  const why = l.grace
    ? ', given 14 days after the rule was set'
    : l.overShare
      ? `, shortened: its author posts ${l.overShare}× their share of this board`
      : l.upvotes
        ? `, ${l.upvotes} upvote${l.upvotes === 1 ? '' : 's'} added ${l.addedDays} days`
        : '';
  const gone = Date.parse(l.until) <= Date.now();
  return `${gone ? 'Forgotten since' : 'Stays until'} ${day(l.until)}${why}.${yours}`;
}

/** Roughly who holds a post of a big space: an estimate, from what everyone knows. */
export function heldByText(h: NonNullable<PostInfo['heldBy']>): string {
  if (h.recent) return `Held by everyone online while it's recent (${h.about} members).`;
  const parts = ['its author', `${h.share} member${h.share === 1 ? '' : 's'} by share`, ...(h.upvoters ? [`${h.upvoters} who upvoted`] : [])];
  return `Held by about ${h.about}: ${parts.join(', ')}.`;
}

/** A board's rule, said in a line, with who set it when. */
export function ruleText(rule: NonNullable<BoardInfo['rule']>): string {
  const keep = rule.keepDays ? `Posts here stay ${rule.keepDays} days after their last activity, longer with upvotes` : 'Posts here stay';
  const size = rule.maxMB ? `${rule.keepDays ? ', and' : ''} up to ${rule.maxMB} MB in all` : '';
  return `${keep}${size}. Set by ${rule.by.name ?? shortDid(rule.by.did)} on ${day(rule.time)}.`;
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
      <ProjectIcon id={project.id} icon={project.icon} size={48} />
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

export function PostHeader({ post, meDid, spaces, back, moderator }: { post: PostInfo; meDid: string; spaces: SpaceInfo[]; back?: { href: string; label: string }; moderator?: boolean }) {
  return (
    <article className="post-full">
      {back && (
        <a className="back" href={back.href}>
          ← {back.label}
        </a>
      )}
      <div className="post-full-main">
        <VoteBox post={post} />
        {postScene(post) && <PostScene post={post} scene={postScene(post)!} size={320} className="post-scene" />}
        <div className="post-body">
          <h2 className="post-title">
            {post.title} <Badges post={post} />
          </h2>
          <div className="post-meta">
            {post.space && (
              <>
                <Where space={post.space} spaces={spaces} />
                {' · '}
              </>
            )}
            <AuthorAvatar by={post.by} size={16} /> <a href={`#/space/${encodeURIComponent(post.by.did)}`}>u/{post.by.name ?? shortDid(post.by.did)}</a>
            {!post.by.agent && <Marks did={post.by.did} slot="author" space={post.space?.id} />}
            {post.by.agent && <span className="agent-tag" title={post.by.session ? `Written in its session ${post.by.session.name}` : undefined}>{post.by.agent} · agent{post.by.session ? ` · in ${post.by.session.name}` : ''}</span>}
            <Coauthors post={post} /> · {ago(post.time)}
            {post.edited && <span title={new Date(post.edited).toLocaleString()}> · edited {ago(post.edited)}</span>}
          </div>
          {post.lifetime && !('forever' in post.lifetime && post.lifetime.forever === 'no-rule') && (
            <div className="small muted lifetime">
              <Icon name="clock" /> {lifetimeText(post.lifetime)}
            </div>
          )}
          {post.heldBy && <div className="small muted lifetime">{heldByText(post.heldBy)}</div>}
          {post.link && (
            <a className="post-link big" href={post.link}>
              <Icon name="externalLink" /> {post.link}
            </a>
          )}
          {post.image && <BlobImage className="post-image" src={post.image} alt={post.title} />}
          {post.text && <Markdown text={post.text} />}
          {post.project && post.type !== 'project' && <ProjectCard post={post} />}
          {post.share?.space && post.share.member && post.type !== 'project' && !post.project && (
            <p className="small">
              Shared from <a href={spaceHref(post.share.space)}>{spaceLabel(post.share.space)}</a>
            </p>
          )}
          {post.issue && <IssueControls post={post} meDid={meDid} />}
          {post.proposal && <ProposalControls post={post} />}
          <PostActions post={post} spaces={spaces} editing={{ meDid, moderator, onDeleted: () => navigate(back?.href ?? '#/') }} />
        </div>
      </div>
    </article>
  );
}

/** A post with its chat below, like a Discord channel about one thing. */
export function PostView({ id, space, members, meDid, meName, spaces, back, moderator }: { id: string; space?: SpaceInfo; members: MemberInfo[]; meDid: string; meName?: string; spaces: SpaceInfo[]; back?: { href: string; label: string }; moderator?: boolean }) {
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
        <PostHeader post={post} meDid={meDid} spaces={spaces} back={back} moderator={moderator} />
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
  const [image, setImage] = useState('');
  const [scene, setScene] = useState('');
  const [coauthors, setCoauthors] = useState<string[]>([]);
  const writable = boards?.filter((b) => b.canWrite !== false);
  const chosenBoard = writable?.find((b) => b.name === (boardName || 'ideas')) ?? writable?.[0];
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const post = await attempt(() => api<PostInfo>('submit', { space: where, board: target?.kind === 'project' ? chosenBoard?.name : undefined, title, text, link: link || undefined, image: image || undefined, scene: scene || undefined, with: coauthors.length ? coauthors : undefined }), 'Posted');
    if (post) {
      onClose();
      bump();
      navigate(postHref(post));
    }
  };
  return (
    <Modal title="Submit a post" onClose={onClose} wide>
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
                {boards
                  .filter((b) => b.canWrite !== false)
                  .map((b) => (
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
          <PicturePicker image={image} scene={scene} onImage={setImage} onScene={setScene} imageAllowed={!chosenBoard || chosenBoard.type === 'posts'} />
          <div className="field-row-stacked">
            <label>Text (optional)</label>
            <RichEditor value={text} onChange={setText} placeholder="Say more, paste or drop images…" minHeight={140} max={TEXT_LIMITS.text} />
          </div>
          {target && (!chosenBoard || chosenBoard.type === 'posts') && <CoauthorPicker space={target.id} value={coauthors} onChange={setCoauthors} />}
          <div className="buttons">
            <button type="button" onClick={onClose}>
              Cancel
            </button>
            <button className="default" disabled={text.length > TEXT_LIMITS.text}>
              Submit
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}

/** Who wrote this with you: people in the space, their agents, and your own agents. Each one confirms before it shows. */
function CoauthorPicker({ space, value, onChange }: { space: string; value: string[]; onChange(v: string[]): void }) {
  const { data: members } = useApi(() => api<MemberInfo[]>('members', space), [space]);
  const { data: me } = useApi(() => api<{ did: string; agents: Array<{ name: string }> }>('whoami'), []);
  const [adding, setAdding] = useState('');
  if (!members || !me) return null;
  const options = [
    ...me.agents.map((a) => ({ key: a.name, label: `${a.name} · your agent` })),
    ...members.filter((m) => m.did !== me.did).flatMap((m) => [{ key: m.did, label: m.name ?? shortDid(m.did) }, ...m.agents.map((a) => ({ key: `${m.did}·${a}`, label: `${m.name ?? shortDid(m.did)} · ${a}` }))]),
  ];
  const label = (key: string) => options.find((o) => o.key === key)?.label ?? key;
  const left = options.filter((o) => !value.includes(o.key));
  return (
    <div className="field-row-stacked">
      <label>Written with (optional)</label>
      <div className="grantees">
        {value.map((key) => (
          <span key={key} className="chip">
            {label(key)}
            <button type="button" className="small-btn" title="Remove" onClick={() => onChange(value.filter((k) => k !== key))}>
              ✕
            </button>
          </span>
        ))}
        {left.length > 0 && value.length < 10 && (
          <select
            value={adding}
            aria-label="Add a co-author"
            onChange={(e) => {
              if (e.target.value) onChange([...value, e.target.value]);
              setAdding('');
            }}
          >
            <option value="">Add a person or agent…</option>
            {left.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        )}
      </div>
      {value.length > 0 && <span className="small muted">Each one confirms with their own signature before they show as co-author.</span>}
    </div>
  );
}

/** Change your own post: title, link, image, scene and text. */
function EditPostDialog({ post, onClose }: { post: PostInfo; onClose(): void }) {
  const [title, setTitle] = useState(post.title);
  const [text, setText] = useState(post.text);
  const [link, setLink] = useState(post.link ?? '');
  const [image, setImage] = useState(post.image ?? '');
  const [scene, setScene] = useState(post.scene ?? '');
  const { data: me } = useApi(() => api<{ did: string }>('whoami'), []);
  // The picker's keys: people by did, your own agents by name, others' agents as "did·agent".
  const named = (post.coauthors ?? []).map((c) => (!c.agent ? c.did : me && c.did === me.did ? c.agent : `${c.did}·${c.agent}`));
  const [coauthors, setCoauthors] = useState<string[]>();
  const save = async (e: FormEvent) => {
    e.preventDefault();
    const changes: Record<string, string | string[]> = {};
    if (coauthors && coauthors.join() !== named.join()) changes.with = coauthors;
    if (title.trim() !== post.title) changes.title = title;
    if (text !== post.text) changes.text = text;
    if (link.trim() !== (post.link ?? '')) changes.link = link.trim();
    if (image !== (post.image ?? '')) changes.image = image;
    if (scene !== (post.scene ?? '')) changes.scene = scene;
    if (!Object.keys(changes).length) return onClose();
    const saved = await attempt(() => api<PostInfo>('editPost', { post: post.id, ...changes }), 'Saved');
    if (saved) {
      bump();
      onClose();
    }
  };
  return (
    <Modal title="Edit post" onClose={onClose} wide>
      <form className="form" onSubmit={save}>
        <div className="field-row-stacked">
          <label htmlFor="edit-title">Title</label>
          <input id="edit-title" required maxLength={200} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="field-row-stacked">
          <label htmlFor="edit-link">Link (optional)</label>
          <input id="edit-link" type="url" placeholder="https://" value={link} onChange={(e) => setLink(e.target.value)} />
        </div>
        <PicturePicker image={image} scene={scene} onImage={setImage} onScene={setScene} postId={post.id} />
        <div className="field-row-stacked">
          <label>Text (optional)</label>
          <RichEditor value={text} onChange={setText} placeholder="Say more, paste or drop images…" minHeight={140} max={TEXT_LIMITS.text} />
        </div>
        {post.space && me && <CoauthorPicker space={post.space.id} value={coauthors ?? named} onChange={setCoauthors} />}
        <p className="small">Everyone sees the new version, marked as edited. Earlier versions stay in the logs.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={text.length > TEXT_LIMITS.text}>
            Save
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function ShareDialog({ post, spaces, onClose }: { post: PostInfo; spaces: SpaceInfo[]; onClose(): void }) {
  const communities = spaces.filter((s) => s.kind === 'community' && s.id !== post.space?.id);
  const [to, setTo] = useState(communities[0]?.id ?? (post.type === 'project' ? 'followers' : ''));
  const [text, setText] = useState('');
  const link = post.url ?? postLink(post.id);
  const into = communities.length > 0 || post.type === 'project';
  return (
    <Modal title={`Share “${post.title}”`} onClose={onClose}>
      <div className="field-row-stacked">
        <label htmlFor="share-link">Link to send someone</label>
        <div className="field-row">
          <input id="share-link" className="grow" readOnly value={link} onFocus={(e) => e.target.select()} />
          <button type="button" className={into ? '' : 'default'} onClick={() => copy(link, 'Link copied')}>
            Copy link
          </button>
        </div>
        <p className="small">
          {post.space && post.space.kind !== 'direct'
            ? `Opens the post in Weave for people in ${spaceLabel(post.space)}; it shows nobody else anything.`
            : `Opens the post in Weave. It's public: people who follow ${post.by.name ?? 'its author'} can open it.`}
        </p>
      </div>
      {into ? (
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
      ) : (
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </Modal>
  );
}

/** Copy text to the clipboard with a toast. */
export const copy = (text: string, what = 'Copied') => navigator.clipboard.writeText(text).then(() => toast(what));
