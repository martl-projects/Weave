import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { Admission, ChannelInfo, MemberInfo, Profile, SpaceInfo, Status } from '@weave/node/client';
import { ChatView } from './chat.tsx';
import { api, applyAppTheme, bridge, bump, hue, isActive, isUnread, navigate, shortDid, useApi, useRoute, useTick, type AppState } from './lib.ts';
import { attempt, Avatar, Toasts, WeaveMark } from './ui.tsx';
import {
  AdmissionCard,
  DiscussionView,
  FeedView,
  InviteDialog,
  IssuesView,
  NewDialog,
  NotConnected,
  Onboarding,
  PeopleView,
  ProjectPageView,
  ProjectUpdates,
  SpaceView,
  VotesView,
} from './views.tsx';

const prefix = (space: SpaceInfo) => (space.kind === 'project' ? 'p' : 'g');
const initials = (name: string) =>
  name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

// ---------------------------------------------------------------- server rail

function RailSpace({ space, active, waiting }: { space: SpaceInfo; active: boolean; waiting: number }) {
  useTick(); // unread state lives in localStorage; re-check on every live update
  const { data: channels } = useApi(() => api<ChannelInfo[]>('channels', space.id), [space.id]);
  const unread = !active && (channels ?? []).some((c) => isUnread(`${space.id}/${c.name}`, c.last));
  return (
    <a className={`rail-item${active ? ' on' : ''}${unread ? ' unread' : ''}`} href={`#/${prefix(space)}/${space.id}`} title={`${space.kind === 'project' ? 'Project' : 'Group'}: ${space.name}`}>
      <span className="pill" />
      <span className={`rail-icon ${space.kind}-icon`} style={{ '--h': hue(space.id) } as React.CSSProperties}>
        {space.kind === 'group' ? '👥' : initials(space.name)}
      </span>
      {waiting > 0 && <span className="rail-badge">{waiting}</span>}
    </a>
  );
}

function Rail({ spaces, active, home, waiting, onAdd }: { spaces: SpaceInfo[]; active?: string; home: boolean; waiting: Admission[]; onAdd(): void }) {
  const projects = spaces.filter((s) => s.kind === 'project');
  const groups = spaces.filter((s) => s.kind === 'group');
  const waitingFor = (id: string) => waiting.filter((a) => a.project.id === id).length;
  return (
    <nav className="rail">
      <a className={`rail-item${home ? ' on' : ''}`} href="#/" title="Home">
        <span className="pill" />
        <span className="rail-icon home-icon">
          <WeaveMark size={28} />
        </span>
      </a>
      {projects.length > 0 && <div className="rail-sep" title="Projects" />}
      {projects.map((p) => (
        <RailSpace key={p.id} space={p} active={p.id === active} waiting={waitingFor(p.id)} />
      ))}
      {groups.length > 0 && <div className="rail-sep" title="Groups" />}
      {groups.map((g) => (
        <RailSpace key={g.id} space={g} active={g.id === active} waiting={0} />
      ))}
      <button className="rail-item add" title="New project or group, or join with a link" onClick={onAdd}>
        <span className="rail-icon">+</span>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------- sidebar

function UserPanel({ me, status }: { me: Profile; status?: Status }) {
  const online = !!status && status.peers > 0;
  return (
    <a className="user-panel" href="#/space" title="Your space">
      <Avatar did={me.did} name={me.name} size={32} status={online ? 'online' : 'offline'} />
      <span className="user-text">
        <b>{me.name ?? 'You'}</b>
        <small>{status ? `${status.peers} peer${status.peers === 1 ? '' : 's'} connected` : 'connecting…'}</small>
      </span>
      <span className="gear" aria-hidden="true">
        ⚙
      </span>
    </a>
  );
}

function HomeSidebar({ route, me, status }: { route: string[]; me: Profile; status?: Status }) {
  const link = (href: string, icon: string, label: string, on: boolean) => (
    <a className={`side-item${on ? ' on' : ''}`} href={href}>
      <span className="side-icon">{icon}</span>
      {label}
    </a>
  );
  return (
    <aside className="sidebar">
      <header className="side-head">
        <b>Home</b>
      </header>
      <div className="side-scroll">
        {link('#/', '📰', 'Feed', route.length === 0)}
        {link('#/space', '✨', 'My space', route[0] === 'space' && (!route[1] || route[1] === me.did))}
        {link('#/people', '👥', 'People', route[0] === 'people')}
      </div>
      <UserPanel me={me} status={status} />
    </aside>
  );
}

function SpaceSidebar({ space, view, arg, me, status, onInvite, waiting }: { space: SpaceInfo; view: string; arg?: string; me: Profile; status?: Status; onInvite(): void; waiting: number }) {
  useTick();
  const { data: channels } = useApi(() => api<ChannelInfo[]>('channels', space.id), [space.id]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const base = `#/${prefix(space)}/${space.id}`;
  const work = (key: string, icon: string, label: string, badge?: number) => (
    <a className={`side-item${view === key ? ' on' : ''}`} href={`${base}/${key}`}>
      <span className="side-icon">{icon}</span>
      {label}
      {!!badge && <span className="side-badge">{badge}</span>}
    </a>
  );
  const addChannel = async (e: FormEvent) => {
    e.preventDefault();
    const c = await attempt(() => api<ChannelInfo>('createChannel', { space: space.id, name: newName }));
    if (c) {
      setAdding(false);
      setNewName('');
      navigate(`${base}/c/${c.name}`);
    }
  };
  return (
    <aside className="sidebar">
      <header className="side-head">
        <span className="side-title">
          <small>{space.kind === 'project' ? 'Project' : 'Group'}</small>
          <b title={space.name}>{space.name}</b>
        </span>
        <button className="icon-btn" title="Invite someone" onClick={onInvite}>
          ＋👤
        </button>
      </header>
      <div className="side-scroll">
        {space.kind === 'project' && (
          <>
            {work('page', '🏷️', 'Project page', waiting)}
            {work('updates', '📌', 'Updates')}
          </>
        )}
        <div className="side-section">
          <span>Channels</span>
          <button className="icon-btn" title="Create channel" onClick={() => setAdding((a) => !a)}>
            +
          </button>
        </div>
        {(channels ?? [{ name: 'general', topic: '' }]).map((c) => {
          const on = view === 'c' && (arg ?? 'general') === c.name;
          const unread = !on && isUnread(`${space.id}/${c.name}`, c.last);
          return (
            <a key={c.name} className={`side-item channel${on ? ' on' : ''}${unread ? ' unread' : ''}`} href={`${base}/c/${c.name}`}>
              <span className="side-icon hash">#</span>
              {c.name}
            </a>
          );
        })}
        {adding && (
          <form className="new-channel" onSubmit={addChannel}>
            <input autoFocus placeholder="new-channel" value={newName} onChange={(e) => setNewName(e.target.value)} onBlur={() => !newName && setAdding(false)} />
          </form>
        )}
        {space.kind === 'project' && (
          <>
            <div className="side-section">
              <span>Working together</span>
            </div>
            {work('discussion', '💬', 'Discussion')}
            {work('votes', '🗳️', 'Votes')}
            {work('issues', '✅', 'Issues')}
          </>
        )}
      </div>
      <UserPanel me={me} status={status} />
    </aside>
  );
}

// ---------------------------------------------------------------- member list

function MemberList({ space, members, meDid }: { space: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const online = members.filter((m) => m.did === meDid || isActive(m.lastActive));
  const offline = members.filter((m) => !online.includes(m));
  const row = (m: MemberInfo, on: boolean) => {
    const how = m.via ? `via ${m.via.name}${m.invitedByName ? `, let in by ${m.invitedByName}` : ''}` : m.invitedByName ? `invited by ${m.invitedByName}` : 'founder';
    return (
      <div key={m.did} className={`member${on ? '' : ' away'}`}>
        <a className="member-main" href={`#/space/${encodeURIComponent(m.did)}`} title={how}>
          <Avatar did={m.did} name={m.name} size={32} status={on ? 'online' : 'offline'} />
          <span className="member-name">
            {m.did === meDid ? `${m.name ?? 'You'} (you)` : (m.name ?? shortDid(m.did))}
            {m.maintainer && <span className="crown" title="Maintainer">★</span>}
          </span>
        </a>
        {m.via && <div className="member-via">👥 {m.via.name}</div>}
        {m.agents.map((agent) => (
          <div key={agent} className="member-agent" title={`${m.name ?? 'Their'}'s agent, signing with its own key`}>
            <span className="agent-dot">⚙</span>
            {agent} <span className="agent-tag">AGENT</span>
          </div>
        ))}
      </div>
    );
  };
  const noun = space.kind === 'project' ? 'participants' : 'members';
  return (
    <aside className="members">
      <h4 className="members-title">{members.length} {noun}</h4>
      {online.length > 0 && <h4>Active — {online.length}</h4>}
      {online.map((m) => row(m, true))}
      {offline.length > 0 && <h4>Away — {offline.length}</h4>}
      {offline.map((m) => row(m, false))}
    </aside>
  );
}

// ---------------------------------------------------------------- screens

function SpaceScreen({ space, spaces, route, me, status, waiting, onInvite }: { space: SpaceInfo; spaces: SpaceInfo[]; route: string[]; me: Profile; status?: Status; waiting: Admission[]; onInvite(): void }) {
  const view = route[2] ?? 'c';
  const arg = route[3];
  const { data: members } = useApi(() => api<MemberInfo[]>('members', space.id), [space.id]);
  const { data: channels } = useApi(() => api<ChannelInfo[]>('channels', space.id), [space.id]);
  const channel = arg ?? 'general';
  const topic = channels?.find((c) => c.name === channel)?.topic;
  const mine = waiting.filter((a) => a.project.id === space.id);
  const title =
    view === 'c' ? `# ${channel}` : ({ discussion: '💬 Discussion', votes: '🗳️ Votes', issues: '✅ Issues', updates: '📌 Updates', page: '🏷️ Project page' } as Record<string, string>)[view] ?? space.name;
  const isProject = space.kind === 'project';
  return (
    <>
      <SpaceSidebar space={space} view={view} arg={arg} me={me} status={status} onInvite={onInvite} waiting={mine.length} />
      <main className="main">
        <header className="topbar">
          <b>{title}</b>
          {view === 'c' && topic && <span className="topic">{topic}</span>}
          <span className="topbar-note">
            🔒 end-to-end encrypted · {members?.length ?? space.members} {isProject ? 'participants' : 'members'}
          </span>
        </header>
        {isProject && mine.length > 0 && view !== 'page' && (
          <div className="banner">
            <AdmissionCard admission={mine[0]} />
            {mine.length > 1 && <a href={`#/p/${space.id}/page`}>+{mine.length - 1} more</a>}
          </div>
        )}
        <div className="main-body">
          <div className={`content${view === 'c' ? '' : ' scroll'}`}>
            {view === 'c' && <ChatView space={space} channel={channel} meDid={me.did} meName={me.name} members={members ?? []} />}
            {isProject && view === 'discussion' && <DiscussionView project={space} threadId={arg} meDid={me.did} />}
            {isProject && view === 'votes' && <VotesView project={space} members={members ?? []} meDid={me.did} />}
            {isProject && view === 'issues' && <IssuesView project={space} meDid={me.did} />}
            {isProject && view === 'updates' && <ProjectUpdates project={space} spaces={spaces} meDid={me.did} />}
            {isProject && view === 'page' && <ProjectPageView project={space} spaces={spaces} members={members ?? []} meDid={me.did} />}
          </div>
          <MemberList space={space} members={members ?? []} meDid={me.did} />
        </div>
      </main>
    </>
  );
}

function Shell() {
  const route = useRoute();
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const { data: status } = useApi(() => api<Status>('status'), []);
  const { data: waiting } = useApi(() => api<Admission[]>('admissions'), []);
  const [dialog, setDialog] = useState<'new' | 'invite'>();

  useEffect(() => applyAppTheme(me?.theme), [me?.theme]);
  if (!me || !spaces) return <div className="app loading" />;

  const space = route[0] === 'p' || route[0] === 'g' ? spaces.find((s) => s.id === route[1]) : undefined;
  return (
    <div className="app">
      <Rail spaces={spaces} active={space?.id} home={!space} waiting={waiting ?? []} onAdd={() => setDialog('new')} />
      {space ? (
        <SpaceScreen space={space} spaces={spaces} route={route} me={me} status={status} waiting={waiting ?? []} onInvite={() => setDialog('invite')} />
      ) : (
        <>
          <HomeSidebar route={route} me={me} status={status} />
          <main className="main">
            <div className="main-body">
              <div className="content scroll">
                {(route[0] === 'p' || route[0] === 'g') && <p className="empty">You're not in this {route[0] === 'p' ? 'project' : 'group'}.</p>}
                {route[0] === 'space' && <SpaceView who={route[1]} spaces={spaces} meDid={me.did} />}
                {route[0] === 'people' && <PeopleView />}
                {route.length === 0 && <FeedView spaces={spaces} meDid={me.did} />}
              </div>
            </div>
          </main>
        </>
      )}
      {dialog === 'new' && <NewDialog onClose={() => setDialog(undefined)} />}
      {dialog === 'invite' && space && <InviteDialog space={space} onClose={() => setDialog(undefined)} />}
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

createRoot(document.getElementById('root')!).render(<App />);
