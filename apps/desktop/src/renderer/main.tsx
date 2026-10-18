import { useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import type { ChannelInfo, GroupInfo, MemberInfo, Profile, Status } from '@weave/node/client';
import { ChatView } from './chat.tsx';
import { api, applyAppTheme, bridge, bump, hue, isActive, isUnread, navigate, shortDid, useApi, useRoute, useTick, type AppState } from './lib.ts';
import { attempt, Avatar, Toasts, WeaveMark } from './ui.tsx';
import { DiscussionView, FeedView, GroupDialog, GroupPosts, InviteDialog, IssuesView, NotConnected, Onboarding, PeopleView, SpaceView, VotesView } from './views.tsx';

// ---------------------------------------------------------------- server rail

function RailGroup({ group, active }: { group: GroupInfo; active: boolean }) {
  useTick(); // unread state lives in localStorage; re-check on every live update
  const { data: channels } = useApi(() => api<ChannelInfo[]>('channels', group.id), [group.id]);
  const unread = !active && (channels ?? []).some((c) => isUnread(`${group.id}/${c.name}`, c.last));
  return (
    <a className={`rail-item${active ? ' on' : ''}${unread ? ' unread' : ''}`} href={`#/g/${group.id}`} title={group.name}>
      <span className="pill" />
      <span className="rail-icon group-icon" style={{ '--h': hue(group.id) } as React.CSSProperties}>
        {group.name
          .split(/\s+/)
          .map((w) => w[0])
          .join('')
          .slice(0, 2)
          .toUpperCase()}
      </span>
    </a>
  );
}

function Rail({ groups, activeGroup, home, onAdd }: { groups: GroupInfo[]; activeGroup?: string; home: boolean; onAdd(): void }) {
  return (
    <nav className="rail">
      <a className={`rail-item${home ? ' on' : ''}`} href="#/" title="Home">
        <span className="pill" />
        <span className="rail-icon home-icon">
          <WeaveMark size={28} />
        </span>
      </a>
      <div className="rail-sep" />
      {groups.map((g) => (
        <RailGroup key={g.id} group={g} active={g.id === activeGroup} />
      ))}
      <button className="rail-item add" title="Start or join a group" onClick={onAdd}>
        <span className="rail-icon">+</span>
      </button>
    </nav>
  );
}

// ---------------------------------------------------------------- channel sidebar

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

function GroupSidebar({ group, view, arg, me, status, onInvite }: { group: GroupInfo; view: string; arg?: string; me: Profile; status?: Status; onInvite(): void }) {
  useTick();
  const { data: channels } = useApi(() => api<ChannelInfo[]>('channels', group.id), [group.id]);
  const [adding, setAdding] = useState(false);
  const [newName, setNewName] = useState('');
  const work = (key: string, icon: string, label: string) => (
    <a className={`side-item${view === key ? ' on' : ''}`} href={`#/g/${group.id}/${key}`}>
      <span className="side-icon">{icon}</span>
      {label}
    </a>
  );
  const addChannel = async (e: FormEvent) => {
    e.preventDefault();
    const c = await attempt(() => api<ChannelInfo>('createChannel', { group: group.id, name: newName }));
    if (c) {
      setAdding(false);
      setNewName('');
      navigate(`#/g/${group.id}/c/${c.name}`);
    }
  };
  return (
    <aside className="sidebar">
      <header className="side-head">
        <b title={group.name}>{group.name}</b>
        <button className="icon-btn" title="Invite someone" onClick={onInvite}>
          ＋👤
        </button>
      </header>
      <div className="side-scroll">
        <div className="side-section">
          <span>Channels</span>
          <button className="icon-btn" title="Create channel" onClick={() => setAdding((a) => !a)}>
            +
          </button>
        </div>
        {(channels ?? [{ name: 'general', topic: '' }]).map((c) => {
          const on = view === 'c' && (arg ?? 'general') === c.name;
          const unread = !on && isUnread(`${group.id}/${c.name}`, c.last);
          return (
            <a key={c.name} className={`side-item channel${on ? ' on' : ''}${unread ? ' unread' : ''}`} href={`#/g/${group.id}/c/${c.name}`}>
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
        <div className="side-section">
          <span>Working together</span>
        </div>
        {work('discussion', '💬', 'Discussion')}
        {work('votes', '🗳️', 'Votes')}
        {work('issues', '✅', 'Issues')}
        {work('posts', '📌', 'Posts')}
      </div>
      <UserPanel me={me} status={status} />
    </aside>
  );
}

// ---------------------------------------------------------------- member list

function MemberList({ members, meDid }: { members: MemberInfo[]; meDid: string }) {
  const online = members.filter((m) => m.did === meDid || isActive(m.lastActive));
  const offline = members.filter((m) => !online.includes(m));
  const row = (m: MemberInfo, on: boolean) => (
    <div key={m.did} className={`member${on ? '' : ' away'}`}>
      <a className="member-main" href={`#/space/${encodeURIComponent(m.did)}`} title={m.invitedByName ? `invited by ${m.invitedByName}` : 'founder'}>
        <Avatar did={m.did} name={m.name} size={32} status={on ? 'online' : 'offline'} />
        <span className="member-name">{m.did === meDid ? `${m.name ?? 'You'} (you)` : (m.name ?? shortDid(m.did))}</span>
      </a>
      {m.agents.map((agent) => (
        <div key={agent} className="member-agent" title={`${m.name ?? 'Their'}'s agent, signing with its own key`}>
          <span className="agent-dot">⚙</span>
          {agent} <span className="agent-tag">AGENT</span>
        </div>
      ))}
    </div>
  );
  return (
    <aside className="members">
      {online.length > 0 && <h4>Active — {online.length}</h4>}
      {online.map((m) => row(m, true))}
      {offline.length > 0 && <h4>Away — {offline.length}</h4>}
      {offline.map((m) => row(m, false))}
    </aside>
  );
}

// ---------------------------------------------------------------- the app

function GroupScreen({ group, groups, route, me, status, onInvite }: { group: GroupInfo; groups: GroupInfo[]; route: string[]; me: Profile; status?: Status; onInvite(): void }) {
  const view = route[2] ?? 'c';
  const arg = route[3];
  const { data: members } = useApi(() => api<MemberInfo[]>('members', group.id), [group.id]);
  const channel = arg ?? 'general';
  const { data: channels } = useApi(() => api<ChannelInfo[]>('channels', group.id), [group.id]);
  const topic = channels?.find((c) => c.name === channel)?.topic;
  const title = view === 'c' ? `# ${channel}` : { discussion: '💬 Discussion', votes: '🗳️ Votes', issues: '✅ Issues', posts: '📌 Posts' }[view] ?? group.name;
  return (
    <>
      <GroupSidebar group={group} view={view} arg={arg} me={me} status={status} onInvite={onInvite} />
      <main className="main">
        <header className="topbar">
          <b>{title}</b>
          {view === 'c' && topic && <span className="topic">{topic}</span>}
          <span className="topbar-note">🔒 end-to-end encrypted · {members?.length ?? group.members} members</span>
        </header>
        <div className="main-body">
          <div className={`content${view === 'c' ? '' : ' scroll'}`}>
            {view === 'c' && <ChatView group={group} channel={channel} meDid={me.did} meName={me.name} members={members ?? []} />}
            {view === 'discussion' && <DiscussionView group={group} threadId={arg} meDid={me.did} />}
            {view === 'votes' && <VotesView group={group} members={members ?? []} meDid={me.did} />}
            {view === 'issues' && <IssuesView group={group} meDid={me.did} />}
            {view === 'posts' && <GroupPosts group={group} groups={groups} meDid={me.did} />}
          </div>
          <MemberList members={members ?? []} meDid={me.did} />
        </div>
      </main>
    </>
  );
}

function Shell() {
  const route = useRoute();
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const { data: groups } = useApi(() => api<GroupInfo[]>('groups'), []);
  const { data: status } = useApi(() => api<Status>('status'), []);
  const [dialog, setDialog] = useState<'group' | 'invite'>();

  useEffect(() => applyAppTheme(me?.theme), [me?.theme]);
  if (!me || !groups) return <div className="app loading" />;

  const group = route[0] === 'g' ? groups.find((g) => g.id === route[1]) : undefined;
  return (
    <div className="app">
      <Rail groups={groups} activeGroup={group?.id} home={!group} onAdd={() => setDialog('group')} />
      {group ? (
        <GroupScreen group={group} groups={groups} route={route} me={me} status={status} onInvite={() => setDialog('invite')} />
      ) : (
        <>
          <HomeSidebar route={route} me={me} status={status} />
          <main className="main">
            <div className="main-body">
              <div className="content scroll">
                {route[0] === 'g' && <p className="empty">You're not in this group.</p>}
                {route[0] === 'space' && <SpaceView who={route[1]} groups={groups} meDid={me.did} />}
                {route[0] === 'people' && <PeopleView />}
                {route.length === 0 && <FeedView groups={groups} meDid={me.did} />}
              </div>
            </div>
          </main>
        </>
      )}
      {dialog === 'group' && <GroupDialog onClose={() => setDialog(undefined)} />}
      {dialog === 'invite' && group && <InviteDialog group={group} onClose={() => setDialog(undefined)} />}
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
