import { checkForUpdates, UpdatePrompt } from './update.tsx';
import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CoauthorRequest, KnockInfo, MembershipRequestInfo, PermissionRequest } from '@weave/node/client';
import type { Admission, BoardInfo, ChannelInfo, ChatInfo, MemberInfo, PostInfo, Profile, SessionInfo, WebsiteInfo, SpaceInfo, Status } from '@weave/node/client';
import { ArcadeWell, useArcade } from './arcade.tsx';
import { ChatView } from './chat.tsx';
import { NotificationSettings, startNotifications } from './notify.tsx';
import { KeysView, Onboarding } from './keys.tsx';
import { AgentAsks, AgentsOffer } from './agents.tsx';
import { PhoneConnecting, PhoneNotConnected, PhonePairing } from './phones.tsx';
import { HomeFeed } from './home.tsx';
import { ProjectServicesView } from './websites.tsx';
import { CatalogView } from './catalog.tsx';
import { MentionsPanel } from './overlay.tsx';
import { RoutinesPage, SetupDeskDialog } from './routines.tsx';
import { chooseWorker, SessionsView, WorkerChooser } from './sessions.tsx';
import { Icon, type IconName } from './icons.tsx';
import { api, applyMode, applySkin, bridge, bump, enrollLinkOpened, isActive, isUnread, loadMode, loadSkin, MODES, navigate, postRefOfHref, shortDid, SKINS, SPACE_LINK, spaceRoute, useApi, useRoute, useTick, type AppState, type Mode, type Skin } from './lib.ts';
import { boardIcon, postHref, PostList, PostView, spaceHref, spaceLabel, SubmitDialog } from './posts.tsx';
import { Avatar, Menu, ProjectIcon, Sprite, toast, Toasts, WeaveMark } from './ui.tsx';
import { RepoBanner, startAppOpens } from './github.tsx';
import { SpaceServices } from './services.tsx';
import {
  CommunityAbout,
  GroupSettings,
  CommunityBanner,
  DelegationBar,
  InboxView,
  MembershipsView,
  InviteDialog,
  LonePost,
  NewDialog,
  NotConnected,
  Page,
  PeopleView,
  ProjectHome,
  ProjectSettings,
  SpaceView,
} from './views.tsx';

type Dialog = { kind: 'new' } | { kind: 'notify' } | { kind: 'desk' } | { kind: 'invite'; space: SpaceInfo } | { kind: 'submit'; space?: string; board?: string };

// ---------------------------------------------------------------- places tree

function TreeLink({ href, icon, sprite, image, face, label, on, unread, badge, depth = 0 }: { href: string; icon?: IconName; sprite?: string; image?: string; face?: boolean; label: ReactNode; on: boolean; unread?: boolean; badge?: number; depth?: number }) {
  return (
    <li style={{ paddingLeft: depth * 14 }}>
      <a className={`tree-link${on ? ' on' : ''}${unread ? ' unread' : ''}`} href={href}>
        {sprite ? image ? <ProjectIcon id={sprite} icon={image} size={16} /> : <Sprite seed={sprite} size={16} face={face} /> : icon && <Icon name={icon} />}
        <span className="tree-label">{label}</span>
        {!!badge && <span className="badge">{badge}</span>}
      </a>
    </li>
  );
}

/** A space in the tree; the open one shows its boards and channels underneath. */
function TreeSpace({ space, route, waiting }: { space: SpaceInfo; route: string[]; waiting: number }) {
  useTick(); // unread state lives in localStorage; re-check on every live update
  const base = spaceHref(space);
  const open = route[1] === space.id;
  const { data: channels } = useApi(() => api<ChannelInfo[]>('channels', space.id), [space.id]);
  const { data: boards } = useApi(() => (open && space.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space.id, open]);
  const { data: rooms } = useApi(() => (space.kind === 'project' ? api<WebsiteInfo[]>('websites', space.id) : Promise.resolve([])), [space.id]);
  const unread = (channels ?? []).some((c) => isUnread(`${space.id}/${c.name}`, c.last));
  const [view, arg] = [route[2], route[3]];
  return (
    <>
      <TreeLink href={base} sprite={space.id} image={space.icon} label={space.name} on={open && !view} unread={!open && unread} badge={waiting} />
      {open && (
        <>
          {space.kind === 'project' &&
            (boards ?? []).map((b) => <TreeLink key={b.name} depth={1} href={`${base}/b/${b.name}`} icon={boardIcon(b)} label={`${b.title} (${b.count})`} on={view === 'b' && arg === b.name} />)}
          {(channels ?? []).map((c) => (
            <TreeLink
              key={c.name}
              depth={1}
              href={space.kind === 'project' && c.name === 'general' ? base : `${base}/c/${c.name}`}
              icon="hash"
              label={c.name}
              on={space.kind === 'project' && c.name === 'general' ? false : view === 'c' && (arg ?? 'general') === c.name}
              unread={isUnread(`${space.id}/${c.name}`, c.last)}
            />
          ))}
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/services`} icon="zap" label={`Services${rooms?.length ? ` (${rooms.length} live)` : ''}`} on={view === 'services' || view === 'live'} unread={!!rooms?.length} />}
          <TreeLink depth={1} href={`${base}/catalog`} icon="bookmark" label="Catalog" on={view === 'catalog'} />
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/routines`} icon="clock" label="Routines" on={view === 'routines'} />}
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/settings`} icon="gear" label="Settings" on={view === 'settings'} badge={waiting} />}
          {space.kind === 'community' && <TreeLink depth={1} href={`${base}/about`} icon="gear" label="About" on={view === 'about'} />}
          {space.kind === 'group' && <TreeLink depth={1} href={`${base}/settings`} icon="gear" label="Settings" on={view === 'settings'} />}
        </>
      )}
    </>
  );
}

function Places({ spaces, chats, route, waiting, inbox, onNew }: { spaces: SpaceInfo[]; chats: ChatInfo[]; route: string[]; waiting: Admission[]; inbox: number; onNew(): void }) {
  useTick(); // unread state lives in localStorage
  const section = (kind: SpaceInfo['kind'], title: string, icon: IconName) => {
    const list = spaces.filter((s) => s.kind === kind && !s.closed);
    return (
      <>
        <li className="tree-head">
          <Icon name={icon} /> {title}
        </li>
        {list.map((s) => (
          <TreeSpace key={s.id} space={s} route={route} waiting={waiting.filter((a) => a.project.id === s.id).length} />
        ))}
        {list.length === 0 && <li className="tree-none">none yet</li>}
      </>
    );
  };
  return (
    <aside className="places">
      <ArcadeWellIfOn />
      <header className="pane-head">
        <b>Places</b>
      </header>
      <ul className="tree-view">
        <TreeLink href="#/" icon="home" label="Home" on={route.length === 0} />
        <TreeLink href="#/saved" icon="bookmark" label="Saved" on={route[0] === 'saved'} />
        <TreeLink href="#/inbox" icon="inbox" label={`Inbox${inbox ? ` (${inbox})` : ''}`} on={route[0] === 'inbox'} />
        <TreeLink href="#/people" icon="users" label="People" on={route[0] === 'people'} />
        <TreeLink href="#/memberships" icon="star" label="Memberships" on={route[0] === 'memberships'} />
        {bridge.workOn && <TreeLink href="#/sessions" icon="code" label="Sessions" on={route[0] === 'sessions'} />}
        <li className="tree-head">
          <Icon name="message" /> Chats
        </li>
        {chats.map((c) => (
          <TreeLink
            key={c.space.id}
            href={`#/d/${c.space.id}`}
            sprite={c.peer.did}
            face
            label={c.peer.name ?? shortDid(c.peer.did)}
            on={route[0] === 'd' && route[1] === c.space.id}
            unread={!!c.last && !c.last.mine && route[1] !== c.space.id && isUnread(`${c.space.id}/general`, c.last.time)}
          />
        ))}
        {chats.length === 0 && <li className="tree-none">friends show up here</li>}
        {section('community', 'Communities', 'community')}
        {section('project', 'Projects', 'zap')}
        {section('group', 'Groups', 'users')}
        {spaces.some((s) => s.closed) && (
          <>
            <li className="tree-head">
              <Icon name="lock" /> Closed
            </li>
            {spaces
              .filter((s) => s.closed)
              .map((s) => (
                <TreeSpace key={s.id} space={s} route={route} waiting={0} />
              ))}
          </>
        )}
      </ul>
      <button className="new-btn" onClick={onNew}>
        <Icon name="plus" /> New…
      </button>
    </aside>
  );
}

// ---------------------------------------------------------------- member list

function MemberList({ space, members, meDid }: { space: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const online = members.filter((m) => m.did === meDid || isActive(m.lastActive));
  const offline = members.filter((m) => !online.includes(m));
  const crown = space.kind === 'project' ? 'maintainer' : space.kind === 'community' ? 'moderator' : 'founder';
  const row = (m: MemberInfo, on: boolean) => {
    const how = m.via ? `via ${m.via.name}${m.invitedByName ? `, let in by ${m.invitedByName}` : ''}` : m.invitedByName ? `invited by ${m.invitedByName}` : 'founder';
    const crowned = m.maintainer || (space.kind !== 'project' && m.did === space.founder);
    return (
      <div key={m.did} className={`member${on ? '' : ' away'}`}>
        <a className="member-main" href={`#/space/${encodeURIComponent(m.did)}`} title={how}>
          <Avatar did={m.did} size={24} status={on ? 'online' : 'offline'} />
          <span className="member-name">
            {m.did === meDid ? `${m.name ?? 'You'} (you)` : (m.name ?? shortDid(m.did))}
            {crowned && (
              <span className="crown" title={crown}>
                ★
              </span>
            )}
          </span>
        </a>
        {m.via && <div className="member-sub">via g/{m.via.name}</div>}
        {m.agents.map((agent) => (
          <div key={agent} className="member-sub agent" title={`${m.name ?? 'Their'}'s agent, signing with its own key`}>
            ⚙ {agent} <span className="agent-tag">agent</span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <aside className="members">
      <ArcadeWellIfOn />
      <header className="pane-head">
        <b>
          {space.kind === 'project' ? 'Participants' : 'Members'} — {members.length}
        </b>
      </header>
      <div className="members-list sunken">
        {online.length > 0 && <h4>Online — {online.length}</h4>}
        {online.map((m) => row(m, true))}
        {offline.length > 0 && <h4>Away — {offline.length}</h4>}
        {offline.map((m) => row(m, false))}
        <SpaceServices space={space} />
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- spaces

/** On a phone, where the tree is a pane of its own: a project's boards, Live and Settings at the top of its pages. */
function ProjectSections({ space, boards, view, arg }: { space: SpaceInfo; boards: BoardInfo[]; view?: string; arg?: string }) {
  const { data: rooms } = useApi(() => api<WebsiteInfo[]>('websites', space.id), [space.id]);
  const base = spaceHref(space);
  const link = (href: string, icon: IconName, label: string, on: boolean, unread?: boolean) => (
    <a key={href} className={`tree-link${on ? ' on' : ''}${unread ? ' unread' : ''}`} href={href}>
      <Icon name={icon} />
      <span className="tree-label">{label}</span>
    </a>
  );
  return (
    <nav className="project-sections mobile-only">
      {link(base, 'hash', 'general', !view)}
      {link(`${base}/services`, 'zap', `Services${rooms?.length ? ` (${rooms.length} live)` : ''}`, view === 'services' || view === 'live', !!rooms?.length)}
      {boards.map((b) => link(`${base}/b/${b.name}`, boardIcon(b), b.title, view === 'b' && arg === b.name))}
      {link(`${base}/settings`, 'gear', 'Settings', view === 'settings')}
    </nav>
  );
}

function SpaceScreen({ space, spaces, route, me, waiting, open }: { space: SpaceInfo; spaces: SpaceInfo[]; route: string[]; me: Profile; waiting: Admission[]; open(d: Dialog): void }) {
  const [view, arg, postId] = [route[2], route[3], route[4]];
  const { data: members } = useApi(() => api<MemberInfo[]>('members', space.id), [space.id]);
  const { data: boards } = useApi(() => (space.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space.id]);
  const { data: info } = useApi(() => (space.kind === 'project' ? api<{ maintainer: boolean }>('project', space.id) : space.kind === 'community' ? api<{ moderator: boolean }>('community', space.id).then((c) => ({ maintainer: c.moderator })) : Promise.resolve({ maintainer: false })), [space.id]);
  const list = members ?? [];
  const mine = waiting.filter((a) => a.project.id === space.id);
  const common = { meDid: me.did, meName: me.name, spaces, members: list };
  const invite = () => open({ kind: 'invite', space });

  let body: ReactNode;
  if (view === 'catalog') {
    // Groups: their founder lists; projects and communities: their maintainers and moderators.
    body = <CatalogView space={space} maintainer={!!info?.maintainer || (space.kind === 'group' && space.founder === me.did)} />;
  } else if (space.kind === 'group' && view === 'settings') {
    body = <GroupSettings group={space} members={list} meDid={me.did} />;
  } else if (space.kind === 'group') {
    const channel = view === 'c' ? (arg ?? 'general') : 'general';
    body = (
      <section className="pane-main">
        <header className="pane-head">
          <b># {channel}</b>
          <span className="pane-tools">
            <button onClick={invite}>
              <Icon name="userPlus" /> Invite
            </button>
          </span>
        </header>
        <RepoBanner space={space} />
        <ChatView space={space} channel={channel} meDid={me.did} meName={me.name} members={list} />
      </section>
    );
  } else if (view === 'c') {
    body = (
      <section className="pane-main">
        <header className="pane-head">
          <b># {arg ?? 'general'}</b>
        </header>
        <ChatView space={space} channel={arg ?? 'general'} meDid={me.did} meName={me.name} members={list} />
      </section>
    );
  } else if (space.kind === 'community') {
    if (view === 'post' && arg) body = <PostView id={arg} space={space} {...common} moderator={!!info?.maintainer} back={{ href: spaceHref(space), label: `r/${space.name}` }} />;
    else if (view === 'about') body = <CommunityAbout community={space} members={list} meDid={me.did} />;
    else
      body = (
        <PostList
          title={`r/${space.name}`}
          query={{ space: space.id }}
          spaces={spaces}
          meDid={me.did}
          canCurate={!!info?.maintainer}
          board={undefined}
          above={<CommunityBanner community={space} onInvite={invite} onSubmit={() => open({ kind: 'submit', space: space.id })} />}
          empty={<>No posts yet. Be the first: submit something.</>}
        />
      );
  } else if (view === 'b' && arg) {
    const board = boards?.find((b) => b.name === arg);
    if (postId) body = <PostView id={postId} space={space} {...common} moderator={!!info?.maintainer} back={{ href: `${spaceHref(space)}/b/${arg}`, label: board?.title ?? arg }} />;
    else
      body = (
        <PostList
          title={
            <>
              p/{space.name} · {board?.title ?? arg}
            </>
          }
          query={{ space: space.id, board: arg }}
          spaces={spaces}
          meDid={me.did}
          board={board}
          canCurate={!!info?.maintainer}
          toolbar={
            <button onClick={() => open({ kind: 'submit', space: space.id, board: arg })}>
              <Icon name="pencil" /> {board?.type === 'issues' ? 'Open issue' : board?.type === 'proposals' ? 'Propose' : 'Post'}
            </button>
          }
          above={board?.type === 'proposals' ? <DelegationBar project={space} members={list} meDid={me.did} /> : undefined}
          empty={<>Nothing in {board?.title ?? arg} yet.</>}
        />
      );
  } else if (view === 'services' || view === 'live') {
    body = <ProjectServicesView project={space} members={list} meDid={me.did} />;
  } else if (view === 'routines') {
    body = <RoutinesPage project={space} />;
  } else if (view === 'settings') {
    body = <ProjectSettings project={space} spaces={spaces} members={list} meDid={me.did} tab={arg} />;
  } else {
    body = <ProjectHome project={space} members={list} meDid={me.did} meName={me.name} spaces={spaces} onInvite={invite} />;
  }

  return (
    <>
      <div className="center">
        {space.kind === 'project' && <ProjectSections space={space} boards={boards ?? []} view={view} arg={arg} />}
        {mine.length > 0 && view !== 'settings' && (
          <a className="notice" href={`${spaceHref(space)}/settings/people`}>
            <Icon name="inbox" /> {mine[0].name ?? 'Someone'} from group {mine[0].group.name} is waiting to join{mine.length > 1 ? ` (+${mine.length - 1} more)` : ''}. Open Settings to decide.
          </a>
        )}
        {body}
      </div>
      <MemberList space={space} members={list} meDid={me.did} />
    </>
  );
}

/** A direct chat with a friend: just the chat, Discord-DM style. */
function DirectScreen({ chat, me }: { chat: ChatInfo; me: Profile }) {
  const { data: members } = useApi(() => api<MemberInfo[]>('members', chat.space.id), [chat.space.id]);
  const name = chat.peer.name ?? shortDid(chat.peer.did);
  return (
    <div className="center">
      {!chat.friend && (
        <div className="notice">
          <Icon name="lock" /> You and {name} aren't friends any more, so this chat is read-only.
        </div>
      )}
      <section className="pane-main">
        <header className="pane-head">
          <b>
            <Icon name="message" /> @{name}
          </b>
          <span className="pane-tools">
            <button onClick={() => navigate(`#/space/${encodeURIComponent(chat.peer.did)}`)}>
              <Icon name="user" /> Hub
            </button>
          </span>
        </header>
        <ChatView space={chat.space} channel="general" meDid={me.did} meName={me.name} members={members ?? []} />
      </section>
    </div>
  );
}

/** A post by its id alone, as a post link opens it: shown where it lives when that's one of your places. */
function PublicPost({ id, me, spaces }: { id: string; me: Profile; spaces: SpaceInfo[] }) {
  const { data, error } = useApi(() => api<PostInfo>('post', id), [id]);
  const home = data && postHref(data);
  useEffect(() => {
    if (home && home !== `#/post/${data.id}`) location.replace(home); // no back step into this redirect
  }, [home]);
  if (error)
    return (
      <Page title="Post">
        {/no post found/.test(error) ? "This post isn't on this computer. It may be in a community or project you're not in, or it hasn't reached you yet." : error}
      </Page>
    );
  return data && home === `#/post/${data.id}` ? <LonePost post={data} meDid={me.did} spaces={spaces} /> : null;
}

/** Where a Weave link goes: this window, or, from the side panel, the main window. */
const go = (hash: string) => (location.hash.startsWith('#/overlay') && bridge.route ? void bridge.route(hash) : navigate(hash));

/** Weave links: clicked in a message, or handed over by the OS when clicked elsewhere. Post addresses open here, not in a browser. */
function openLink(link: string): void {
  const ref = postRefOfHref(link);
  const space = SPACE_LINK.exec(link);
  if (space) return go(spaceRoute(space[1], space[2]));
  if (link.startsWith('weave:enroll:')) {
    if (document.querySelector('.welcome')) enrollLinkOpened(link);
    else toast('This is a link to set up a company account. This computer has a Weave account already.');
    return;
  }
  if (!ref) return toast('Paste this link into “Join with an invite link…” or “Add someone”');
  if (!ref.startsWith('http')) return go(`#/post/${ref}`);
  api<PostInfo>('post', ref).then(
    (post) => go(postHref(post)),
    () => toast("This post isn't on this computer. It may be in a project or community you're not in.", 'error'),
  );
}
bridge.onLink(openLink);
// The side panel's links open here.
bridge.onRoute?.(navigate);

/** Ctrl+click (Cmd+click on a Mac) on a post: work on it in the Claude app. */
document.addEventListener(
  'click',
  (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const post = (event.target as Element | null)?.closest?.<HTMLElement>('[data-post]')?.dataset.post;
    if (!post) return;
    event.preventDefault();
    event.stopPropagation();
    if (!bridge.workOn) return toast('Ctrl+click opens a work item in the Claude app: that works in the desktop app');
    // Your available workers for it, to pick from; without any, it goes where it was last.
    const pick = async () => {
      const [item, workers] = await Promise.all([api<PostInfo>('post', post), api<SessionInfo[]>('workers', { post })]);
      return workers.length ? chooseWorker(item.title, workers) : { usual: true as const };
    };
    pick()
      .then((choice) => (choice ? bridge.workOn!(post, 'usual' in choice ? undefined : choice) : { how: 'cancelled' as const }))
      .then(
      (r) => {
        if (r.how === 'cancelled') return;
        if (r.delivered === 'clipboard') toast('The message is on your clipboard: paste it in Claude (Ctrl+V)');
        else toast(r.how === 'new' ? `New Claude session in ${r.where}: the message is in its text box` : `Back in “${r.where}”: the message is in its text box`);
      },
      (error: Error) => toast(error.message, 'error'),
    );
  },
  true,
);
document.addEventListener('click', (event) => {
  const anchor = (event.target as Element | null)?.closest?.('a[href^="weave:"], a[href^="http://weave.localhost"]');
  if (!anchor) return;
  event.preventDefault();
  openLink(anchor.getAttribute('href')!);
});

// ---------------------------------------------------------------- window

/** Minimize, Maximize/Restore and Close for the app's own title bar (Windows and Linux; macOS has its traffic lights). */
function WindowButtons() {
  const [maximized, setMaximized] = useState(false);
  useEffect(() => {
    bridge.onWindowState?.((state) => {
      setMaximized(state.maximized);
      document.documentElement.classList.toggle('window-inactive', !state.focused);
    });
  }, []);
  if (!bridge.windowControl || bridge.platform === 'darwin') return null;
  const control = (action: 'minimize' | 'maximize' | 'close') => () => void bridge.windowControl!(action).then((state) => setMaximized(state.maximized));
  return (
    <div className="title-bar-controls">
      <button aria-label="Minimize" tabIndex={-1} onClick={control('minimize')} />
      <button aria-label={maximized ? 'Restore' : 'Maximize'} tabIndex={-1} onClick={control('maximize')} />
      <button aria-label="Close" tabIndex={-1} onClick={control('close')} />
    </div>
  );
}

/** The Arcade look's well of tetrominoes behind a side panel. */
function ArcadeWellIfOn() {
  return useArcade() ? <ArcadeWell /> : null;
}

function ToolButton({ icon, label, onClick, href, on, className = '' }: { icon: IconName; label: string; onClick?(): void; href?: string; on?: boolean; className?: string }) {
  const inner = (
    <>
      <Icon name={icon} size={24} />
      <span>{label}</span>
    </>
  );
  return href ? (
    <a className={`tool${on ? ' on' : ''} ${className}`} href={href} aria-label={label}>
      {inner}
    </a>
  ) : (
    <button className={`tool${on ? ' on' : ''} ${className}`} onClick={onClick} aria-label={label}>
      {inner}
    </button>
  );
}

function Shell() {
  const route = useRoute();
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const { data: status } = useApi(() => api<Status>('status'), []);
  const { data: waiting } = useApi(() => api<Admission[]>('admissions'), []);
  const { data: chats } = useApi(() => api<ChatInfo[]>('chats'), []);
  const { data: requests } = useApi(() => api<MembershipRequestInfo[]>('membershipRequests'), []);
  const { data: knocks } = useApi(() => api<KnockInfo[]>('knocks'), []);
  const { data: coauthors } = useApi(() => api<CoauthorRequest[]>('coauthorRequests'), []);
  const { data: asks } = useApi(() => api<PermissionRequest[]>('permissionRequests').catch(() => []), []);
  const { data: fading } = useApi(() => api<PostInfo[]>('fading').catch(() => []), []);
  const inbox = (waiting?.length ?? 0) + (requests?.length ?? 0) + (knocks?.length ?? 0) + (coauthors?.length ?? 0) + (asks?.length ?? 0) + (fading?.length ?? 0);
  const [dialog, setDialog] = useState<Dialog>();
  const [skin, setSkin] = useState<Skin>(loadSkin);
  const [mode, setMode] = useState<Mode>(loadMode);
  // On a phone the places tree is a screen of its own; picking something closes it.
  const [placesOpen, setPlacesOpen] = useState(false);
  const routeKey = route.join('/');
  useEffect(() => setPlacesOpen(false), [routeKey]);
  if (!me || !spaces) return <div className="desktop" />;

  const space = ['p', 'g', 'r'].includes(route[0]) ? spaces.find((s) => s.id === route[1]) : undefined;
  const chat = route[0] === 'd' ? chats?.find((c) => c.space.id === route[1]) : undefined;
  const where = space ? spaceLabel(space) : chat ? spaceLabel(chat.space) : ({ saved: 'Saved', inbox: 'Inbox', people: 'People', memberships: 'Memberships', keys: 'Keys & devices', space: route[1] ? 'Hub' : 'My hub', post: 'Post' } as Record<string, string>)[route[0]] ?? 'Home';
  const close = () => setDialog(undefined);
  const online = !!status && status.peers > 0;

  let body: ReactNode;
  if (space) body = <SpaceScreen space={space} spaces={spaces} route={route} me={me} waiting={waiting ?? []} open={setDialog} />;
  else if (chat) body = <DirectScreen chat={chat} me={me} />;
  else {
    let center: ReactNode;
    if (route[0] === 'd') center = <Page title="Chat">{chats ? 'This chat is not here.' : null}</Page>;
    else if (['p', 'g', 'r'].includes(route[0])) center = <Page title="Not here">You're not in this {({ p: 'project', g: 'group', r: 'community' } as Record<string, string>)[route[0]]}.</Page>;
    else if (route[0] === 'space') center = <SpaceView who={route[1]} meDid={me.did} />;
    else if (route[0] === 'people') center = <PeopleView />;
    else if (route[0] === 'inbox') center = <InboxView admissions={waiting ?? []} knocks={knocks ?? []} />;
    else if (route[0] === 'keys') center = <KeysView />;
    else if (route[0] === 'sessions') center = <SessionsView />;
    else if (route[0] === 'memberships') center = <MembershipsView meDid={me.did} meName={me.name} />;
    else if (route[0] === 'post' && route[1]) center = <PublicPost id={route[1]} me={me} spaces={spaces} />;
    else if (route[0] === 'saved')
      center = <PostList title={<>Saved</>} query={{ saved: true }} spaces={spaces} meDid={me.did} empty="Save posts to find them here again. Only you can see what you save." />;
    else center = <HomeFeed spaces={spaces} meDid={me.did} onSubmit={() => setDialog({ kind: 'submit' })} />;
    // Keys anyone could copy: said everywhere but on Keys & devices, which explains it.
    const unprotected = status?.keystoreWarning && route[0] !== 'keys' && (
      <a className="notice alarm" href="#/keys">
        <Icon name="lock" /> Your keys aren't protected by this computer's keystore. See Keys &amp; devices.
      </a>
    );
    body = (
      <div className="center">
        {unprotected}
        {center}
      </div>
    );
  }

  return (
    <div className={`window app-window${placesOpen ? ' places-open' : ''}${bridge.platform === 'darwin' ? ' mac' : ''}`}>
      <div className="title-bar app-title" onDoubleClick={() => bridge.platform !== 'darwin' && void bridge.windowControl?.('maximize')}>
        <div className="title-bar-text">
          <WeaveMark size={14} /> Weave - [{where}]
        </div>
        <WindowButtons />
      </div>
      <nav className="menubar">
        <Menu
          label="File"
          items={[
            { label: 'New project, community or group…', onClick: () => setDialog({ kind: 'new' }) },
            { label: 'Join with an invite link…', onClick: () => setDialog({ kind: 'new' }) },
            { label: 'Your desk…', onClick: () => setDialog({ kind: 'desk' }) },
            'sep',
            { label: 'Close', onClick: () => window.close() },
          ]}
        />
        <Menu
          label="View"
          items={[
            { label: 'Home', onClick: () => navigate('#/') },
            { label: 'Saved', onClick: () => navigate('#/saved') },
            { label: 'Inbox', onClick: () => navigate('#/inbox') },
            { label: 'People', onClick: () => navigate('#/people') },
            { label: 'My hub', onClick: () => navigate('#/space') },
            { label: 'Keys & devices', onClick: () => navigate('#/keys') },
            ...(bridge.mentions ? [{ label: 'Mentions panel', onClick: () => void bridge.mentions!('show') }] : []),
            'sep',
            { label: 'Refresh', onClick: bump },
            { label: 'Notifications…', onClick: () => setDialog({ kind: 'notify' }) },
            'sep',
            ...(Object.keys(SKINS) as Skin[]).map((s) => ({
              label: `${s === skin ? '● ' : ''}${SKINS[s]} look`,
              onClick: () => {
                applySkin(s);
                setSkin(s);
              },
            })),
            'sep',
            // Light or dark: the Clean look has both; Arcade is always dark, Windows 95 and Cozy always light.
            ...(Object.keys(MODES) as Mode[]).map((m) => ({
              label: `${m === mode ? '● ' : ''}${MODES[m]}`,
              disabled: skin !== 'clean',
              onClick: () => {
                applyMode(m);
                setMode(m);
              },
            })),
          ]}
        />
        <Menu
          label="Posts"
          items={[
            { label: 'Submit a post…', onClick: () => setDialog({ kind: 'submit', space: space?.kind !== 'group' ? space?.id : undefined, board: route[2] === 'b' ? route[3] : undefined }) },
            { label: 'Invite someone here…', disabled: !space, onClick: () => space && setDialog({ kind: 'invite', space }) },
          ]}
        />
        <Menu
          label="Help"
          items={[
            { label: 'Check for updates…', onClick: checkForUpdates },
            { label: 'About Weave', onClick: () => alert(`Weave v${WEAVE_VERSION}\nBuild things together, peer to peer.\nMIT licensed.`) },
          ]}
        />
      </nav>
      <div className="toolbar">
        {/* On a phone the toolbar is a tab bar at the bottom; "mobile-only" and "not-mobile" pick its buttons. */}
        <ToolButton icon="notes" label="Places" className="mobile-only" on={placesOpen} onClick={() => setPlacesOpen((open) => !open)} />
        <ToolButton icon="home" label="Home" href="#/" on={route.length === 0 && !placesOpen} />
        <ToolButton icon="bookmark" label="Saved" href="#/saved" on={route[0] === 'saved'} className="not-mobile" />
        <ToolButton icon="inbox" label={`Inbox${inbox ? ` (${inbox})` : ''}`} href="#/inbox" on={route[0] === 'inbox' && !placesOpen} />
        <ToolButton icon="users" label="People" href="#/people" on={route[0] === 'people' && !placesOpen} />
        <ToolButton icon="user" label="My hub" href="#/space" on={route[0] === 'space' && !route[1]} className="not-mobile" />
        <span className="tool-sep" />
        <ToolButton icon="pencil" label="Submit" onClick={() => setDialog({ kind: 'submit', space: space?.kind !== 'group' ? space?.id : undefined, board: route[2] === 'b' ? route[3] : undefined })} />
        <ToolButton icon="plus" label="New" onClick={() => setDialog({ kind: 'new' })} className="not-mobile" />
        {space && <ToolButton icon="userPlus" label="Invite" onClick={() => setDialog({ kind: 'invite', space })} className="not-mobile" />}
        <div className="brand">
          <WeaveMark size={40} />
          <div>
            <b>Weave</b>
            <small>for you &amp; your friends</small>
          </div>
          <small className="brand-side">
            Build
            <br />
            Share
            <br />
            Belong
          </small>
        </div>
      </div>
      <div className="panes">
        <Places spaces={spaces} chats={chats ?? []} route={route} waiting={waiting ?? []} inbox={inbox} onNew={() => setDialog({ kind: 'new' })} />
        {body}
      </div>
      <div className="status-bar">
        <p className="status-bar-field">
          <Avatar did={me.did} size={12} /> {me.name ?? 'You'}
        </p>
        <p className="status-bar-field">{status ? (online ? `${status.peers} peer${status.peers === 1 ? '' : 's'} connected` : 'no peers right now') : 'connecting…'}</p>
        <p className="status-bar-field">
          <Icon name="lock" size={12} /> end-to-end encrypted
        </p>
      </div>
      {dialog?.kind === 'new' && <NewDialog onClose={close} />}
      {dialog?.kind === 'invite' && <InviteDialog space={dialog.space} onClose={close} />}
      {dialog?.kind === 'submit' && <SubmitDialog spaces={spaces} space={dialog.space} board={dialog.board} onClose={close} />}
      {dialog?.kind === 'notify' && <NotificationSettings onClose={close} />}
      {dialog?.kind === 'desk' && <SetupDeskDialog onClose={close} />}
    </div>
  );
}

function App() {
  const [state, setState] = useState<AppState>();
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    bridge.state().then(setState, () => setState({ home: '?', hasIdentity: true, connected: false }));
  }, [nonce]);
  const refresh = () => {
    setNonce((n) => n + 1);
    bump();
  };
  return (
    <>
      {!state ? (
        bridge.phone && <PhoneConnecting />
      ) : bridge.phone && !state.hasIdentity ? (
        <PhonePairing onDone={refresh} />
      ) : bridge.phone && !state.connected ? (
        <PhoneNotConnected name={state.home} onRetry={refresh} />
      ) : !state.hasIdentity ? (
        <Onboarding onDone={refresh} />
      ) : !state.connected ? (
        <NotConnected home={state.home} onRetry={refresh} />
      ) : location.hash.startsWith('#/overlay') ? (
        <MentionsPanel />
      ) : (
        <>
          <Shell />
          {/* Connecting agents is about the computer they run on, not this phone. */}
          {!bridge.phone && <AgentsOffer />}
          <AgentAsks />
          <WorkerChooser />
          {/* A phone app is updated with the app itself, not from Weave's desktop releases. */}
          {!bridge.phone && <UpdatePrompt />}
        </>
      )}
      <Toasts />
    </>
  );
}

applySkin(loadSkin());
applyMode(loadMode());
startNotifications();
startAppOpens();
createRoot(document.getElementById('root')!).render(<App />);
