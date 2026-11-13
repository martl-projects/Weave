import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import type { BoardInfo, LinkTarget, OnboardLinkInfo, OnboardLook, OpenTarget, PlayLinkInfo, PostInfo, SpaceInfo, WebsiteInfo } from '@weave/node/client';
import { bridge } from './bridge.ts';
import { Icon, type IconName } from './icons.tsx';
import { api, bump, navigate, useApi } from './lib.ts';
import { copy, startChat } from './posts.tsx';
import { ask, attempt, AsyncButton, Modal, toast } from './ui.tsx';
import { useTexts } from './texts.tsx';
import { playSoon } from './websites.tsx';

/*
 * Weave links (idea bZFDCQNT): one short web.martl.io link that makes a newcomer's account, makes you friends, lets them in
 * and opens what it leads to. Built in four steps: where it leads (you, a space, or in a space a board, a post or a website),
 * what happens on arrival, who may use it and how long, and how its card looks where it's shared. Its plan goes sealed to
 * the storage node; only the card is open. Below, your links with how often each was used, to take one back.
 *
 * Following one (Open link, a link handed over by the OS, Weave Web's /j/…) asks "Join?" once; a link to where you are
 * already, or your own, opens straight away and stays as a quick start (Quick start in the places tree, /play/<code>).
 */

type Where = 'me' | 'space';
type What = 'space' | 'board' | 'post' | 'website';
const STEPS = 4;
/** Where the card says the link is from: Weave Web's page, where links live. */
const CARD_SITE = bridge.web ? location.host : new URL('https://web.martl.io').host;
const USES = [0, 1, 10, 50];
const DAYS = [7, 30, 365];

/** The link builder: four steps, then the link. `space`: a place to start from (Invite in a space). */
export function LinkBuilder({ spaces, space: from, tabs, onClose }: { spaces: SpaceInfo[]; space?: SpaceInfo; tabs?: ReactNode; onClose(): void }) {
  const { t } = useTexts();
  // Only places you may let people into: a project's maintainers make its links, any member a group's or community's.
  const places = spaces.filter((s) => s.kind !== 'direct' && !s.closed && s.mayInvite);
  const [step, setStep] = useState(1);
  const [where, setWhere] = useState<Where>(from?.mayInvite ? 'space' : 'me');
  const [spaceId, setSpaceId] = useState(from?.mayInvite ? from.id : (places[0]?.id ?? ''));
  const [what, setWhat] = useState<What>('space');
  const [board, setBoard] = useState('');
  const [post, setPost] = useState('');
  const [website, setWebsite] = useState('');
  const [friends, setFriends] = useState(true);
  const [play, setPlay] = useState(true);
  const [askFirst, setAskFirst] = useState(false);
  const [also, setAlso] = useState<string[]>([]);
  const [welcome, setWelcome] = useState('');
  const [uses, setUses] = useState(0);
  const [days, setDays] = useState(30);
  const [preview, setPreview] = useState(true);
  const [previewText, setPreviewText] = useState('');
  const [image, setImage] = useState<'banner' | 'icon' | 'none'>('banner');
  const [made, setMade] = useState<{ link: string; svg: string; target: LinkTarget['kind'] }>();
  const space = places.find((s) => s.id === spaceId);
  const { data: boards } = useApi(() => (where === 'space' && space?.kind === 'project' ? api<BoardInfo[]>('boards', space.id) : Promise.resolve([] as BoardInfo[])), [where, space?.id]);
  const { data: posts } = useApi(() => (where === 'space' && space && what === 'post' ? api<PostInfo[]>('posts', { space: space.id, sort: 'new' }) : Promise.resolve([] as PostInfo[])), [where, space?.id, what]);
  const { data: websites } = useApi(() => (where === 'space' && space?.kind === 'project' ? api<WebsiteInfo[]>('websites', space.id).catch(() => [] as WebsiteInfo[]) : Promise.resolve([] as WebsiteInfo[])), [where, space?.id]);
  const { data: links } = useApi(() => api<OnboardLinkInfo[]>('onboardLinks'), []);
  const { data: me } = useApi(() => api<{ name?: string }>('profile'), []);
  const groups = places.filter((s) => s.kind === 'group' && s.id !== spaceId);

  // What's chosen, as the node takes it; undefined while something's missing.
  const target: LinkTarget | undefined =
    where === 'me'
      ? { kind: 'me' }
      : !space
        ? undefined
        : what === 'board'
          ? board ? { kind: 'board', space: space.id, board } : undefined
          : what === 'post'
            ? post ? { kind: 'post', space: space.id, post } : undefined
            : what === 'website'
              ? website ? { kind: 'website', space: space.id, website } : undefined
              : { kind: 'space', space: space.id };
  const title =
    where === 'me'
      ? (me?.name ?? '')
      : what === 'board'
        ? `${boards?.find((b) => b.name === board)?.title ?? ''} · ${space?.name ?? ''}`
        : what === 'post'
          ? (posts?.find((p) => p.id === post)?.title ?? '')
          : what === 'website'
            ? (websites?.find((w) => w.id === website)?.name ?? '')
            : (space?.name ?? '');
  const line = previewText.trim() || (where === 'me' ? t('linkb.card.me', { name: me?.name ?? '' }) : t('linkb.card.space', { name: me?.name ?? '', title }));

  const create = async () => {
    if (!target) return;
    const link = await attempt(() =>
      api<OnboardLinkInfo>('createOnboardLink', {
        target,
        // Weave Web makes links for its own page (and the storage node behind it); the desktop for web.martl.io.
        ...(bridge.web ? { page: location.origin } : {}),
        also,
        friends: where === 'me' || friends,
        play: what === 'website' ? play : false,
        ask: where === 'space' && askFirst,
        ...(welcome.trim() ? { welcome: welcome.trim() } : {}),
        ...(uses ? { uses } : {}),
        days,
        preview: preview ? { ...(previewText.trim() ? { text: previewText.trim() } : {}), image } : false,
      }),
    );
    if (!link) return;
    const svg = await QRCode.toString(link.link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    setMade({ link: link.link, svg, target: target.kind });
    bump();
  };
  const revoke = async (l: OnboardLinkInfo) => {
    if (!(await ask(t('linkb.revoke.ask', { link: l.code }), t('linkb.revoke')))) return;
    await attempt(() => api('revokeOnboardLink', l.code).then(bump), t('linkb.revoked'));
  };

  const stepTitle = [t('linkb.step.where'), t('linkb.step.arrive'), t('linkb.step.who'), t('linkb.step.card')][step - 1];
  return (
    <Modal title={made ? t('linkb.made.title') : t('linkb.title', { n: step, of: STEPS, step: stepTitle })} onClose={onClose}>
      {!made && tabs}
      {made ? (
        <div className="form">
          <p className="small">{t('linkb.made')}</p>
          <div className="onboard-made">
            <span className="qr" dangerouslySetInnerHTML={{ __html: made.svg }} />
            <input className="wide" readOnly value={made.link} onFocus={(e) => e.target.select()} />
          </div>
          <div className="buttons">
            <button onClick={() => (setMade(undefined), setStep(1))}>{t('linkb.another')}</button>
            <button className="default" onClick={() => copy(made.link, t('copy.what.copied', { what: t('linkb.link') }))}>
              <Icon name="copy" /> {t('button.copy')}
            </button>
          </div>
        </div>
      ) : (
        <div className="form link-builder">
          <ol className="steps-dots" aria-hidden>
            {Array.from({ length: STEPS }, (_, i) => (
              <li key={i} className={i + 1 === step ? 'on' : i + 1 < step ? 'done' : ''} />
            ))}
          </ol>

          {step === 1 && (
            <>
              <div className="field-row">
                <input type="radio" id="lb-me" checked={where === 'me'} onChange={() => setWhere('me')} />
                <label htmlFor="lb-me">{t('linkb.where.me')}</label>
              </div>
              <div className="field-row">
                <input type="radio" id="lb-space" checked={where === 'space'} disabled={!places.length} onChange={() => setWhere('space')} />
                <label htmlFor="lb-space">{t('linkb.where.space')}</label>
              </div>
              {where === 'space' && (
                <fieldset>
                  <div className="field-row">
                    <label htmlFor="lb-space-pick">{t('linkb.space')}</label>
                    <select id="lb-space-pick" value={spaceId} onChange={(e) => (setSpaceId(e.target.value), setWhat('space'), setBoard(''), setPost(''), setWebsite(''))}>
                      {places.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name} · {t(`word.${s.kind}`)}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="field-row">
                    <label htmlFor="lb-what">{t('linkb.what')}</label>
                    <select id="lb-what" value={what} onChange={(e) => setWhat(e.target.value as What)}>
                      <option value="space">{t('linkb.what.space')}</option>
                      {space?.kind === 'project' && <option value="board">{t('linkb.what.board')}</option>}
                      <option value="post">{t('linkb.what.post')}</option>
                      {space?.kind === 'project' && <option value="website">{t('linkb.what.website')}</option>}
                    </select>
                  </div>
                  {what === 'board' && (
                    <div className="field-row">
                      <label htmlFor="lb-board">{t('word.board')}</label>
                      <select id="lb-board" value={board} onChange={(e) => setBoard(e.target.value)}>
                        <option value="">{t('linkb.pick')}</option>
                        {(boards ?? []).map((b) => (
                          <option key={b.name} value={b.name}>
                            {b.title}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {what === 'post' && (
                    <div className="field-row">
                      <label htmlFor="lb-post">{t('word.post')}</label>
                      <select id="lb-post" value={post} onChange={(e) => setPost(e.target.value)}>
                        <option value="">{t('linkb.pick')}</option>
                        {(posts ?? []).slice(0, 50).map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.title || p.text?.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  {what === 'website' &&
                    (websites?.length ? (
                      <div className="field-row">
                        <label htmlFor="lb-website">{t('linkb.what.website')}</label>
                        <select id="lb-website" value={website} onChange={(e) => setWebsite(e.target.value)}>
                          <option value="">{t('linkb.pick')}</option>
                          {websites.map((w) => (
                            <option key={w.id} value={w.id}>
                              {w.name}
                            </option>
                          ))}
                        </select>
                      </div>
                    ) : (
                      <p className="small muted">{t('linkb.no.websites')}</p>
                    ))}
                </fieldset>
              )}
            </>
          )}

          {step === 2 && (
            <>
              <div className="field-row">
                <input type="checkbox" id="lb-friends" checked={where === 'me' || friends} disabled={where === 'me'} onChange={(e) => setFriends(e.target.checked)} />
                <label htmlFor="lb-friends">{t('linkb.friends')}</label>
              </div>
              {what === 'website' && where === 'space' && (
                <div className="field-row">
                  <input type="checkbox" id="lb-play" checked={play} onChange={(e) => setPlay(e.target.checked)} />
                  <label htmlFor="lb-play">{t('linkb.start')}</label>
                </div>
              )}
              {where === 'space' && (
                <div className="field-row">
                  <input type="checkbox" id="lb-ask" checked={askFirst} onChange={(e) => setAskFirst(e.target.checked)} />
                  <label htmlFor="lb-ask">{t('linkb.ask')}</label>
                </div>
              )}
              {groups.length > 0 && (
                <fieldset>
                  <legend>{t('linkb.also')}</legend>
                  {groups.map((g) => (
                    <div className="field-row" key={g.id}>
                      <input type="checkbox" id={`lb-also-${g.id}`} checked={also.includes(g.id)} onChange={(e) => setAlso((a) => (e.target.checked ? [...a, g.id] : a.filter((x) => x !== g.id)))} />
                      <label htmlFor={`lb-also-${g.id}`}>{g.name}</label>
                    </div>
                  ))}
                </fieldset>
              )}
              <div className="field-row-stacked">
                <label htmlFor="lb-welcome">{t('linkb.welcome')}</label>
                <input id="lb-welcome" maxLength={300} placeholder={t('linkb.welcome.placeholder')} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="field-row">
                <label htmlFor="lb-uses">{t('linkb.uses')}</label>
                <select id="lb-uses" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
                  {USES.map((n) => (
                    <option key={n} value={n}>
                      {n ? t('linkb.uses.n', { n }) : t('linkb.uses.any')}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-row">
                <label htmlFor="lb-days">{t('invite.expires.after')}</label>
                <select id="lb-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {DAYS.map((n) => (
                    <option key={n} value={n}>
                      {t('invite.days', { n })}
                    </option>
                  ))}
                </select>
              </div>
              <p className="small muted">{t('linkb.who.note')}</p>
            </>
          )}

          {step === 4 && (
            <>
              <div className="field-row">
                <input type="checkbox" id="lb-preview" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
                <label htmlFor="lb-preview">{t('linkb.card.on')}</label>
              </div>
              {preview && (
                <>
                  <div className="field-row-stacked">
                    <label htmlFor="lb-card-text">{t('linkb.card.text')}</label>
                    <input id="lb-card-text" maxLength={300} placeholder={line} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
                  </div>
                  {where === 'space' && space?.kind === 'project' && (
                    <div className="field-row">
                      <label htmlFor="lb-image">{t('linkb.card.image')}</label>
                      <select id="lb-image" value={image} onChange={(e) => setImage(e.target.value as typeof image)}>
                        <option value="banner">{t('linkb.image.banner')}</option>
                        <option value="icon">{t('linkb.image.icon')}</option>
                        <option value="none">{t('linkb.image.none')}</option>
                      </select>
                    </div>
                  )}
                  <div className="link-card" aria-label={t('linkb.card.looks')}>
                    <span className="link-card-site">{CARD_SITE}</span>
                    <b>{title || 'Weave'}</b>
                    <span>{line}</span>
                  </div>
                  <p className="small muted">{t('linkb.card.open')}</p>
                </>
              )}
            </>
          )}

          <div className="buttons">
            {step > 1 ? <button onClick={() => setStep(step - 1)}>{t('linkb.back')}</button> : <button onClick={onClose}>{t('button.cancel')}</button>}
            {step < STEPS ? (
              <button className="default" disabled={step === 1 && !target} onClick={() => setStep(step + 1)}>
                {t('linkb.next')}
              </button>
            ) : (
              <AsyncButton className="default" disabled={!target} onClick={create}>
                {t('linkb.create')}
              </AsyncButton>
            )}
          </div>
        </div>
      )}
      {!!links?.length && (
        <fieldset className="link-list">
          <legend>{t('linkb.yours')}</legend>
          {links.slice(0, 20).map((l) => (
            <div className="field-row" key={l.code}>
              <Icon name={KIND_ICON[l.kind]} />
              <span className="grow">
                {l.title} <span className="small muted">
                  {l.revoked ? t('linkb.state.revoked') : l.used === undefined ? t('linkb.state.unknown') : l.uses ? t('linkb.state.used.of', { n: l.used, uses: l.uses }) : t('linkb.state.used', { n: l.used })}
                  {l.expires && !l.revoked ? ` · ${t('linkb.state.until', { date: new Date(l.expires).toLocaleDateString() })}` : ''}
                </span>
              </span>
              {!l.revoked && (
                <>
                  <button onClick={() => copy(l.link, t('copy.what.copied', { what: t('linkb.link') }))} title={t('button.copy')}>
                    <Icon name="copy" />
                  </button>
                  <AsyncButton onClick={() => revoke(l)}>{t('linkb.revoke')}</AsyncButton>
                </>
              )}
            </div>
          ))}
        </fieldset>
      )}
    </Modal>
  );
}

const KIND_ICON: Record<LinkTarget['kind'], IconName> = { me: 'user', space: 'zap', board: 'notes', post: 'pencil', website: 'globe' };

export { joinLinkOf, ONBOARD_IN_TEXT } from './joinlink.ts';

/** A link waiting for the dialog: it may come before the app is there (a new person still setting up). */
let waiting: string | undefined;

/** Open the "Join?" dialog for an onboarding link someone sent: from Open link, or a link the OS handed over. */
export function openOnboardLink(link: string): void {
  waiting = link;
  window.dispatchEvent(new CustomEvent('weave-onboard-link', { detail: link }));
}

/**
 * Someone with Weave follows a link: "martl invites you to Pferderennen. Join?" The creator becomes a contact, the spaces
 * are joined, and what it leads to opens, with the welcome. Your own link, or one to where you are already, opens at once.
 * Mounted once with the app, so a link that came while setting up waits here.
 */
export function OnboardLinkDialog() {
  const { t } = useTexts();
  const [link, setLink] = useState<string | undefined>(() => waiting);
  const { data: look, error } = useApi(() => (link ? api<OnboardLook>('lookAtOnboardLink', link) : Promise.resolve(undefined)), [link]);
  useEffect(() => {
    const onLink = (e: Event) => setLink((e as CustomEvent<string>).detail);
    window.addEventListener('weave-onboard-link', onLink);
    return () => window.removeEventListener('weave-onboard-link', onLink);
  }, []);
  const close = () => {
    waiting = undefined;
    setLink(undefined);
  };
  const follow = async (quiet = false) => {
    const done = await attempt(() => api<{ target?: OpenTarget; welcome?: string }>('followOnboardLink', link));
    if (!done) return;
    bump();
    close();
    if (!quiet) toast(done.welcome ? `${look?.by.name ?? ''}: ${done.welcome}` : t('linkb.joined', { title: look?.title ?? '' }));
    if (done.target) openTarget(done.target);
  };
  // Your own link, or one to where you are already: straight there.
  const quick = !!look && (look.mine || (look.spaces.length > 0 && look.spaces.every((s) => s.member)));
  useEffect(() => {
    if (quick) void follow(true);
  }, [quick, link]);
  if (!link || quick) return null;
  const by = look?.by.name ?? look?.by.did.slice(0, 16) ?? '';
  const pending = look?.spaces.filter((s) => !s.member) ?? [];
  return (
    <Modal title={t('linkb.join.title')} onClose={close}>
      {error ? (
        <p>{t('inv.doesnt.work', { problem: error })}</p>
      ) : !look ? (
        <p>{t('inv.looking')}</p>
      ) : (
        <>
          <p>{look.spaces.length ? t('linkb.join.ask', { by, title: look.title }) : t('linkb.join.me', { by })}</p>
          {look.welcome && <p className="small">“{look.welcome}”</p>}
          <p className="small muted">{pending.length ? t('linkb.join.spaces', { spaces: pending.map((s) => s.name).join(', '), by }) : t('linkb.join.friends', { by })}</p>
          <div className="buttons">
            <button onClick={close}>{t('inv.no')}</button>
            <AsyncButton className="default" onClick={() => follow()}>
              {look.spaces.length ? t('inv.yes.join') : t('linkb.join.connect')}
            </AsyncButton>
          </div>
        </>
      )}
    </Modal>
  );
}

const PREFIX: Record<string, string> = { project: 'p', community: 'r', group: 'g' };

/** Go where a link leads: a chat with its creator, a space, a board or post in it, or its website, started as ▶ would. */
export function openTarget(target: OpenTarget): void {
  if (target.chat) return void startChat(target.chat);
  const space = target.space;
  if (!space) return;
  const base = `#/${PREFIX[space.kind] ?? 'p'}/${space.id}`;
  if (target.kind === 'post' && target.post) return navigate(`#/post/${target.post}`);
  if (target.kind === 'board' && target.board) return navigate(`${base}/b/${target.board}`);
  if ((target.kind === 'website' || target.play) && space.kind === 'project') {
    if (target.play) playSoon(space.id, target.website);
    return navigate(`${base}/live`);
  }
  navigate(base);
}

/** /play/<code>: a quick start, from Quick start or an icon on the home screen. Goes where its link leads. */
export function QuickRoute({ code }: { code: string }) {
  const { t } = useTexts();
  const { data: links } = useApi(() => api<PlayLinkInfo[]>('playLinks'), []);
  const link = links?.find((l) => l.code === code);
  useEffect(() => {
    if (link) openTarget(link.target);
  }, [link?.code]);
  if (!links || link) return null;
  return (
    <div className="center">
      <section className="pane-main">
        <header className="pane-head">
          <b>{t('linkb.unknown.title')}</b>
        </header>
        <p className="empty">{t('linkb.unknown')}</p>
      </section>
    </div>
  );
}

/** Quick starts in the places tree: one click to where a link leads; each can be kept as an app of its own, or let go. */
export function QuickStarts({ route }: { route: string[] }) {
  const { t } = useTexts();
  const { data: links } = useApi(() => api<PlayLinkInfo[]>('playLinks').catch(() => [] as PlayLinkInfo[]), []);
  if (!links?.length) return null;
  const asApp = (l: PlayLinkInfo) => {
    const url = `${l.page}/play/${l.code}`;
    // In Weave Web on the link's own page: go there, where the browser offers it as an app. Elsewhere: the browser.
    if (bridge.web && new URL(l.page).origin === location.origin) location.assign(url);
    else window.open(url, '_blank', 'noopener');
  };
  return (
    <>
      <li className="tree-head">
        <Icon name="zap" /> {t('linkb.quick')}
      </li>
      {links.map((l) => (
        <li key={l.code} className="tree-game">
          <a className={`tree-link${route[0] === 'play' && route[1] === l.code ? ' on' : ''}`} href={`#/play/${l.code}`} title={t('linkb.quick.open', { title: l.title })}>
            <Icon name={KIND_ICON[l.target.kind]} />
            <span className="tree-label">{l.title}</span>
          </a>
          <button className="tree-game-app" title={t('linkb.as.app')} onClick={() => asApp(l)}>
            <Icon name="externalLink" />
          </button>
          <button className="tree-game-app" title={t('linkb.quick.remove')} onClick={() => void attempt(() => api('removePlayLink', l.code).then(bump))}>
            <Icon name="close" />
          </button>
        </li>
      ))}
    </>
  );
}
