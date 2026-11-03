import { useState, type FormEvent, type ReactNode } from 'react';
import type { MembershipRequestInfo, PermissionRequest, ReachInfo } from '@weave/node/client';
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
import { t, T, useTexts } from './texts.tsx';

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

/** A space's kind as a word: group, project, community, or chat for a direct one. */
const kindWord = (kind: SpaceInfo['kind']): string => t(`word.${kind === 'direct' ? 'chat' : kind}`);

// ---------------------------------------------------------------- your hub (MySpace-style, in the person's theme)

const FONTS: Array<Theme['font']> = ['sans', 'serif', 'mono', 'rounded'];
const PATTERNS: Array<Theme['pattern']> = ['none', 'weave', 'dots', 'glow'];

function ThemeEditor({ me, onClose }: { me: Profile; onClose(): void }) {
  const { t } = useTexts();
  const [theme, setTheme] = useState<Theme>(me.theme);
  const [name, setName] = useState(me.name ?? '');
  const color = (key: 'accent' | 'background' | 'surface' | 'text') => (
    <label className="color">
      <input type="color" value={theme[key]} onChange={(e) => setTheme({ ...theme, [key]: e.target.value })} /> {t(`hub.color.${key}`)}
    </label>
  );
  return (
    <Modal title={t('hub.customize.title')} onClose={onClose}>
      <p className="small">{t('hub.theme.public')}</p>
      <div className="field-row-stacked">
        <label htmlFor="me-name">{t('field.name')}</label>
        <input id="me-name" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} />
      </div>
      <fieldset>
        <legend>{t('hub.colors')}</legend>
        <div className="colors">
          {color('accent')}
          {color('background')}
          {color('surface')}
          {color('text')}
        </div>
      </fieldset>
      <div className="field-row">
        <label htmlFor="me-font">{t('hub.font')}</label>
        <select id="me-font" value={theme.font} onChange={(e) => setTheme({ ...theme, font: e.target.value as Theme['font'] })}>
          {FONTS.map((f) => (
            <option key={f} value={f}>
              {t(`hub.font.${f}`)}
            </option>
          ))}
        </select>
        <label htmlFor="me-pattern">{t('hub.wallpaper')}</label>
        <select id="me-pattern" value={theme.pattern} onChange={(e) => setTheme({ ...theme, pattern: e.target.value as Theme['pattern'] })}>
          {PATTERNS.map((p) => (
            <option key={p} value={p}>
              {t(`hub.pattern.${p}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-preview" style={themeVars(theme) as React.CSSProperties} data-pattern={theme.pattern}>
        <div className="space-box">
          <T name="hub.theirs" values={{ name: <b style={{ color: 'var(--accent)' }}>{name || t('word.you')}</b> }} />
        </div>
      </div>
      <div className="buttons">
        <button onClick={onClose}>{t('button.cancel')}</button>
        <AsyncButton
          className="default"
          onClick={async () => {
            const saved = await attempt(() => api<Profile>('setProfile', { name, theme }), t('hub.updated'));
            if (saved) {
              bump();
              onClose();
            }
          }}
        >
          {t('button.save')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

export function SpaceView({ who, meDid }: { who?: string; meDid: string }) {
  const { t } = useTexts();
  const profile = useApi(() => api<Profile>('profile', who), [who]);
  const p = profile.data;
  const posts = useApi(() => (p ? api<FeedItem[]>('feed', { author: p.did, publicOnly: true, kinds: ['weave.post'], limit: 100 }) : Promise.resolve([])), [p?.did]);
  const [editing, setEditing] = useState(false);
  const [avatar, setAvatar] = useState(false);
  const [text, setText] = useState('');
  if (!p) return <Page title={t('nav.hub.theirs')}>{null}</Page>;
  const name = p.name ?? shortDid(p.did);
  const edge = (kind: 'follow' | 'mute' | 'block', on: boolean, label: string) => (
    <AsyncButton onClick={() => attempt(() => api('setEdge', { edge: kind, who: p.did, on }).then(bump))}>{label}</AsyncButton>
  );
  return (
    <Page title={<>{p.me ? t('nav.hub') : t('hub.theirs', { name })}</>} actions={
        p.me && (
          <>
            <button onClick={() => setAvatar(true)}>{t('hub.avatar')}</button> <button onClick={() => setEditing(true)}>{t('hub.customize')}</button>
          </>
        )
      }
    >
      <div className="space" style={themeVars(p.theme) as React.CSSProperties} data-pattern={p.theme.pattern}>
        <header className="space-box space-head">
          <Avatar did={p.did} size={96} />
          <div className="space-id">
            <h1>{name}</h1>
            <button className="did" title={t('hub.copy.identity')} onClick={() => copy(p.did, t('hub.identity.copied'))}>
              {p.did}
            </button>
            <div className="badges">
              {p.following && p.followsMe && <span className="tag friend">{t('people.friend')}</span>}
              {!p.me && p.followsMe && !p.following && <span className="tag">{t('people.follows.you')}</span>}
              {p.blocked && <span className="tag rejected">{t('people.blocked')}</span>}
              {p.muted && <span className="tag">{t('people.muted')}</span>}
              <span className="small">{t('hub.public.posts', { n: p.posts })}</span>
            </div>
            <HubAccounts profile={p} />
          </div>
          {p.me && (
            <div className="space-actions">
              <a className="button-link" href="#/keys">
                <Icon name="lock" /> {t('nav.keys')}
              </a>
            </div>
          )}
          {!p.me && (
            <div className="space-actions">
              {p.following && p.followsMe && (
                <button className="default" onClick={() => startChat(p.did)}>
                  <Icon name="message" /> {t('people.message')}
                </button>
              )}
              {edge('follow', !p.following, t(p.following ? 'people.unfollow' : 'people.follow'))}
              {edge('mute', !p.muted, t(p.muted ? 'hub.unmute' : 'hub.mute'))}
              {edge('block', !p.blocked, t(p.blocked ? 'hub.unblock' : 'hub.block'))}
            </div>
          )}
        </header>
        <HubBadges did={p.did} me={p.me} name={name} />
        <SupportBox did={p.did} name={name} me={p.me} />
        {p.me && <MyProjects name={name} />}
        {!p.me && p.projects.length > 0 && (
          <section className="space-box">
            <h3>{t('hub.projects.of', { name })}</h3>
            <div className="showcase">
              {p.projects.map((project) => (
                <article className="showcase-item" key={project.id}>
                  <ProjectIcon id={project.id} icon={project.icon} size={48} />
                  <div>
                    <b>{project.name}</b> <span className={`tag status-${project.status}`}>{t(`pstatus.${project.status}`)}</span>
                    {project.description && <Markdown text={project.description} />}
                  </div>
                </article>
              ))}
            </div>
          </section>
        )}
        <section className="space-box">
          <h3>{t('hub.posts')}</h3>
          {p.me && (
            <form
              className="space-compose"
              onSubmit={async (e) => {
                e.preventDefault();
                if (text.trim() && (await attempt(() => api('publish', { kind: 'weave.post', body: { text } }), t('hub.posted')))) setText('');
              }}
            >
              <textarea rows={2} placeholder={t('hub.note.placeholder')} value={text} onChange={(e) => setText(e.target.value)} />
              <button>{t('word.post')}</button>
            </form>
          )}
          {[...(posts.data ?? [])].reverse().map((item) => (
            <div className="space-post" key={item.id}>
              <small>{ago(item.time)}</small>
              <Markdown text={textOf(item)} />
            </div>
          ))}
          {posts.data?.length === 0 && <p className="small">{p.me ? t('hub.posts.yours.here') : t('hub.posts.none', { name })}</p>}
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
  const { t } = useTexts();
  return (
    <Page title={<><Icon name="star" /> {t('nav.memberships')}</>}>
      <p className="small">{t('memberships.about')}</p>
      <div className="space app-boxes">
        <SupportBox did={meDid} name={meName ?? t('word.you.lc')} me />
        <section className="space-box">
          <h3>{t('memberships.supporting')}</h3>
          <MySupport />
        </section>
      </div>
    </Page>
  );
}

// ---------------------------------------------------------------- people and inbox

/** Close, and copy a link to paste into any messenger. */
function CopyButtons({ text, what, onClose }: { text?: string; what: string; onClose(): void }) {
  const { t } = useTexts();
  return (
    <div className="buttons">
      <button onClick={onClose}>{t('button.close')}</button>
      <button className="default" disabled={!text} onClick={() => copy(text!, t('copy.what.copied', { what }))}>
        <Icon name="copy" /> {t('button.copy')}
      </button>
    </div>
  );
}

export function ContactDialog({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  // With a front door (an always-on node), its link is the one to give: it never leads to this computer. The personal
  // one is still there, for close contacts.
  const { data: reach } = useApi(() => api<ReachInfo>('reach'), []);
  const [personal, setPersonal] = useState(false);
  const door = !!reach?.door && !personal;
  const { data: link } = useApi(() => (reach ? api<string>('contactLink', door ? { door: true } : {}) : Promise.resolve(undefined)), [!!reach, door]);
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const message = link ? t(me?.name ? 'contact.message.named' : 'contact.message', { name: me?.name, link }) : '';
  return (
    <Modal title={t('contact.title')} onClose={onClose}>
      <p className="small">{t(door ? 'contact.about.door' : 'contact.about')}</p>
      <textarea className="wide invite" readOnly rows={4} value={message || t('contact.making')} />
      {reach?.door && (
        <p className="small">
          <button type="button" className="link" onClick={() => setPersonal((p) => !p)}>
            {t(door ? 'contact.personal' : 'contact.door')}
          </button>
        </p>
      )}
      <CopyButtons text={link && message} what={t('contact.link')} onClose={onClose} />
    </Modal>
  );
}

export function AddContactDialog({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const [text, setText] = useState('');
  return (
    <Modal title={t('contact.add.title')} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          const p = await attempt(() => api<Profile>('addContact', text), t('contact.added'));
          if (p) {
            bump();
            onClose();
            navigate(`#/space/${encodeURIComponent(p.did)}`);
          }
        }}
      >
        <p className="small">{t('contact.paste')}</p>
        <textarea className="wide" required autoFocus rows={4} placeholder={t('contact.placeholder')} value={text} onChange={(e) => setText(e.target.value)} />
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default">{t('button.add')}</button>
        </div>
      </form>
    </Modal>
  );
}

export function PeopleView() {
  const { t } = useTexts();
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<'contact' | 'add'>();
  const social = useApi(() => api<Social>('social'), []);
  const everyone = useApi(() => api<Profile[]>('directory', query || undefined), [query]);
  const s = social.data;
  return (
    <Page
      title={<><Icon name="users" /> {t('nav.people')}</>}
      actions={
        <>
          <button onClick={() => setDialog('add')}>
            <Icon name="userPlus" /> {t('people.add.by.link')}
          </button>
          <button onClick={() => setDialog('contact')}>
            <Icon name="share" /> {t('contact.title')}
          </button>
        </>
      }
    >
      <div className="field-row search-row">
        <Icon name="search" />
        <input type="search" autoFocus placeholder={t('people.search.placeholder')} value={query} onChange={(e) => setQuery(e.target.value)} aria-label={t('people.search')} />
      </div>
      {s && (
        <div className="stats">
          {(
            [
              [s.friends.length, 'friends'],
              [s.following.length, 'following'],
              [s.followers.length, 'followers'],
              [s.blocked.length + s.muted.length, 'blocked'],
            ] as Array<[number, string]>
          ).map(([n, key]) => (
            <div className="stat sunken" key={key}>
              <b>{n}</b>
              <span>{t(`people.stat.${key}`)}</span>
            </div>
          ))}
        </div>
      )}
      <p className="small">{t('people.about')}</p>
      <div className="people">
        {(everyone.data ?? []).map((p) => (
          <div className="person" key={p.did}>
            <Avatar did={p.did} size={40} />
            <div className="grow">
              <a href={`#/space/${encodeURIComponent(p.did)}`}>
                <b>{p.name ?? shortDid(p.did)}</b>
              </a>
              <div>
                {p.following && p.followsMe ? <span className="tag friend">{t('people.friend')}</span> : p.followsMe ? <span className="tag">{t('people.follows.you')}</span> : p.following ? <span className="tag">{t('people.following')}</span> : null}
                {p.blocked && <span className="tag rejected">{t('people.blocked')}</span>}
                {p.muted && <span className="tag">{t('people.muted')}</span>}
                {p.contact && <span className="tag">{t('people.in.contacts')}</span>}
              </div>
            </div>
            {p.following && p.followsMe && (
              <button onClick={() => startChat(p.did)}>
                <Icon name="message" /> {t('people.message')}
              </button>
            )}
            <AsyncButton onClick={() => attempt(() => api('setEdge', { edge: 'follow', who: p.did, on: !p.following }).then(bump))}>{t(p.following ? 'people.unfollow' : 'people.follow')}</AsyncButton>
          </div>
        ))}
        {everyone.data?.length === 0 &&
          (query ? (
            <p className="empty">
              <T
                name="people.nobody.called"
                values={{
                  query,
                  add: (
                    <button className="link" onClick={() => setDialog('add')}>
                      {t('people.add.it')}
                    </button>
                  ),
                }}
              />
            </p>
          ) : (
            <p className="empty">{t('people.nobody.yet')}</p>
          ))}
      </div>
      {dialog === 'contact' && <ContactDialog onClose={() => setDialog(undefined)} />}
      {dialog === 'add' && <AddContactDialog onClose={() => setDialog(undefined)} />}
    </Page>
  );
}

export function InboxView({ admissions, knocks }: { admissions: Admission[]; knocks: KnockInfo[] }) {
  const { t } = useTexts();
  const { data: requests } = useApi(() => api<MembershipRequestInfo[]>('membershipRequests'), []);
  const { data: coauthors } = useApi(() => api<CoauthorRequest[]>('coauthorRequests'), []);
  const { data: asks } = useApi(() => api<PermissionRequest[]>('permissionRequests').catch(() => []), []);
  const { data: fading } = useApi(() => api<PostInfo[]>('fading').catch(() => []), []);
  return (
    <Page title={<><Icon name="inbox" /> {t('nav.inbox')}</>}>
      {admissions.length === 0 && knocks.length === 0 && requests?.length === 0 && coauthors?.length === 0 && asks?.length === 0 && fading?.length === 0 && <p className="empty">{t('inbox.empty')}</p>}
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
  const { t } = useTexts();
  return (
    <div className="admission window">
      <div className="window-body">
        <Icon name="clock" />
        <div className="grow">
          <a href={`#/post/${post.id}`}>“{post.title}”</a>
          {post.space && <span className="small muted"> {t('inbox.in', { space: post.space.name })}</span>}
          <div className="small muted">{post.lifetime ? lifetimeText(post.lifetime) : ''} {t('fading.keep.note')}</div>
        </div>
        <a className="button" href={`#/post/${post.id}`}>
          {t('fading.open')}
        </a>
        <AsyncButton className="default" onClick={() => attempt(() => api('keepPost', post.id).then(bump), t('fading.kept', { title: post.title }))}>
          {t('fading.keep')}
        </AsyncButton>
      </div>
    </div>
  );
}

/** A post that names you (or your agent) as co-author. */
export function CoauthorCard({ request: r }: { request: CoauthorRequest }) {
  const { t } = useTexts();
  const who = r.agent ? t('cocard.your.agent', { agent: r.agent }) : t('word.you.lc');
  const answer = (on: boolean) => attempt(() => api('confirmCoauthor', { post: r.post.id, on, as: r.agent }).then(bump), t(on ? 'cocard.confirmed' : 'cocard.declined'));
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={r.by.did} size={32} />
        <div className="grow">
          <T
            name="cocard.names"
            values={{
              by: (
                <>
                  <b>{r.by.name ?? shortDid(r.by.did)}</b>
                  {r.by.agent && <span className="agent-tag">{t('cocard.agent.tag', { agent: r.by.agent })}</span>}
                </>
              ),
              who,
              post: <a href={`#/post/${r.post.id}`}>“{r.post.title}”</a>,
            }}
          />
          {r.post.space && <span className="small muted"> {t('inbox.in', { space: r.post.space.name })}</span>}.
          <div className="small muted">{t('cocard.confirming', { key: r.agent ? t('cocard.agents.key', { agent: r.agent }) : t('cocard.your.key'), who })}</div>
        </div>
        <AsyncButton onClick={() => answer(false)}>{t('cocard.decline')}</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          {t('cocard.confirm')}
        </AsyncButton>
      </div>
    </div>
  );
}

/** Someone asking to join with a link that needs your OK. */
export function KnockCard({ knock: k }: { knock: KnockInfo }) {
  const { t } = useTexts();
  const name = k.name ?? shortDid(k.did);
  const answer = (accept: boolean) => attempt(() => api('answerKnock', { knock: k.id, accept }).then(bump), t(accept ? 'knock.is.in' : 'knock.turned.away', { name }));
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={k.did} size={32} />
        <div className="grow">
          <T name="knock.asks" values={{ name: <b>{name}</b>, space: <b>{spaceLabel(k.space)}</b> }} />
          {k.note && <blockquote className="knock-note">{k.note}</blockquote>}
          {k.access.length > 0 && <div className="small">{t('knock.gives', { access: k.access.map((r) => t(r.write ? 'knock.write' : 'knock.read', { board: r.board })) })}</div>}
          <div className="small muted">{ago(k.time)}</div>
        </div>
        <AsyncButton onClick={() => answer(false)}>{t('knock.turn.away')}</AsyncButton>
        <AsyncButton className="default" onClick={() => answer(true)}>
          {t('knock.let.in')}
        </AsyncButton>
      </div>
    </div>
  );
}

/** Asking a project's maintainers about group newcomers (and those who left). */
export function AdmissionCard({ admission }: { admission: Admission }) {
  const { t } = useTexts();
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
            <T name="admission.left" values={{ name: <b>{name}</b>, group: <b>{a.group.name}</b>, project: <b>{a.project.name}</b> }} />
          </div>
          <AsyncButton onClick={() => attempt(() => api('removeMember', a.project.id, a.did).then(bump), t('admission.removed', { name }))}>{t('button.remove')}</AsyncButton>
        </div>
      </div>
    );
  }
  return (
    <div className="admission window">
      <div className="window-body">
        <Avatar did={a.did} size={32} />
        <div className="grow">
          <T name="admission.allow.ask" values={{ name: <b>{name}</b>, group: <b>{a.group.name}</b>, project: <b>{a.project.name}</b> }} />
          <div>
            <input id={id} type="checkbox" checked={always} onChange={(e) => setAlways(e.target.checked)} />
            <label htmlFor={id}>{t('admission.always', { group: a.group.name })}</label>
          </div>
        </div>
        <AsyncButton onClick={() => attempt(() => api('decline', { project: a.project.id, who: a.did, group: a.group.id }).then(bump))}>{t('cocard.decline')}</AsyncButton>
        <AsyncButton className="default" onClick={() => attempt(() => api('admit', { project: a.project.id, who: a.did, group: a.group.id, always }).then(bump), t('knock.is.in', { name }))}>
          {t('admission.allow')}
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
  const { t } = useTexts();
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
            <Icon name="pencil" /> {t('word.post')}
          </button>
          <button onClick={onInvite}>
            <Icon name="userPlus" /> {t('space.invite')}
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
              {page && <span className={`tag status-${page.status}`}>{t(`pstatus.${page.status}`)}</span>} <span className="small">{t('phome.participants.by', { n: members.length, by: info?.founderName ?? '…' })}</span>
            </div>
            {page?.subtitle ? <p className="hero-subtitle">{page.subtitle}</p> : !page?.body && info && <p className="hero-subtitle muted">{t(info.maintainer ? 'phome.no.page.write' : 'phome.no.page')}</p>}
            {(page?.body || info?.maintainer) && (
              <button className="hero-toggle" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
                {t(expanded ? 'phome.back.to.chat' : 'phome.project.page')}
              </button>
            )}
          </div>
          {/* Its members on the banner, standing together, if those who run it want them there. */}
          {project.membersOnBanner && members.length > 0 && <GroupPhoto className="hero-group" dids={inPhotoOrder(project, members.map((m) => m.did))} poses={project.photoPoses} peek />}
          {info?.post && (
            <div className="banner-side">
              <VoteBox post={info.post} />
              <button onClick={() => setSharing(true)}>
                <Icon name="share" /> {t('button.share')}
              </button>
              <button onClick={() => attempt(() => api('save', { target: info.post!.id, mode: info.post!.saved === 'pinned' ? null : 'pinned' }).then(bump), t(info.post!.saved === 'pinned' ? 'phome.unpinned' : 'phome.pinned'))}>
                <Icon name="mapPin" /> {t(info.post.saved === 'pinned' ? 'phome.unpin' : 'phome.pin')}
              </button>
              <FollowSpace space={project} />
            </div>
          )}
        </div>
        {expanded ? (
          <div className="project-page pane-scroll sunken page">
            {page?.body ? <Markdown text={page.body} rich /> : <p className="small">{t('phome.nothing.on.page')}</p>}
            {info?.maintainer && (
              <p className="small">
                <a href={`#/p/${project.id}/settings`}>{t('phome.edit.in.settings')}</a>
              </p>
            )}
          </div>
        ) : (
          <>
            {boards && (
              <nav className="board-strip">
                {boards.map((b) => (
                  <a key={b.name} className="board-chip" href={`#/p/${project.id}/b/${b.name}`} title={b.access?.read || b.access?.write ? t('phome.limited', { who: accessSummary(b) }) : undefined}>
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
  const { t } = useTexts();
  const saved: PageDraft = { title: info.page.title, subtitle: info.page.subtitle, body: info.page.body, icon: info.page.icon ?? '', banner: info.page.banner ?? '' };
  const [draft, setDraft] = useState<PageDraft>(saved);
  const set = (patch: Partial<PageDraft>) => setDraft((d) => ({ ...d, ...patch }));
  const changed = (Object.keys(saved) as Array<keyof PageDraft>).some((k) => draft[k] !== saved[k]);
  const save = (patch: Partial<ProjectInfo['page']>) => attempt(() => api('setProjectPage', { project: info.id, ...patch }).then(bump), t('pageed.updated'));
  return (
    <>
      <div className="page-fields">
        <ImagePicker label={t('pageed.icon')} value={draft.icon} onChange={(icon) => set({ icon })} />
        <div className="grow">
          <label htmlFor="page-title">{t('field.title')}</label>
          <input id="page-title" className="wide" maxLength={100} placeholder={info.name} value={draft.title} onChange={(e) => set({ title: e.target.value })} />
          <label htmlFor="page-subtitle">{t('pageed.subtitle')}</label>
          <input id="page-subtitle" className="wide" maxLength={300} placeholder={t('pageed.subtitle.placeholder')} value={draft.subtitle} onChange={(e) => set({ subtitle: e.target.value })} />
        </div>
      </div>
      <label>{t('pageed.banner')}</label>
      <ImagePicker label={t('pageed.banner')} wide value={draft.banner} onChange={(banner) => set({ banner })} />
      <label>{t('pageed.page')}</label>
      <RichEditor value={draft.body} onChange={(body) => set({ body })} placeholder={t('pageed.page.placeholder')} minHeight={220} max={TEXT_LIMITS.page} />
      <div className="field-row">
        <label htmlFor="status">{t('pageed.status')}</label>
        <select id="status" value={info.page.status} onChange={(e) => save({ status: e.target.value as ProjectStatus })}>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {t(`pstatus.${s}`)}
            </option>
          ))}
        </select>
        <input id="public" type="checkbox" checked={info.page.public} onChange={(e) => save({ public: e.target.checked })} />
        <label htmlFor="public">{t('pageed.public')}</label>
        <span className="grow" />
        <button disabled={!changed} onClick={() => setDraft(saved)}>
          {t('pageed.discard')}
        </button>
        <button className="default" disabled={!changed} onClick={() => save(draft)}>
          {t('pageed.save')}
        </button>
      </div>
    </>
  );
}

/** Above the proposals board: whose vote counts for yours when you don't vote. */
export function DelegationBar({ project, members, meDid }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { t } = useTexts();
  const { data: delegate } = useApi(() => api<Actor | null>('votingDelegate', project.id), [project.id]);
  return (
    <div className="board-intro">
      <Icon name="flag" /> {t('delegate.intro')}{' '}
      <select
        value={delegate?.did ?? ''}
        onChange={(e) => attempt(() => api('delegateVote', { project: project.id, who: e.target.value || undefined }).then(bump), t(e.target.value ? 'delegate.saved' : 'delegate.only.me'))}
      >
        <option value="">{t('delegate.nobody')}</option>
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
  const names = (list?: GranteeInfo[]) => (list?.length ? list.map((g) => g.name ?? t('word.someone.lc')).join(', ') : t('access.maintainers'));
  if (!b.access?.read && !b.access?.write) return t('access.everyone');
  if (!b.access?.read) return t('access.write', { names: names(b.access?.write) });
  return b.access?.write ? t('access.read.write', { readers: names(b.access.read), writers: names(b.access.write) }) : t('access.read', { names: names(b.access.read) });
}

const granteeKey = (g: GranteeInfo) => (g.group ? `group:${g.group}` : g.person!);

/** One side (read or write) of a board's access: everyone, or a chosen list. */
function GranteePicker({ side, value, onChange, members, groups }: { side: 'read' | 'write'; value: GranteeInfo[] | null; onChange(v: GranteeInfo[] | null): void; members: MemberInfo[]; groups: ProjectInfo['groups'] }) {
  const { t } = useTexts();
  const [adding, setAdding] = useState('');
  const label = t(`access.side.${side}`);
  const options = [
    ...groups.map((g) => ({ key: `group:${g.id}`, info: { group: g.id, name: g.name }, label: t('access.group', { name: g.name }) })),
    ...members.filter((m) => !m.maintainer).map((m) => ({ key: m.did, info: { person: m.did, name: m.name }, label: m.name ?? shortDid(m.did) })),
  ].filter((o) => !value?.some((g) => granteeKey(g) === o.key));
  return (
    <fieldset>
      <legend>{label}</legend>
      <div className="field-row">
        <input type="radio" id={`${side}-all`} checked={value === null} onChange={() => onChange(null)} />
        <label htmlFor={`${side}-all`}>{t('access.everyone.in.project')}</label>
      </div>
      <div className="field-row">
        <input type="radio" id={`${side}-some`} checked={value !== null} onChange={() => onChange(value ?? [])} />
        <label htmlFor={`${side}-some`}>{t('access.only.maintainers.and')}</label>
      </div>
      {value !== null && (
        <div className="grantees">
          {value.map((g) => (
            <span key={granteeKey(g)} className="chip">
              {g.group ? <Icon name="users" /> : <Avatar did={g.person!} size={14} />} {g.name ?? t('word.someone.lc')}
              <button className="small-btn" title={t('button.remove')} onClick={() => onChange(value.filter((x) => granteeKey(x) !== granteeKey(g)))}>
                ✕
              </button>
            </span>
          ))}
          {options.length > 0 && (
            <select
              value={adding}
              aria-label={t('access.add.to', { side: label })}
              onChange={(e) => {
                const option = options.find((o) => o.key === e.target.value);
                if (option) onChange([...value, option.info]);
                setAdding('');
              }}
            >
              <option value="">{t('access.add.person.or.group')}</option>
              {options.map((o) => (
                <option key={o.key} value={o.key}>
                  {o.label}
                </option>
              ))}
            </select>
          )}
          {value.length === 0 && <span className="small muted">{t('access.nobody.else')}</span>}
        </div>
      )}
    </fieldset>
  );
}

function BoardAccessDialog({ project, board, onClose }: { project: SpaceInfo; board: BoardInfo; onClose(): void }) {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: members } = useApi(() => api<MemberInfo[]>('members', project.id), [project.id]);
  const [read, setRead] = useState<GranteeInfo[] | null>(board.access?.read ?? null);
  const [write, setWrite] = useState<GranteeInfo[] | null>(board.access?.write ?? null);
  const save = async () => {
    const list = (v: GranteeInfo[] | null) => (v === null ? null : v.map(granteeKey));
    if (await attempt(() => api('setBoardAccess', { project: project.id, board: board.name, read: list(read), write: list(write) }).then(bump), t('access.saved'))) onClose();
  };
  return (
    <Modal title={t('access.title', { board: board.title })} onClose={onClose} wide>
      <p className="small">{t('access.about')}</p>
      {info && members && (
        <div className="access-sides">
          <GranteePicker side="read" value={read} onChange={setRead} members={members} groups={info.groups} />
          <GranteePicker side="write" value={write} onChange={setWrite} members={members} groups={info.groups} />
        </div>
      )}
      <p className="small">{t(board.type === 'proposals' ? 'access.write.means.proposals' : 'access.write.means')}</p>
      <div className="buttons">
        <button onClick={onClose}>{t('button.cancel')}</button>
        <AsyncButton className="default" onClick={save}>
          {t('button.save')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** How long a board's posts stay: days after their last activity, and a size limit; empty for no limit. */
export function BoardRuleDialog({ space, board, onClose }: { space: SpaceInfo; board: BoardInfo; onClose(): void }) {
  const { t } = useTexts();
  const [days, setDays] = useState(board.rule?.keepDays ? String(board.rule.keepDays) : '');
  const [mb, setMb] = useState(board.rule?.maxMB ? String(board.rule.maxMB) : '');
  const save = async () => {
    const value = (v: string) => (v.trim() ? Number(v) : null);
    if (await attempt(() => api('setBoardRule', { space: space.id, board: board.name, keepDays: value(days), maxMB: value(mb) }).then(bump), t('boardrule.saved'))) onClose();
  };
  return (
    <Modal title={t('boardrule.title', { board: board.title })} onClose={onClose}>
      <div className="field-row">
        <label>
          {t('boardrule.days')} <input type="number" min={1} value={days} placeholder={t('boardrule.for.good')} onChange={(e) => setDays(e.target.value)} />
        </label>
      </div>
      <div className="field-row">
        <label>
          {t('boardrule.at.most')} <input type="number" min={1} value={mb} placeholder={t('boardrule.no.limit')} onChange={(e) => setMb(e.target.value)} />
        </label>
      </div>
      <p className="small">{t('boardrule.about')}</p>
      <div className="buttons">
        <button onClick={onClose}>{t('button.cancel')}</button>
        <AsyncButton className="default" onClick={save}>
          {t('button.save')}
        </AsyncButton>
      </div>
    </Modal>
  );
}

/** A community's one board: how long its posts stay. */
function CommunityRule({ community, canSet }: { community: SpaceInfo; canSet: boolean }) {
  const { t } = useTexts();
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', community.id), [community.id]);
  const [open, setOpen] = useState(false);
  const board = boards?.[0];
  if (!board) return null;
  return (
    <fieldset>
      <legend>{t('boardrule.legend')}</legend>
      <p className="small">{board.rule ? ruleText(board.rule) : t('boardrule.none')}</p>
      {canSet && (
        <div className="buttons">
          <button onClick={() => setOpen(true)}>{t('boardrule.change')}</button>
        </div>
      )}
      {open && <BoardRuleDialog space={community} board={board} onClose={() => setOpen(false)} />}
    </fieldset>
  );
}

const BOARD_TYPES = ['posts', 'issues', 'proposals'] as const;

function BoardSettings({ project, boards }: { project: SpaceInfo; boards: BoardInfo[] }) {
  const { t } = useTexts();
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
      <legend>{t('boards.legend')}</legend>
      <table className="boards-table">
        <thead>
          <tr className="small muted">
            <th />
            <th>{t('field.name')}</th>
            <th>{t('boards.who')}</th>
            <th>{t('boards.posts.stay')}</th>
            <th>{t('boards.sort')}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {boards.map((b, i) => (
            <tr key={b.name}>
              <td title={t(`boards.type.${b.type}`)}>
                <Icon name={boardIcon(b)} />
              </td>
              <td>
                <input defaultValue={b.title} aria-label={t('boards.title.of', { board: b.name })} onBlur={(e) => e.target.value !== b.title && set(b.name, { title: e.target.value })} />
              </td>
              <td>
                <button className="small-btn access-btn" title={t('boards.who.may')} onClick={() => setEditing(b)}>
                  {b.access?.read || b.access?.write ? <Icon name="lock" /> : null} {accessSummary(b)}
                </button>
              </td>
              <td>
                <button className="small-btn" title={b.rule ? ruleText(b.rule) : t('boardrule.none.short')} onClick={() => setRuling(b)} disabled={b.type !== 'posts' || b.name === 'releases'}>
                  <Icon name="clock" /> {b.type !== 'posts' || b.name === 'releases' ? t('boardrule.for.good') : b.rule?.keepDays ? t('boards.days', { n: b.rule.keepDays }) : b.rule?.maxMB ? t('boards.mb', { n: b.rule.maxMB }) : t('boardrule.for.good')}
                </button>
              </td>
              <td>
                <select value={b.sort} aria-label={t('boards.default.sort')} onChange={(e) => set(b.name, { sort: e.target.value })}>
                  {(['hot', 'new', 'top'] as const).map((s) => (
                    <option key={s} value={s}>
                      {t(`sort.${s}`)}
                    </option>
                  ))}
                </select>
              </td>
              <td className="board-actions">
                <button className="small-btn" disabled={i === 0} onClick={() => move(i, -1)} title={t('post.move.up')}>
                  ▲
                </button>
                <button className="small-btn" disabled={i === boards.length - 1} onClick={() => move(i, 1)} title={t('post.move.down')}>
                  ▼
                </button>
                <button className="small-btn" title={t('boards.remove.title')} onClick={async () => (await ask(t('boards.remove.ask', { board: b.title }), t('button.remove'))) && set(b.name, { on: false })}>
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
        <input placeholder={t('boards.new.placeholder')} required maxLength={32} {...add.field('name')} />
        <select {...add.field('type')} aria-label={t('boards.type')}>
          {BOARD_TYPES.map((type) => (
            <option key={type} value={type}>
              {t(`boards.type.${type}`)}
            </option>
          ))}
        </select>
        <button>{t('boards.add')}</button>
      </form>
      {editing && <BoardAccessDialog project={project} board={editing} onClose={() => setEditing(undefined)} />}
      {ruling && <BoardRuleDialog space={project} board={ruling} onClose={() => setRuling(undefined)} />}
    </fieldset>
  );
}

const SETTINGS_TABS = ['page', 'boards', 'people', 'payments', 'ownership'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

/** A project's settings, one tab at a time (#/p/<id>/settings/<tab>): its page, boards, people (and what newcomers read), payments, ownership. */
export function ProjectSettings({ project, spaces, members, meDid, tab: asked }: { project: SpaceInfo; spaces: SpaceInfo[]; members: MemberInfo[]; meDid: string; tab?: string }) {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: admissions } = useApi(() => api<Admission[]>('admissions', project.id), [project.id]);
  const { data: boards } = useApi(() => api<BoardInfo[]>('boards', project.id), [project.id]);
  if (!info) return <Page title={t('nav.settings')}>{null}</Page>;
  const waiting = info.maintainer ? (admissions?.length ?? 0) : 0;
  const tabs = SETTINGS_TABS.filter((key) => key !== 'boards' || info.maintainer);
  const tab: SettingsTab = tabs.find((key) => key === asked) ?? (waiting ? 'people' : 'page');
  return (
    <Page title={<><Icon name="gear" /> {t('nav.settings')} · p/{info.name}</>}>
      <menu role="tablist">
        {tabs.map((key) => (
          <li key={key} role="tab" aria-selected={tab === key}>
            <a href={`#/p/${project.id}/settings/${key}`}>
              {t(`psettings.tab.${key}`)}
              {key === 'people' && waiting > 0 && <span className="count"> {waiting}</span>}
            </a>
          </li>
        ))}
      </menu>
      {tab === 'page' && (
        <fieldset>
          <legend>{t('psettings.tab.page')}</legend>
          {info.maintainer ? (
            <PageEditor key={JSON.stringify(info.page)} info={info} />
          ) : info.page.body ? (
            <Markdown text={info.page.body} rich />
          ) : (
            <p className="small">{t('phome.no.page')}</p>
          )}
          <p className="small muted">{t(info.page.public ? 'psettings.private.public.head' : 'psettings.private')}</p>
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
  const { t } = useTexts();
  const [inviting, setInviting] = useState('');
  const myGroups = spaces.filter((s) => s.kind === 'group' && !info.groups.some((g) => g.id === s.id));
  return (
    <>
      {admissions.length > 0 && (
        <fieldset>
          <legend>{t('ppeople.waiting')}</legend>
          {admissions.map((a) => (
            <AdmissionCard key={`${a.did}-${a.group.id}-${a.change}`} admission={a} />
          ))}
        </fieldset>
      )}
      <fieldset>
        <legend>{t('ppeople.participants')}</legend>
        <table className="people-table">
          <tbody>
            {members.map((m) => (
              <tr key={m.did}>
                <td>
                  <Avatar did={m.did} size={16} />
                </td>
                <td className="grow">
                  {m.name ?? shortDid(m.did)}
                  {m.did === meDid && <span className="muted"> {t('ppeople.you')}</span>}
                  {m.via && <span className="small muted"> · {t('ppeople.via', { group: m.via.name })}</span>}
                </td>
                <td>{m.did === info.founder ? <span className="tag">{t('ppeople.owner')}</span> : m.maintainer && <span className="tag">{t('role.maintainer')}</span>}</td>
                <td>
                  {info.maintainer && m.did !== info.founder && (
                    <AsyncButton className="icon-button people-tool" title={t(m.maintainer ? 'ppeople.drop.maintainer' : 'ppeople.make.maintainer')} onClick={() => attempt(() => api('setMaintainer', { project: project.id, who: m.did, on: !m.maintainer }).then(bump), t(m.maintainer ? 'ppeople.dropped.maintainer' : 'ppeople.made.maintainer', { name: m.name ?? shortDid(m.did) }))}>
                      <Icon name={m.maintainer ? 'star' : 'users'} />
                    </AsyncButton>
                  )}{' '}
                  {info.maintainer && m.did !== info.founder && m.did !== meDid && (
                    <AsyncButton className="icon-button people-tool" title={t('button.remove')} onClick={async () => (await ask(t('ppeople.remove.ask', { name: m.name ?? shortDid(m.did), project: project.name }), t('button.remove'))) && attempt(() => api('removeMember', project.id, m.did).then(bump), t('ppeople.removed', { name: m.name ?? shortDid(m.did) }))}>
                      <Icon name="trash" />
                    </AsyncButton>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="small muted">{t('ppeople.maintainers.do')} {info.maintainer ? t('ppeople.remove.note') : ''}</p>
      </fieldset>
      <fieldset>
        <legend>{t('tree.groups')}</legend>
        {info.groups.map((g) => {
          const id = `auto-${g.id}`;
          return (
            <div className="field-row" key={g.id}>
              <Icon name="users" /> <b className="grow">{g.name}</b>
              {info.maintainer ? (
                <>
                  <input id={id} type="checkbox" checked={g.auto} onChange={(e) => attempt(() => api('setRule', { project: project.id, group: g.id, auto: e.target.checked }).then(bump))} />
                  <label htmlFor={id}>{t('ppeople.admit.auto')}</label>
                  <AsyncButton className="small-btn" onClick={async () => (await ask(t('ppeople.uninvite.ask', { group: g.name, project: project.name }), t('ppeople.uninvite'))) && attempt(() => api('uninviteGroup', { project: project.id, group: g.id }).then(bump), t('ppeople.uninvited', { group: g.name }))}>
                    {t('ppeople.uninvite')}
                  </AsyncButton>
                  {members.some((m) => m.via?.id === g.id && m.did !== info.founder && m.did !== meDid) && (
                    <AsyncButton
                      className="small-btn"
                      onClick={async () => {
                        const came = members.filter((m) => m.via?.id === g.id && m.did !== info.founder && m.did !== meDid);
                        if (!(await ask(t('ppeople.uninvite.remove.ask', { group: g.name, project: project.name, n: came.length }), t('ppeople.uninvite.remove')))) return;
                        await attempt(async () => {
                          await api('uninviteGroup', { project: project.id, group: g.id });
                          for (const m of came) await api('removeMember', project.id, m.did);
                          bump();
                        }, t('ppeople.uninvited.removed', { group: g.name, n: came.length }));
                      }}
                    >
                      {t('ppeople.uninvite.remove')}
                    </AsyncButton>
                  )}
                </>
              ) : (
                <span className="small">{t(g.auto ? 'ppeople.admitted.auto' : 'ppeople.asked.about')}</span>
              )}
            </div>
          );
        })}
        {info.groups.length === 0 && <p className="small muted">{t('ppeople.no.groups')}</p>}
        {info.maintainer && myGroups.length > 0 && (
          <div className="field-row">
            <select value={inviting} onChange={(e) => setInviting(e.target.value)} aria-label={t('ppeople.group.to.invite')}>
              <option value="">{t('ppeople.invite.group')}</option>
              {myGroups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
            <AsyncButton
              onClick={async () => {
                if (!inviting) return;
                await attempt(() => api('inviteGroup', { project: project.id, group: inviting }).then(bump), t('ppeople.group.invited'));
                setInviting('');
              }}
            >
              {t('space.invite')}
            </AsyncButton>
          </div>
        )}
      </fieldset>
    </>
  );
}

// ---------------------------------------------------------------- what newcomers read

const HISTORY_CHOICES: Array<NonNullable<SpaceInfo['history']>> = ['all', '30d', 'joining'];

/** What newcomers get to read; whoever manages the space decides, everyone sees it. */
export function NewcomerHistory({ space, canSet }: { space: SpaceInfo; canSet: boolean }) {
  const { t } = useTexts();
  const set = (history: SpaceInfo['history']) => attempt(() => api('setHistory', { space: space.id, history }).then(bump), t(`history.set.${history}`, { space: space.name }));
  return (
    <fieldset>
      <legend>{t('history.legend')}</legend>
      {HISTORY_CHOICES.map((value) => (
        <div key={value} className="field-row">
          <input id={`history-${space.id}-${value}`} type="radio" name={`history-${space.id}`} checked={space.history === value} disabled={!canSet} onChange={() => void set(value)} />
          <label htmlFor={`history-${space.id}-${value}`}>
            <span>
              <b>{t(`history.${value}`)}</b>
              <span className="small"> · {t(`history.${value}.detail`)}</span>
            </span>
          </label>
        </div>
      ))}
      <p className="small">
        {canSet
          ? t(space.kind === 'project' ? 'history.either.way.project' : 'history.either.way', { kind: kindWord(space.kind) })
          : t(space.kind === 'project' ? 'history.set.by.maintainers' : space.kind === 'community' ? 'history.set.by.moderators' : 'history.set.by.owner')}
      </p>
    </fieldset>
  );
}

// ---------------------------------------------------------------- leaving, handing over, closing

/** Leave a space, hand it over (owner), or close and reopen it (owner, maintainers). */
export function SpaceOwnership({ space, members, meDid, canClose }: { space: SpaceInfo; members: MemberInfo[]; meDid: string; canClose: boolean }) {
  const { t } = useTexts();
  const [to, setTo] = useState('');
  const owner = space.founder === meDid;
  const others = members.filter((m) => m.did !== meDid);
  const word = kindWord(space.kind);
  const leave = async () => {
    if (!(await ask(t('own.leave.ask', { space: space.name }), t('own.leave')))) return;
    if (await attempt(() => api('leave', space.id), t('own.left', { space: space.name }))) {
      bump();
      navigate('#/');
    }
  };
  const handOver = async () => {
    const person = others.find((m) => m.did === to);
    if (!person) return;
    const name = person.name ?? shortDid(person.did);
    if (await ask(t(space.kind === 'group' ? 'own.hand.over.ask' : 'own.hand.over.ask.stay', { name, space: space.name, role: t(space.kind === 'community' ? 'role.moderator' : 'role.maintainer') }), t('own.hand.over'))) {
      await attempt(() => api('handOver', { space: space.id, to: person.did }).then(bump), t('own.owns.now', { name, space: space.name }));
      setTo('');
    }
  };
  const close = async (closed: boolean) => {
    if (closed && !(await ask(t('own.close.ask', { space: space.name }), t('own.close')))) return;
    await attempt(() => api('closeSpace', { space: space.id, closed }).then(bump), t(closed ? 'own.is.closed' : 'own.is.open', { space: space.name }));
  };
  return (
    <fieldset>
      <legend>{t('own.legend')}</legend>
      {space.closed && (
        <p className="notice">
          <Icon name="lock" /> {t('own.closed.notice', { kind: word })}
        </p>
      )}
      <p className="small">
        <T name="own.owner" values={{ name: <b>{owner ? t('word.you.lc') : (members.find((m) => m.did === space.founder)?.name ?? shortDid(space.founder))}</b> }} />
      </p>
      {owner ? (
        <>
          <div className="field-row">
            <select value={to} onChange={(e) => setTo(e.target.value)} aria-label={t('own.new.owner')} disabled={!others.length}>
              <option value="">{others.length ? t('own.hand.over.to') : t('own.nobody.else', { kind: word })}</option>
              {others.map((m) => (
                <option key={m.did} value={m.did}>
                  {m.name ?? shortDid(m.did)}
                </option>
              ))}
            </select>
            <button onClick={() => void handOver()} disabled={!to}>
              {t('own.hand.over')}
            </button>
          </div>
          <p className="small">{t(others.length ? 'own.to.leave' : 'own.to.leave.or.close')}</p>
        </>
      ) : (
        <div className="field-row">
          <AsyncButton onClick={leave}>{t('own.leave.space', { space: space.name })}</AsyncButton>
        </div>
      )}
      {canClose && (
        <div className="field-row">
          {space.closed ? <AsyncButton onClick={() => close(false)}>{t('own.open.again')}</AsyncButton> : <AsyncButton onClick={() => close(true)}>{t('own.close.space', { space: space.name })}</AsyncButton>}
          <span className="small">{t('own.closing.keeps')}</span>
        </div>
      )}
    </fieldset>
  );
}

/** A group's settings: who owns it, leaving and closing. */
export function GroupSettings({ group, members, meDid }: { group: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { t } = useTexts();
  return (
    <Page title={<><Icon name="gear" /> {t('nav.settings')} · g/{group.name}</>}>
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
  const { t } = useTexts();
  const on = !space.hiddenFromHome;
  const what = t(space.kind === 'project' ? 'follow.what.boards' : 'follow.what.posts');
  return (
    <button
      className={on ? 'chosen' : ''}
      title={t(on ? 'follow.on.title' : 'follow.off.title', { what })}
      onClick={() => attempt(() => api('setHomeVisibility', { space: space.id, visible: !on }).then(bump), t(on ? 'follow.unfollowed' : 'follow.following.now', { space: space.name }))}
    >
      {t(on ? 'board.following' : 'board.follow')}
    </button>
  );
}

export function CommunityBanner({ community, onInvite, onSubmit }: { community: SpaceInfo; onInvite(): void; onSubmit(): void }) {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<CommunityInfo>('community', community.id), [community.id]);
  return (
    <div className="banner community">
      <Sprite seed={community.id} size={64} className="banner-art" />
      <div className="banner-text">
        <h1>r/{community.name}</h1>
        <span className="small">{t('community.members.moderated', { n: community.members, by: info?.moderators.map((m) => m.name ?? shortDid(m.did)).join(', ') ?? '…' })}</span>
        {info?.description && <Markdown text={info.description} />}
      </div>
      <div className="banner-side">
        <button className="default" onClick={onSubmit}>
          <Icon name="pencil" /> {t('community.submit.post')}
        </button>
        <button onClick={onInvite}>
          <Icon name="userPlus" /> {t('space.invite')}
        </button>
        <FollowSpace space={community} />
      </div>
    </div>
  );
}

export function CommunityAbout({ community, members, meDid }: { community: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<CommunityInfo>('community', community.id), [community.id]);
  const [description, setDescription] = useState<string>();
  if (!info) return <Page title={t('nav.about')}>{null}</Page>;
  return (
    <Page title={<><Icon name="gear" /> {t('community.about.title', { community: info.name })}</>}>
      <fieldset>
        <legend>{t('community.description')}</legend>
        {info.moderator ? (
          <>
            <textarea className="wide" rows={4} value={description ?? info.description} onChange={(e) => setDescription(e.target.value)} placeholder={t('community.description.placeholder')} />
            <div className="buttons">
              <AsyncButton className="default" onClick={() => attempt(() => api('setCommunity', { community: community.id, description: description ?? info.description }).then(bump), t('community.saved'))}>
                {t('button.save')}
              </AsyncButton>
            </div>
          </>
        ) : info.description ? (
          <Markdown text={info.description} />
        ) : (
          <p className="small">{t('community.no.description')}</p>
        )}
        <p className="small">{t('community.private.note')}</p>
      </fieldset>
      <fieldset>
        <legend>{t('community.moderators')}</legend>
        {members.map((m) => {
          const isMod = info.moderators.some((x) => x.did === m.did);
          return (
            <div className="field-row" key={m.did}>
              <Avatar did={m.did} size={16} />
              <span className="grow">
                {m.name ?? shortDid(m.did)}
                {m.did === meDid ? ` ${t('ppeople.you')}` : ''} {isMod && <span className="tag">{t('role.moderator')}</span>}
              </span>
              {info.moderator && m.did !== info.founder && (
                <AsyncButton onClick={() => attempt(() => api('setModerator', { community: community.id, who: m.did, on: !isMod }).then(bump))}>{t(isMod ? 'community.drop.moderator' : 'community.make.moderator')}</AsyncButton>
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

const NEW_TABS = ['project', 'community', 'group', 'join'] as const;

export function NewDialog({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const [tab, setTab] = useState<(typeof NEW_TABS)[number]>('project');
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
      const made = await attempt(() => api<ProjectInfo>('createProject', { name, description }), t('new.created', { name: `p/${name}` }));
      const pack = packs?.find((p) => p.name === withPack);
      if (made && pack) {
        bump();
        navigate(spaceHref(made));
        return setPackFor({ project: made, pack });
      }
      go(made);
    }
    if (tab === 'community') go(await attempt(() => api<CommunityInfo>('createCommunity', { name, description }), t('new.created', { name: `r/${name}` })));
    if (tab === 'group') go(await attempt(() => api<SpaceInfo>('createGroup', name), t('new.created', { name: `g/${name}` })));
    if (tab === 'join') {
      const space = await attempt(() => api<SpaceInfo>('joinSpace', invite.trim(), form.values.note || undefined));
      if (space?.waiting) {
        toast(t('new.asked.to.join', { space: spaceLabel(space) }));
        onClose();
        return;
      }
      if (space) toast(t('new.joined', { space: spaceLabel(space) }));
      go(space);
    }
  };
  if (packFor) return <SetupPackDialog project={packFor.project} pack={packFor.pack} onClose={onClose} />;
  return (
    <Modal title={t('new.title')} onClose={onClose}>
      <menu role="tablist">
        {NEW_TABS.map((key) => (
          <li key={key} role="tab" aria-selected={tab === key}>
            <a
              href="#"
              onClick={(e) => {
                e.preventDefault();
                setTab(key);
              }}
            >
              {t(`new.tab.${key}`)}
            </a>
          </li>
        ))}
      </menu>
      <form className="window tab-body form" role="tabpanel" onSubmit={create}>
        <div className="window-body">
          <p className="small">{t(`new.blurb.${tab}`)}</p>
          {tab === 'join' ? (
            <>
              <textarea required rows={4} className="wide" placeholder={t('new.invite.placeholder')} {...form.field('invite')} />
              {form.values.invite.trim().startsWith('weave:knock:') && (
                <div className="field-row-stacked">
                  <label htmlFor="join-note">{t('new.knock.note')}</label>
                  <input id="join-note" maxLength={500} placeholder={t('new.knock.note.placeholder')} {...form.field('note')} />
                </div>
              )}
            </>
          ) : (
            <>
              <div className="field-row-stacked">
                <label htmlFor="new-name">{t('field.name')}</label>
                <input id="new-name" required autoFocus maxLength={40} placeholder={t(`new.placeholder.${tab}`)} {...form.field('name')} />
              </div>
              {tab !== 'group' && (
                <div className="field-row-stacked">
                  <label htmlFor="new-description">{t('new.description')}</label>
                  <textarea id="new-description" rows={3} {...form.field('description')} />
                </div>
              )}
              {tab === 'project' &&
                (packs ?? []).map((p) => (
                  <div className="field-row" key={p.name}>
                    <input type="checkbox" id={`new-pack-${p.name}`} checked={withPack === p.name} onChange={(e) => setWithPack(e.target.checked ? p.name : undefined)} />
                    <label htmlFor={`new-pack-${p.name}`}>
                      {p.title} <span className="small muted">{t('new.pack.steps', { n: p.steps.length })}</span>
                    </label>
                  </div>
                ))}
            </>
          )}
          <p className="small">
            <Icon name="lock" /> {t('new.encrypted')}
          </p>
          <div className="buttons">
            <button type="button" onClick={onClose}>
              {t('button.cancel')}
            </button>
            <button className="default">{t(tab === 'join' ? 'new.join' : 'new.create')}</button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

export function InviteDialog({ space, onClose }: { space: SpaceInfo; onClose(): void }) {
  const { t } = useTexts();
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
    <Modal title={t('invite.title', { space: spaceLabel(space) })} onClose={onClose}>
      {link ? (
        <>
          <p className="small">
            {t(accept ? 'invite.made.accept' : 'invite.made.open', { space: space.name })} {t('invite.expires.in', { n: days })}
          </p>
          <textarea className="wide invite" readOnly rows={5} value={link} />
          <CopyButtons text={link} what={t('invite.link')} onClose={onClose} />
        </>
      ) : (
        <div className="form">
          <div className="field-row">
            <input type="radio" id="invite-open" checked={!accept} onChange={() => setAccept(false)} />
            <label htmlFor="invite-open">{t('invite.open')}</label>
          </div>
          <div className="field-row">
            <input type="radio" id="invite-accept" checked={accept} onChange={() => setAccept(true)} />
            <label htmlFor="invite-accept">{t('invite.accept')}</label>
          </div>
          {limited.length > 0 && (
            <fieldset>
              <legend>{t('invite.limited.boards')}</legend>
              {limited.map((b) => (
                <div className="field-row" key={b.name}>
                  <span className="grow">
                    <Icon name={boardIcon(b)} /> {b.title}
                  </span>
                  <select value={rights[b.name] ?? 'none'} aria-label={t('invite.access.to', { board: b.title })} onChange={(e) => setRights((r) => ({ ...r, [b.name]: e.target.value as 'none' | 'read' | 'write' }))}>
                    <option value="none">{t(b.access?.read ? 'invite.no.access' : 'invite.read.like.everyone')}</option>
                    {b.access?.read && <option value="read">{t('invite.may.read')}</option>}
                    <option value="write">{t(b.access?.read ? 'invite.may.read.write' : 'invite.may.write')}</option>
                  </select>
                </div>
              ))}
            </fieldset>
          )}
          <div className="field-row">
            <label htmlFor="invite-days">{t('invite.expires.after')}</label>
            <select id="invite-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {[1, 7, 30].map((n) => (
                <option key={n} value={n}>
                  {t('invite.days', { n })}
                </option>
              ))}
            </select>
          </div>
          <div className="buttons">
            <button onClick={onClose}>{t('button.cancel')}</button>
            <AsyncButton className="default" onClick={create}>
              {t('invite.create')}
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
  const { t } = useTexts();
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
          <p>{t('notconn.cant.reach', { home })}</p>
          {error && <p className="note">{error}</p>}
          <div className="buttons">
            <button className="default" disabled={!!busy} onClick={() => void again(false)}>
              {t(busy === 'retry' ? 'notconn.trying' : 'button.try.again')}
            </button>
            {bridge.reconnect && (
              <button disabled={!!busy} title={t('notconn.restart.title')} onClick={() => void again(true)}>
                {t(busy === 'restart' ? 'notconn.restarting' : 'notconn.restart')}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
