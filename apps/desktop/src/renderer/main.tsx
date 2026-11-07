import { checkForUpdates, UpdatePrompt, UpdateSettings } from './update.tsx';
import { useEffect, useState, type ReactNode } from 'react';
import { LANGUAGES, type LanguageSetting } from '@weave/core';
import { t, TextsProvider, useTexts } from './texts.tsx';
import { createRoot } from 'react-dom/client';
import type { CoauthorRequest, KnockInfo, MembershipRequestInfo, PermissionRequest, ServiceProfileInfo } from '@weave/node/client';
import type { Admission, BoardInfo, ChannelInfo, ChatInfo, MemberInfo, PostInfo, Profile, SessionInfo, WebsiteInfo, SpaceInfo, Status } from '@weave/node/client';
import { ArcadeWell, useArcade } from './arcade.tsx';
import { ChatView } from './chat.tsx';
import { InviteLinkDialog, InviteToDialog, isInviteHref, openInviteLink } from './invites.tsx';
import { HintSigns, NotificationSettings, startNotifications, useHints, type Shown } from './notify.tsx';
import { MarksSettings } from './marks.tsx';
import { KeysView, Onboarding, Unlock } from './keys.tsx';
import { AgentAsks, AgentsOffer } from './agents.tsx';
import { PhoneConnecting, PhoneNotConnected, PhonePairing } from './phones.tsx';
import { HomeFeed } from './home.tsx';
import { ProjectAvailableView, ProjectLiveView, ProjectServicesView } from './websites.tsx';
import { serviceIcon } from './addservice.tsx';
import { CatalogView } from './catalog.tsx';
import { LensSwitch, LensView, useLensChoice } from './lens.tsx';
import { MentionsPanel } from './overlay.tsx';
import { Picker } from './picker.tsx';
import { RoutinesPage, SetupDeskDialog } from './routines.tsx';
import { chooseWorker, SessionsView, WorkerChooser } from './sessions.tsx';
import { Icon, type IconName } from './icons.tsx';
import { api, applyMode, applySkin, bridge, bump, enrollLinkOpened, isActive, isUnread, loadMode, loadSkin, MODES, navigate, postRefOfHref, shortDid, SKINS, SPACE_LINK, spaceRoute, useApi, useRoute, useSeenTick, type AppState, type Mode, type Skin } from './lib.ts';
import { boardIcon, postHref, PostList, PostView, spaceHref, spaceLabel, SubmitDialog } from './posts.tsx';
import { attempt, Avatar, Menu, Modal, ProjectIcon, Sprite, toast, Toasts, WeaveMark } from './ui.tsx';
import { GroupIcon, SpacePhoto } from './avatar-editor.tsx';
import { AgentAvatar } from './avatar.tsx';
import { startAppOpens } from './accounts.tsx';
import { onlyAWebsite, SpaceServices } from './services.tsx';
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

type Dialog = { kind: 'new' } | { kind: 'notify' } | { kind: 'marks' } | { kind: 'updates' } | { kind: 'desk' } | { kind: 'invite'; space: SpaceInfo } | { kind: 'link' } | { kind: 'submit'; space?: string; board?: string };

// ---------------------------------------------------------------- places tree

function TreeLink({ href, icon, sprite, image, face, group, label, on, unread, badge, hint, depth = 0 }: { href: string; icon?: IconName; sprite?: string; image?: string; face?: boolean; group?: SpaceInfo; label: ReactNode; on: boolean; unread?: boolean; badge?: number; hint?: Shown; depth?: number }) {
  // What your hint services say: a number (with badge, e.g. who waits to join), a tint, signs under the number.
  const count = (badge ?? 0) + (hint?.count ?? 0);
  return (
    <li style={{ paddingLeft: depth * 14 }}>
      <a className={`tree-link${on ? ' on' : ''}${unread ? ' unread' : ''}${hint?.tone ? ` tint-${hint.tone}` : ''}`} href={href} title={hint?.tooltip}>
        {/* People (face): their avatar; groups: their photo or their people's faces; spaces: their icon or sprite. */}
        {group ? <GroupIcon space={group} size={16} /> : sprite ? face ? <Avatar did={sprite} size={16} /> : image ? <ProjectIcon id={sprite} icon={image} size={16} /> : <Sprite seed={sprite} size={16} /> : icon && <Icon name={icon} />}
        <span className="tree-label">{label}</span>
        {(!!count || !!hint?.signs.length) && (
          <span className="tree-hints">
            {!!count && <span className="badge">{count}</span>}
            {hint && <HintSigns signs={hint.signs} />}
          </span>
        )}
      </a>
    </li>
  );
}

/** A space in the tree; the open one shows its boards and channels underneath. */
function TreeSpace({ space, route, waiting }: { space: SpaceInfo; route: string[]; waiting: number }) {
  useSeenTick(); // unread state lives in localStorage; re-check when something was marked seen
  const { t } = useTexts();
  const base = spaceHref(space);
  const open = route[1] === space.id;
  // Its channels come with the space itself: one `spaces` answer for the whole tree, not a call per space (G5N4EzO0).
  const channels = space.channels;
  const { data: boards } = useApi(() => (open && space.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([])), [space.id, open]);
  const { data: rooms } = useApi(() => (open && space.kind === 'project' ? api<WebsiteInfo[]>('websites', space.id) : Promise.resolve([])), [space.id, open]);
  const { data: services } = useApi(() => (open && space.kind === 'project' ? api<ServiceProfileInfo[]>('servicesIn', space.id).then((all) => all.filter((s) => !onlyAWebsite(s.contract))).catch(() => []) : Promise.resolve([])), [space.id, open]);
  const unread = (channels ?? []).some((c) => isUnread(`${space.id}/${c.name}`, c.last));
  const [view, arg] = [route[2], route[3]];
  // What waits for you here (hints: Unread counts on the node), for the space and what shows of it.
  const shownBoards = open && space.kind === 'project' ? (boards ?? []) : [];
  const shownChannels = open ? (channels ?? []) : [];
  const [here, ...under] = useHints('place', [{ space: space.id }, ...shownBoards.map((b) => ({ board: { space: space.id, name: b.name } })), ...shownChannels.map((c) => ({ channel: { space: space.id, name: c.name } }))]);
  const boardHint = (name: string) => under[shownBoards.findIndex((b) => b.name === name)];
  const channelHint = (name: string) => under[shownBoards.length + shownChannels.findIndex((c) => c.name === name)];
  return (
    <>
      <TreeLink href={base} sprite={space.id} image={space.icon} group={space.kind === 'group' ? space : undefined} label={space.name} on={open && !view} unread={!open && unread} badge={waiting} hint={here} />
      {open && (
        <>
          {space.kind === 'project' &&
            (boards ?? []).map((b) => <TreeLink key={b.name} depth={1} href={`${base}/b/${b.name}`} icon={boardIcon(b)} label={`${b.title} (${b.count})`} on={view === 'b' && arg === b.name} hint={boardHint(b.name)} />)}
          {(channels ?? []).map((c) => (
            <TreeLink
              key={c.name}
              depth={1}
              href={space.kind === 'project' && c.name === 'general' ? base : `${base}/c/${c.name}`}
              icon="hash"
              label={c.name}
              on={space.kind === 'project' && c.name === 'general' ? false : view === 'c' && (arg ?? 'general') === c.name}
              unread={isUnread(`${space.id}/${c.name}`, c.last)}
              hint={channelHint(c.name)}
            />
          ))}
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/live`} icon="globe" label={rooms?.length ? t('nav.live.n', { n: rooms.length }) : t('nav.live')} on={view === 'live'} unread={!!rooms?.length} />}
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/available`} icon="store" label={t('nav.available')} on={view === 'available'} />}
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/services`} icon="zap" label={t('nav.services')} on={view === 'services' && !arg} />}
          {space.kind === 'project' && (services ?? []).map((s) => <TreeLink key={s.did} depth={2} href={`${base}/services/${s.did}`} icon={serviceIcon(s)} label={s.name} on={view === 'services' && arg === s.did} />)}
          <TreeLink depth={1} href={`${base}/catalog`} icon="bookmark" label={t('nav.catalog')} on={view === 'catalog'} />
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/routines`} icon="clock" label={t('nav.routines')} on={view === 'routines'} />}
          {space.kind === 'project' && <TreeLink depth={1} href={`${base}/settings`} icon="gear" label={t('nav.settings')} on={view === 'settings'} badge={waiting} />}
          {space.kind === 'community' && <TreeLink depth={1} href={`${base}/about`} icon="gear" label={t('nav.about')} on={view === 'about'} />}
          {space.kind === 'group' && <TreeLink depth={1} href={`${base}/settings`} icon="gear" label={t('nav.settings')} on={view === 'settings'} />}
        </>
      )}
    </>
  );
}

function Places({ spaces, chats, route, waiting, inbox, onNew }: { spaces: SpaceInfo[]; chats: ChatInfo[]; route: string[]; waiting: Admission[]; inbox: number; onNew(): void }) {
  useSeenTick(); // unread state lives in localStorage
  const { t } = useTexts();
  const chatHints = useHints('place', chats.map((c) => ({ space: c.space.id })));
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
        {list.length === 0 && <li className="tree-none">{t('tree.none')}</li>}
      </>
    );
  };
  return (
    <aside className="places">
      <ArcadeWellIfOn />
      <header className="pane-head">
        <b>{t('tree.places')}</b>
      </header>
      <ul className="tree-view">
        <TreeLink href="#/" icon="home" label={t('nav.home')} on={route.length === 0} />
        <TreeLink href="#/saved" icon="bookmark" label={t('nav.saved')} on={route[0] === 'saved'} />
        <TreeLink href="#/inbox" icon="inbox" label={inbox ? t('nav.inbox.n', { n: inbox }) : t('nav.inbox')} on={route[0] === 'inbox'} />
        <TreeLink href="#/people" icon="users" label={t('nav.people')} on={route[0] === 'people'} />
        <TreeLink href="#/memberships" icon="star" label={t('nav.memberships')} on={route[0] === 'memberships'} />
        {bridge.workOn && <TreeLink href="#/sessions" icon="code" label={t('nav.sessions')} on={route[0] === 'sessions'} />}
        <li className="tree-head">
          <Icon name="message" /> {t('tree.chats')}
        </li>
        {chats.map((c, i) => (
          <TreeLink
            key={c.space.id}
            href={`#/d/${c.space.id}`}
            sprite={c.peer.did}
            face
            label={c.peer.name ?? shortDid(c.peer.did)}
            on={route[0] === 'd' && route[1] === c.space.id}
            unread={!!c.last && !c.last.mine && route[1] !== c.space.id && isUnread(`${c.space.id}/general`, c.last.time)}
            hint={chatHints[i]}
          />
        ))}
        {chats.length === 0 && <li className="tree-none">{t('tree.chats.none')}</li>}
        {section('community', t('tree.communities'), 'community')}
        {section('project', t('tree.projects'), 'zap')}
        {section('group', t('tree.groups'), 'users')}
        {spaces.some((s) => s.closed) && (
          <>
            <li className="tree-head">
              <Icon name="lock" /> {t('tree.closed')}
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
        <Icon name="plus" /> {t('tree.new')}
      </button>
    </aside>
  );
}

// ---------------------------------------------------------------- member list

function MemberList({ space, members, meDid }: { space: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { t } = useTexts();
  const online = members.filter((m) => m.did === meDid || isActive(m.lastActive));
  const offline = members.filter((m) => !online.includes(m));
  const crown = space.kind === 'project' ? 'maintainer' : space.kind === 'community' ? 'moderator' : 'founder';
  const row = (m: MemberInfo, on: boolean) => {
    const how = m.via
      ? m.invitedByName
        ? t('member.how.via.letin', { group: m.via.name, name: m.invitedByName })
        : t('member.how.via', { group: m.via.name })
      : m.invitedByName
        ? t('member.how.invited', { name: m.invitedByName })
        : t('role.founder');
    const crowned = m.maintainer || (space.kind !== 'project' && m.did === space.founder);
    return (
      <div key={m.did} className={`member${on ? '' : ' away'}`}>
        <a className="member-main" href={`#/space/${encodeURIComponent(m.did)}`} title={how}>
          <Avatar did={m.did} size={24} status={on ? 'online' : 'offline'} />
          <span className="member-name">
            {m.did === meDid ? t('member.you', { name: m.name ?? t('word.you') }) : (m.name ?? shortDid(m.did))}
            {crowned && (
              <span className="crown" title={t(`role.${crown}`)}>
                ★
              </span>
            )}
          </span>
        </a>
        {m.via && <div className="member-sub">{t('member.via.group', { group: m.via.name })}</div>}
        {m.agents.map((agent) => (
          <div key={agent} className="member-sub agent" title={m.name ? t('member.agent.title', { name: m.name }) : t('member.agent.title.theirs')}>
            <AgentAvatar person={m.did} agent={agent} size={14} /> {agent} <span className="agent-tag">{t('word.agent')}</span>
          </div>
        ))}
      </div>
    );
  };
  return (
    <aside className="members">
      <ArcadeWellIfOn />
      <header className="pane-head">
        <b>{t(space.kind === 'project' ? 'members.participants' : 'members.members', { n: members.length })}</b>
      </header>
      <div className="members-list sunken">
        {/* Its photo: its own picture, or everyone together holding up its banner (those online first). */}
        {space.photoInList && <SpacePhoto space={space} dids={[...online, ...offline].map((m) => m.did)} />}
        {online.length > 0 && <h4>{t('members.online', { n: online.length })}</h4>}
        {online.map((m) => row(m, true))}
        {offline.length > 0 && <h4>{t('members.away', { n: offline.length })}</h4>}
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
  const { t } = useTexts();
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
      {link(`${base}/live`, 'globe', rooms?.length ? t('nav.live.n', { n: rooms.length }) : t('nav.live'), view === 'live', !!rooms?.length)}
      {link(`${base}/available`, 'store', t('nav.available'), view === 'available')}
      {link(`${base}/services`, 'zap', t('nav.services'), view === 'services')}
      {boards.map((b) => link(`${base}/b/${b.name}`, boardIcon(b), b.title, view === 'b' && arg === b.name))}
      {link(`${base}/catalog`, 'bookmark', t('nav.catalog'), view === 'catalog')}
      {link(`${base}/routines`, 'clock', t('nav.routines'), view === 'routines')}
      {link(`${base}/settings`, 'gear', t('nav.settings'), view === 'settings')}
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
  const lensBoard = view === 'b' && arg ? boards?.find((b) => b.name === arg) : undefined;
  const [lensOn, chooseLens] = useLensChoice(space, lensBoard);
  const common = { meDid: me.did, meName: me.name, spaces, members: list };
  const invite = () => open({ kind: 'invite', space });
  const { t } = useTexts();

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
              <Icon name="userPlus" /> {t('space.invite')}
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
          empty={<>{t('posts.none.first')}</>}
        />
      );
  } else if (view === 'b' && arg) {
    const board = boards?.find((b) => b.name === arg);
    if (postId) body = <PostView id={postId} space={space} {...common} moderator={!!info?.maintainer} back={{ href: `${spaceHref(space)}/b/${arg}`, label: board?.title ?? arg }} />;
    // Its client service's view: required by its maintainers, or suggested and chosen here.
    else if (board?.lens && lensOn)
      body = (
        <section className="pane-main">
          <header className="pane-head">
            <b>
              p/{space.name} · {board.title}
            </b>
            <span className="pane-tools">
              <LensSwitch board={board} on={lensOn} choose={chooseLens} />
            </span>
          </header>
          <LensView space={space} board={board} meDid={me.did} onOpen={(post) => navigate(`${spaceHref(space)}/b/${arg}/${post}`)} />
        </section>
      );
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
            <>
              {board && <LensSwitch board={board} on={lensOn} choose={chooseLens} />}
              <button onClick={() => open({ kind: 'submit', space: space.id, board: arg })}>
                <Icon name="pencil" /> {t(board?.type === 'issues' ? 'board.open.issue' : board?.type === 'proposals' ? 'board.propose' : 'board.post')}
              </button>
            </>
          }
          above={board?.type === 'proposals' ? <DelegationBar project={space} members={list} meDid={me.did} /> : undefined}
          empty={<>{t('board.empty', { board: board?.title ?? arg })}</>}
        />
      );
  } else if (view === 'live') {
    body = <ProjectLiveView project={space} members={list} meDid={me.did} />;
  } else if (view === 'available') {
    body = <ProjectAvailableView project={space} />;
  } else if (view === 'services') {
    body = <ProjectServicesView project={space} members={list} meDid={me.did} focus={arg} />;
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
            <Icon name="inbox" /> {t('space.waiting', { name: mine[0].name ?? t('word.someone'), group: mine[0].group.name, more: mine.length - 1 })}
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
  const { t } = useTexts();
  const name = chat.peer.name ?? shortDid(chat.peer.did);
  const [inviting, setInviting] = useState(false);
  return (
    <div className="center">
      {inviting && <InviteToDialog chat={chat.space} peerName={name} onClose={() => setInviting(false)} />}
      {!chat.friend && (
        <div className="notice">
          <Icon name="lock" /> {t('chat.readonly', { name })}
        </div>
      )}
      <section className="pane-main">
        <header className="pane-head">
          <b>
            <Icon name="message" /> @{name}
          </b>
          <span className="pane-tools">
            {chat.friend && (
              <button onClick={() => setInviting(true)} title={t('chat.invite.title', { name })}>
                <Icon name="userPlus" /> {t('chat.invite.to')}
              </button>
            )}
            <button onClick={() => navigate(`#/space/${encodeURIComponent(chat.peer.did)}`)}>
              <Icon name="user" /> {t('chat.hub')}
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
  const { data, error, errorName } = useApi(() => api<PostInfo>('post', id), [id]);
  const { t } = useTexts();
  const home = data && postHref(data);
  useEffect(() => {
    if (home && home !== `#/post/${data.id}`) location.replace(home); // no back step into this redirect
  }, [home]);
  if (error) return <Page title={t('word.post')}>{errorName === 'daemon.post.not.found' || errorName === 'daemon.post.not.found.address' ? t('post.not.here') : error}</Page>;
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
    else toast(t('link.enroll.taken'));
    return;
  }
  if (isInviteHref(link)) return openInviteLink(link);
  if (!ref) return toast(t('link.paste'));
  if (!ref.startsWith('http')) return go(`#/post/${ref}`);
  api<PostInfo>('post', ref).then(
    (post) => go(postHref(post)),
    () => toast(t('link.post.not.here'), 'error'),
  );
}
bridge.onLink(openLink);

const CONTACT_LINK = /weave:contact:[A-Za-z0-9_-]+/;
const INVITE_IN_TEXT = /weave:(?:invite|knock):[A-Za-z0-9_-]+/;

/** Paste a link someone sent, or the whole message it came in: an invite asks to join, a contact link adds them, a post or space opens. */
function OpenLinkDialog({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const [text, setText] = useState('');
  const open = async () => {
    const invite = INVITE_IN_TEXT.exec(text)?.[0];
    if (invite) {
      onClose();
      return openInviteLink(invite);
    }
    const contact = CONTACT_LINK.exec(text)?.[0];
    if (contact) {
      const p = await attempt(() => api<Profile>('addContact', contact), t('contact.added'));
      if (!p) return;
      bump();
      onClose();
      return navigate(`#/space/${encodeURIComponent(p.did)}`);
    }
    const link = text.trim();
    if (!postRefOfHref(link) && !SPACE_LINK.test(link) && !link.startsWith('weave:enroll:')) return toast(t('link.open.unknown'), 'error');
    onClose();
    openLink(link);
  };
  return (
    <Modal title={t('link.open.title')} onClose={onClose}>
      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();
          void open();
        }}
      >
        <p className="small">{t('link.open.about')}</p>
        <textarea className="wide" required autoFocus rows={4} placeholder={t('link.open.placeholder')} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default">{t('inv.open')}</button>
        </div>
      </form>
    </Modal>
  );
}
// The side panel's links open here.
bridge.onRoute?.(navigate);

/**
 * A post in a list (and a line in the side panel) opens anywhere you click or tap it, not only on its title: a
 * plain click outside its buttons and links follows its title link. Selecting text doesn't count as a click.
 */
document.addEventListener('click', (event) => {
  if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
  const target = event.target as Element | null;
  const row = target?.closest?.<HTMLElement>('.post-row, .panel-line');
  if (!row || target!.closest('a, button, input, textarea, select, label, summary, [role="button"], .votes')) return;
  if (getSelection()?.toString()) return;
  row.querySelector<HTMLAnchorElement>('a.post-title, .panel-line > a')?.click();
});

/** Ctrl+click (Cmd+click on a Mac) on a post: work on it in the Claude app. */
document.addEventListener(
  'click',
  (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    const post = (event.target as Element | null)?.closest?.<HTMLElement>('[data-post]')?.dataset.post;
    if (!post) return;
    event.preventDefault();
    event.stopPropagation();
    if (!bridge.workOn) return toast(t('work.desktop.only'));
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
        if (r.delivered === 'clipboard') toast(t('work.clipboard'));
        else toast(t(r.how === 'new' ? 'work.new' : 'work.back', { where: r.where }));
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
  const { t } = useTexts();
  if (!bridge.windowControl || bridge.platform === 'darwin') return null;
  const control = (action: 'minimize' | 'maximize' | 'close') => () => void bridge.windowControl!(action).then((state) => setMaximized(state.maximized));
  return (
    <div className="title-bar-controls">
      <button aria-label={t('window.minimize')} tabIndex={-1} onClick={control('minimize')} />
      <button aria-label={t(maximized ? 'window.restore' : 'window.maximize')} tabIndex={-1} onClick={control('maximize')} />
      <button aria-label={t('window.close')} tabIndex={-1} onClick={control('close')} />
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
  const { t, setting: language, setLanguage } = useTexts();
  // On a phone the places tree is a screen of its own; picking something closes it.
  const [placesOpen, setPlacesOpen] = useState(false);
  const routeKey = route.join('/');
  useEffect(() => setPlacesOpen(false), [routeKey]);
  if (!me || !spaces) return <div className="desktop" />;

  const space = ['p', 'g', 'r'].includes(route[0]) ? spaces.find((s) => s.id === route[1]) : undefined;
  const chat = route[0] === 'd' ? chats?.find((c) => c.space.id === route[1]) : undefined;
  const whereName = ({ saved: 'nav.saved', inbox: 'nav.inbox', people: 'nav.people', memberships: 'nav.memberships', keys: 'nav.keys', space: route[1] ? 'nav.hub.theirs' : 'nav.hub', post: 'word.post' } as Record<string, string>)[route[0]] ?? 'nav.home';
  const where = space ? spaceLabel(space) : chat ? spaceLabel(chat.space) : t(whereName);
  const close = () => setDialog(undefined);
  const online = !!status && status.peers > 0;

  let body: ReactNode;
  if (space) body = <SpaceScreen space={space} spaces={spaces} route={route} me={me} waiting={waiting ?? []} open={setDialog} />;
  else if (chat) body = <DirectScreen chat={chat} me={me} />;
  else {
    let center: ReactNode;
    if (route[0] === 'd') center = <Page title={t('page.chat')}>{chats ? t('chat.not.here') : null}</Page>;
    else if (['p', 'g', 'r'].includes(route[0])) center = <Page title={t('page.not.here')}>{t('space.not.in', { kind: { p: 'project', g: 'group', r: 'community' }[route[0]] })}</Page>;
    else if (route[0] === 'space') center = <SpaceView who={route[1]} meDid={me.did} />;
    else if (route[0] === 'people') center = <PeopleView />;
    else if (route[0] === 'inbox') center = <InboxView admissions={waiting ?? []} knocks={knocks ?? []} />;
    else if (route[0] === 'keys') center = <KeysView />;
    else if (route[0] === 'sessions') center = <SessionsView />;
    else if (route[0] === 'memberships') center = <MembershipsView meDid={me.did} meName={me.name} />;
    else if (route[0] === 'post' && route[1]) center = <PublicPost id={route[1]} me={me} spaces={spaces} />;
    else if (route[0] === 'saved')
      center = <PostList title={<>{t('nav.saved')}</>} query={{ saved: true }} spaces={spaces} meDid={me.did} empty={t('saved.empty')} />;
    else center = <HomeFeed spaces={spaces} meDid={me.did} onSubmit={() => setDialog({ kind: 'submit' })} />;
    // Keys anyone could copy: said everywhere but on Keys & devices, which explains it.
    const unprotected = status?.keystoreWarning && route[0] !== 'keys' && (
      <a className="notice alarm" href="#/keys">
        <Icon name="lock" /> {t('keys.unprotected')}
      </a>
    );
    // A daemon without the services Weave ships (a checkout that didn't build them): no counts, no websites, no releases.
    const shippedMissing = status?.shippedMissing && (
      <div className="notice alarm">
        <Icon name="plug" /> {t('status.shipped.missing')}
      </div>
    );
    // Nobody else can bring a person's data back: said until a backup was saved, and again when the last one is a month old.
    const backupDue = status?.backupDue && !bridge.web && routeKey !== 'keys' && (
      <a className="notice" href="#/keys">
        <Icon name="lock" /> {t(status.backupDue === 'again' ? 'backup.due.again' : 'backup.due.never')}
      </a>
    );
    body = (
      <div className="center">
        {unprotected}
        {shippedMissing}
        {backupDue}
        {center}
      </div>
    );
  }

  return (
    <div className={`window app-window${placesOpen ? ' places-open' : ''}${bridge.platform === 'darwin' ? ' mac' : ''}`}>
      <div className="title-bar app-title" onDoubleClick={() => bridge.platform !== 'darwin' && void bridge.windowControl?.('maximize')}>
        <div className="title-bar-text">
          <WeaveMark size={14} /> {t('window.title', { where })}
        </div>
        <WindowButtons />
      </div>
      <nav className="menubar">
        <Menu
          label={t('menu.file')}
          items={[
            { label: t('menu.file.new'), onClick: () => setDialog({ kind: 'new' }) },
            { label: t('menu.file.join'), onClick: () => setDialog({ kind: 'new' }) },
            ...(bridge.web ? [] : [{ label: t('menu.file.desk'), onClick: () => setDialog({ kind: 'desk' as const }) }]),
            'sep',
            { label: t('menu.file.close'), onClick: () => window.close() },
          ]}
        />
        <Menu
          label={t('menu.view')}
          items={[
            { label: t('nav.home'), onClick: () => navigate('#/') },
            { label: t('nav.saved'), onClick: () => navigate('#/saved') },
            { label: t('nav.inbox'), onClick: () => navigate('#/inbox') },
            { label: t('nav.people'), onClick: () => navigate('#/people') },
            { label: t('nav.hub'), onClick: () => navigate('#/space') },
            { label: t('nav.keys'), onClick: () => navigate('#/keys') },
            ...(bridge.mentions ? [{ label: t('menu.view.mentions'), onClick: () => void bridge.mentions!('show') }] : []),
            'sep',
            { label: t('menu.view.refresh'), onClick: bump },
            { label: t('menu.view.notifications'), onClick: () => setDialog({ kind: 'notify' }) },
            { label: t('menu.view.marks'), onClick: () => setDialog({ kind: 'marks' }) },
            ...(bridge.update ? [{ label: t('menu.view.updates'), onClick: () => setDialog({ kind: 'updates' as const }) }] : []),
            'sep',
            ...(Object.keys(SKINS) as Skin[]).map((s) => ({
              label: `${s === skin ? '● ' : ''}${t(`look.${s}`)}`,
              onClick: () => {
                applySkin(s);
                setSkin(s);
              },
            })),
            'sep',
            // Light or dark: the Clean look has both; Arcade is always dark, Windows 95 and Cozy always light.
            ...(Object.keys(MODES) as Mode[]).map((m) => ({
              label: `${m === mode ? '● ' : ''}${t(`mode.${m}`)}`,
              disabled: skin !== 'clean',
              onClick: () => {
                applyMode(m);
                setMode(m);
              },
            })),
            'sep',
            // The language of this device: the system's, or one Weave ships. Names of languages stay in their own language.
            ...(['system', ...LANGUAGES] as LanguageSetting[]).map((l) => ({
              label: `${l === language ? '● ' : ''}${t(`language.${l}`)}`,
              onClick: () => setLanguage(l),
            })),
          ]}
        />
        <Menu
          label={t('menu.posts')}
          items={[
            { label: t('menu.posts.submit'), onClick: () => setDialog({ kind: 'submit', space: space?.kind !== 'group' ? space?.id : undefined, board: route[2] === 'b' ? route[3] : undefined }) },
            { label: t('menu.posts.invite'), disabled: !space, onClick: () => space && setDialog({ kind: 'invite', space }) },
          ]}
        />
        <Menu
          label={t('menu.help')}
          items={[
            { label: t('menu.help.updates'), onClick: checkForUpdates },
            { label: t('menu.help.about'), onClick: () => alert(t('about.text', { version: WEAVE_VERSION })) },
          ]}
        />
      </nav>
      <div className="toolbar">
        {/* On a phone the toolbar is a tab bar at the bottom; "mobile-only" and "not-mobile" pick its buttons. */}
        <ToolButton icon="notes" label={t('tree.places')} className="mobile-only" on={placesOpen} onClick={() => setPlacesOpen((open) => !open)} />
        <ToolButton icon="home" label={t('nav.home')} href="#/" on={route.length === 0 && !placesOpen} />
        <ToolButton icon="bookmark" label={t('nav.saved')} href="#/saved" on={route[0] === 'saved'} className="not-mobile" />
        <ToolButton icon="inbox" label={inbox ? t('nav.inbox.n', { n: inbox }) : t('nav.inbox')} href="#/inbox" on={route[0] === 'inbox' && !placesOpen} />
        <ToolButton icon="users" label={t('nav.people')} href="#/people" on={route[0] === 'people' && !placesOpen} />
        <ToolButton icon="user" label={t('nav.hub')} href="#/space" on={route[0] === 'space' && !route[1]} className="not-mobile" />
        <span className="tool-sep" />
        <ToolButton icon="pencil" label={t('tool.submit')} onClick={() => setDialog({ kind: 'submit', space: space?.kind !== 'group' ? space?.id : undefined, board: route[2] === 'b' ? route[3] : undefined })} />
        <ToolButton icon="plus" label={t('tool.new')} onClick={() => setDialog({ kind: 'new' })} className="not-mobile" />
        {space && <ToolButton icon="userPlus" label={t('space.invite')} onClick={() => setDialog({ kind: 'invite', space })} className="not-mobile" />}
        {/* A link someone sent (an invite, a contact link, a post): one place for all of them, one click away. */}
        <ToolButton icon="link" label={t('tool.link')} onClick={() => setDialog({ kind: 'link' })} className="not-mobile" />
        <div className="brand">
          <WeaveMark size={40} />
          <div>
            <b>Weave</b>
            <small>{t('brand.tagline')}</small>
          </div>
          <small className="brand-side">
            {t('brand.build')}
            <br />
            {t('brand.share')}
            <br />
            {t('brand.belong')}
          </small>
        </div>
      </div>
      <div className="panes">
        <Places spaces={spaces} chats={chats ?? []} route={route} waiting={waiting ?? []} inbox={inbox} onNew={() => setDialog({ kind: 'new' })} />
        {body}
      </div>
      <div className="status-bar">
        <p className="status-bar-field">
          <Avatar did={me.did} size={12} /> {me.name ?? t('word.you')}
        </p>
        <p className="status-bar-field">{status ? (online ? t('status.peers', { n: status.peers }) : t('status.peers.none')) : t('status.connecting')}</p>
        {status?.olderPeers ? (
          <p className="status-bar-field" title={t('status.older.title')}>
            {t('status.older', { n: status.olderPeers })}
          </p>
        ) : null}
        {status?.newerPeers ? (
          <p className="status-bar-field" title={t('status.newer.title')}>
            {t('status.newer', { n: status.newerPeers })}
          </p>
        ) : null}
        <p className="status-bar-field">
          <Icon name="lock" size={12} /> {t('status.encrypted')}
        </p>
      </div>
      {dialog?.kind === 'new' && <NewDialog onClose={close} />}
      {dialog?.kind === 'invite' && <InviteDialog space={dialog.space} onClose={close} />}
      {dialog?.kind === 'link' && <OpenLinkDialog onClose={close} />}
      {dialog?.kind === 'submit' && <SubmitDialog spaces={spaces} space={dialog.space} board={dialog.board} onClose={close} />}
      {dialog?.kind === 'notify' && <NotificationSettings onClose={close} />}
      {dialog?.kind === 'marks' && <MarksSettings onClose={close} />}
      {dialog?.kind === 'updates' && <UpdateSettings onClose={close} />}
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
      ) : state.locked ? (
        <Unlock onDone={refresh} />
      ) : !state.connected ? (
        <NotConnected home={state.home} error={state.error} onRetry={refresh} />
      ) : location.hash.startsWith('#/overlay') ? (
        <MentionsPanel />
      ) : location.hash.startsWith('#/picker') ? (
        <Picker />
      ) : (
        <>
          <Shell />
          <InviteLinkDialog />
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
createRoot(document.getElementById('root')!).render(
  <TextsProvider>
    <App />
  </TextsProvider>,
);
