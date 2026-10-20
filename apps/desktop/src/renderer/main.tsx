import { useEffect, useState, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import type { CoauthorRequest, KnockInfo, MembershipRequestInfo } from '@weave/node/client';
import type { Admission, BoardInfo, ChannelInfo, ChatInfo, MemberInfo, PostInfo, Profile, RoomInfo, SpaceInfo, Status } from '@weave/node/client';
import { ChatView } from './chat.tsx';
import { KeysView, Onboarding } from './keys.tsx';
import { HomeFeed } from './home.tsx';
import { RoomsView } from './rooms.tsx';
import { Icon, type IconName } from './icons.tsx';
import { api, applySkin, bridge, bump, isActive, isUnread, loadSkin, navigate, shortDid, SKINS, useApi, useRoute, useTick, type AppState, type Skin } from './lib.ts';
import { boardIcon, PostList, PostView, spaceHref, spaceLabel, SubmitDialog } from './posts.tsx';
import { Avatar, Menu, Sprite, Toasts, WeaveMark } from './ui.tsx';
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

type Dialog = { kind: 'new' } | { kind: 'invite'; space: SpaceInfo } | { kind: 'submit'; space?: string; board?: string };

// ---------------------------------------------------------------- places tree

function TreeLink({ href, icon, sprite, face, label, on, unread, badge, depth = 0 }: { href: string; icon?: IconName; sprite?: string; face?: boolean; label: ReactNode; on: boolean; unread?: boolean; badge?: number; depth?: number }) {
  return (
    <li style={{ paddingLeft: depth * 14 }}>
      <a className={`tree-link${on ? ' on' : ''}${unread ? ' unread' : ''}`} href={href}>
        {sprite ? <Sprite seed={sprite} size={16} face={face} /> : icon && <Icon name={icon} />}
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
  const { data: rooms } = useApi(() => (space.kind === 'project' ? api<RoomInfo[]>('rooms', space.id) : Promise.resolve([])), [space.id]);
  const unread = (channels ?? []).some((c) => isUnread(`${space.id}/${c.name}`, c.last));
  const [view, arg] = [route[2], route[3]];
  return (
    <>
      <TreeLink href={base} sprite={space.id} label={space.name} on={open && !view} unread={!open && unread} badge={waiting} />
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
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/live`} icon="zap" label={`Live${rooms?.length ? ` (${rooms.length})` : ''}`} on={view === 'live'} unread={!!rooms?.length} />}
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
      <header className="pane-head">
        <b>Places</b>
      </header>
      <ul className="tree-view">
        <TreeLink href="#/" icon="home" label="Home" on={route.length === 0} />
        <TreeLink href="#/saved" icon="bookmark" label="Saved" on={route[0] === 'saved'} />
        <TreeLink href="#/inbox" icon="inbox" label={`Inbox${inbox ? ` (${inbox})` : ''}`} on={route[0] === 'inbox'} />
        <TreeLink href="#/people" icon="users" label="People" on={route[0] === 'people'} />
        <TreeLink href="#/memberships" icon="star" label="Memberships" on={route[0] === 'memberships'} />
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
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------- spaces

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
  if (space.kind === 'group' && view === 'settings') {
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
  } else if (view === 'live') {
    body = <RoomsView project={space} members={list} meDid={me.did} />;
  } else if (view === 'settings') {
    body = <ProjectSettings project={space} spaces={spaces} members={list} meDid={me.did} />;
  } else {
    body = <ProjectHome project={space} members={list} meDid={me.did} meName={me.name} spaces={spaces} onInvite={invite} />;
  }

  return (
    <>
      <div className="center">
        {mine.length > 0 && view !== 'settings' && (
          <a className="notice" href={`${spaceHref(space)}/settings`}>
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

function PublicPost({ id, me, spaces }: { id: string; me: Profile; spaces: SpaceInfo[] }) {
  const { data, error } = useApi(() => api<PostInfo>('post', id), [id]);
  if (error) return <Page title="Post">{error}</Page>;
  return data ? <LonePost post={data} meDid={me.did} spaces={spaces} /> : null;
}

// ---------------------------------------------------------------- window

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
  const inbox = (waiting?.length ?? 0) + (requests?.length ?? 0) + (knocks?.length ?? 0) + (coauthors?.length ?? 0);
  const [dialog, setDialog] = useState<Dialog>();
  const [skin, setSkin] = useState<Skin>(loadSkin);
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
    else if (route[0] === 'memberships') center = <MembershipsView meDid={me.did} meName={me.name} />;
    else if (route[0] === 'post' && route[1]) center = <PublicPost id={route[1]} me={me} spaces={spaces} />;
    else if (route[0] === 'saved')
      center = <PostList title={<>Saved</>} query={{ saved: true }} spaces={spaces} meDid={me.did} empty="Save posts to find them here again. Only you can see what you save." />;
    else center = <HomeFeed spaces={spaces} meDid={me.did} onSubmit={() => setDialog({ kind: 'submit' })} />;
    body = <div className="center">{center}</div>;
  }

  return (
    <div className={`window app-window${placesOpen ? ' places-open' : ''}`}>
      <div className="title-bar">
        <div className="title-bar-text">
          <WeaveMark size={14} /> Weave - [{where}]
        </div>
        <div className="title-bar-controls">
          <button aria-label="Minimize" tabIndex={-1} />
          <button aria-label="Maximize" tabIndex={-1} />
          <button aria-label="Close" tabIndex={-1} onClick={() => window.close()} />
        </div>
      </div>
      <nav className="menubar">
        <Menu
          label="File"
          items={[
            { label: 'New project, community or group…', onClick: () => setDialog({ kind: 'new' }) },
            { label: 'Join with an invite link…', onClick: () => setDialog({ kind: 'new' }) },
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
            'sep',
            { label: 'Refresh', onClick: bump },
            'sep',
            ...(Object.keys(SKINS) as Skin[]).map((s) => ({
              label: `${s === skin ? '● ' : ''}${SKINS[s]} look`,
              onClick: () => {
                applySkin(s);
                setSkin(s);
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
        <Menu label="Help" items={[{ label: 'About Weave', onClick: () => alert(`Weave v${WEAVE_VERSION}\nBuild things together, peer to peer.\nMIT licensed.`) }]} />
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
      {!state ? null : !state.hasIdentity ? <Onboarding onDone={refresh} /> : !state.connected ? <NotConnected home={state.home} onRetry={refresh} /> : <Shell />}
      <Toasts />
    </>
  );
}

applySkin(loadSkin());
createRoot(document.getElementById('root')!).render(<App />);
