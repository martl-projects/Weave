import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { LinkTarget, OnboardLinkInfo, OnboardLook, OpenTarget, PlayLinkInfo, PostInfo, SpaceInfo } from '@weave/node/client';
import { bridge } from './bridge.ts';
import { Icon, type IconName } from './icons.tsx';
import { api, blobUrl, bump, navigate, useApi } from './lib.ts';
import { copy, startChat } from './posts.tsx';
import { ask, attempt, AsyncButton, BlobImage, Info, Modal, toast } from './ui.tsx';
import { ShareMark } from './share.tsx';
import { useTexts } from './texts.tsx';
import { playSoon } from './websites.tsx';
import weaveMark from './mark.png';

/*
 * Weave links (idea bZFDCQNT): one short web.martl.io link that makes a newcomer's account, makes you friends, lets them in
 * and opens what it leads to. Where it leads is chosen in share mode (share.tsx), by going there; then three steps: who
 * gets it (and a message for them), access (how often, how long, confirmed by you or not), and its preview where it's shared. Its plan goes sealed to the
 * storage node; only the card is open. Below, your links with how often each was used, to take one back.
 *
 * Following one (Open link, a link handed over by the OS, Weave Web's /j/…) asks "Join?" once; a link to where you are
 * already, or your own, opens straight away and stays as a quick start (Quick start in the places tree, /play/<code>).
 */

const STEPS = 3;
/** Where the card says the link is from: Weave Web's page, where links live. */
const CARD_SITE = bridge.web ? location.host : new URL('https://web.martl.io').host;
const USES = [0, 1, 10, 50];
/** How long a link works, in days: half an hour, a day, a week, a month. */
const EXPIRY = [1 / 48, 1, 7, 30];
/** What a link card's picture may weigh at the storage node. */
const MAX_PICTURE = 300 * 1024;

/** The picture a card has until another is chosen: Weave's own mark. */
const WEAVE = 'weave';

/** A picture (wblob:, or Weave's mark) as a PNG of at most 300 KB, base64: smaller each try until it fits. */
async function cardPng(ref: string): Promise<string> {
  const image = new Image();
  image.src = ref === WEAVE ? weaveMark : await blobUrl(ref);
  await image.decode();
  for (let most = 1200; most >= 150; most = Math.round(most * 0.75)) {
    const scale = Math.min(1, most / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext('2d')!.drawImage(image, 0, 0, canvas.width, canvas.height);
    const png = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (png && png.size <= MAX_PICTURE) {
      const bytes = new Uint8Array(await png.arrayBuffer());
      let text = '';
      for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(text);
    }
  }
  throw new Error("that picture doesn't fit on a link card");
}

/**
 * The rest of a Weave link, once share mode (share.tsx) said where it leads, in three steps with big titles: who gets it
 * (where it opens, what they become part of, a message), access (how often, how long, whether you confirm each), and its
 * preview, edited in place (click a line to change it, the picture to choose one from the places it leads to). Then the
 * link. `opens`: where it leads, as the bar names it; `places`: the spaces it lets them into. `onClose(made)`.
 */
export function LinkFinish({ target, also, title, opens, places, onClose }: { target: LinkTarget; also: string[]; title: string; opens: string; places: SpaceInfo[]; onClose(made: boolean): void }) {
  const { t } = useTexts();
  const toMe = target.kind === 'me';
  const [step, setStep] = useState(1);
  const [play, setPlay] = useState(true);
  const [confirm, setConfirm] = useState(false);
  const [welcome, setWelcome] = useState('');
  const [uses, setUses] = useState(0);
  const [days, setDays] = useState(30);
  const [noPreview, setNoPreview] = useState(false);
  // The card's title and line as written here; until then the ones the node would put (shown, and editable, as they are).
  const [cardTitle, setCardTitle] = useState<string>();
  const [cardText, setCardText] = useState<string>();
  // The card's picture: Weave's mark until another (a wblob: reference) is chosen, or none.
  const [picture, setPicture] = useState<string | null>(WEAVE);
  const [picking, setPicking] = useState(false);
  const [made, setMade] = useState<{ link: string; svg: string }>();
  const { data: me } = useApi(() => api<{ name?: string }>('profile'), []);
  const line = toMe ? t('linkb.card.me', { name: me?.name ?? '' }) : t('linkb.card.space', { name: me?.name ?? '', title });
  const shown = picture ?? undefined;
  const named = (s: SpaceInfo) => `${{ project: 'p/', community: 'r/', group: 'g/' }[s.kind as string] ?? ''}${s.name}`;

  const create = async () => {
    const image = noPreview ? undefined : shown ? { png: await cardPng(shown) } : 'none';
    const link = await attempt(() =>
      api<OnboardLinkInfo>('createOnboardLink', {
        target,
        // Weave Web makes links for its own page (and the storage node behind it); the desktop for web.martl.io.
        ...(bridge.web ? { page: location.origin } : {}),
        also,
        friends: true,
        play: target.kind === 'website' ? play : false,
        ask: !toMe && confirm,
        ...(welcome.trim() ? { welcome: welcome.trim() } : {}),
        ...(uses ? { uses } : {}),
        days,
        // What the card shows is what it says: its title and line as they stand here, written or not.
        preview: noPreview ? false : { title: (cardTitle ?? title).trim() || title, text: (cardText ?? line).trim() || line, image },
      }),
    );
    if (!link) return;
    const svg = await QRCode.toString(link.link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    setMade({ link: link.link, svg });
    bump();
  };
  // One title, the step's, on top of the window; which step it is right under it.
  const stepTitle = made ? t('linkb.made.title') : t(['linkb.step1', 'linkb.step2', 'linkb.step3'][step - 1]);
  return (
    <Modal title={stepTitle} onClose={() => onClose(!!made)}>
      {made ? (
        <div className="form">
          <p className="lf-sub muted">{t('linkb.made')}</p>
          <div className="onboard-made">
            <span className="qr" dangerouslySetInnerHTML={{ __html: made.svg }} />
            <input className="wide" readOnly value={made.link} onFocus={(e) => e.target.select()} />
          </div>
          <div className="buttons">
            <button onClick={() => onClose(true)}>{t('button.close')}</button>
            <button className="default" onClick={() => copy(made.link, t('copy.what.copied', { what: t('linkb.link') }))}>
              <Icon name="copy" /> {t('button.copy')}
            </button>
          </div>
        </div>
      ) : (
        <div className="form link-builder">
          <p className="lf-sub muted">{t('linkb.step.n', { n: step, of: STEPS })}</p>
          {step === 1 && (
            <>
              <p className="lf-section">{t('linkb.who.gets')}</p>
              <ul className="lf-list">
                <li>
                  <ShareMark kind="target" /> {t('linkb.opens')} {opens}
                </li>
                {places.length > 0 && (
                  <li>
                    <ShareMark kind="check" /> {t('linkb.joins')}
                    <ul>
                      {places.map((s) => (
                        <li key={s.id}>{named(s)}</li>
                      ))}
                    </ul>
                  </li>
                )}
                <li>
                  <ShareMark kind="check" /> {t('linkb.friends.always', { name: me?.name ?? '' })}
                </li>
              </ul>
              {target.kind === 'website' && (
                <div className="field-row">
                  <input type="checkbox" id="lb-play" checked={play} onChange={(e) => setPlay(e.target.checked)} />
                  <label htmlFor="lb-play">{t('linkb.start')}</label>
                </div>
              )}
              <div className="field-row-stacked">
                <span className="lf-label">
                  <label htmlFor="lb-welcome">{t('linkb.message')}</label>
                  <Info>{t('linkb.message.help')}</Info>
                </span>
                <input id="lb-welcome" maxLength={300} placeholder={t('linkb.welcome.placeholder')} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className="lf-grid">
                <label htmlFor="lb-uses">{t('linkb.uses')}</label>
                <select id="lb-uses" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
                  {USES.map((n) => (
                    <option key={n} value={n}>
                      {n ? t('linkb.uses.n', { n }) : t('linkb.uses.any')}
                    </option>
                  ))}
                </select>
                <label htmlFor="lb-days">{t('linkb.expires')}</label>
                <select id="lb-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {EXPIRY.map((n) => (
                    <option key={n} value={n}>
                      {n < 1 ? t('linkb.expiry.30m') : t('linkb.expiry.days', { n })}
                    </option>
                  ))}
                </select>
              </div>
              {!toMe && (
                <div className="field-row">
                  <input type="checkbox" id="lb-confirm" checked={confirm} onChange={(e) => setConfirm(e.target.checked)} />
                  <label htmlFor="lb-confirm">{t('linkb.confirm')}</label>
                  <Info>{t('linkb.confirm.help')}</Info>
                </div>
              )}
              <p className="small muted">{t('linkb.who.note')}</p>
            </>
          )}

          {step === 3 && (
            <>
              {/* The card as a messenger shows it (Signal's: the picture on the left, the bold title, the line, the site), edited in place. */}
              <div className={`lf-card${noPreview ? ' off' : ''}${shown ? '' : ' no-picture'}`} aria-label={t('linkb.card.looks')}>
                <button type="button" className="lf-card-picture" disabled={noPreview} title={t('linkb.card.pick')} onClick={() => setPicking(true)}>
                  {shown === WEAVE ? <img src={weaveMark} alt="" /> : shown ? <BlobImage src={shown} /> : <span className="small">{t('linkb.card.pick')}</span>}
                </button>
                <div className="lf-card-body">
                  <input className="lf-edit lf-edit-title" disabled={noPreview} maxLength={100} title={t('linkb.card.edit')} aria-label={t('linkb.card.title')} placeholder={title || 'Weave'} value={cardTitle ?? title} onChange={(e) => setCardTitle(e.target.value)} />
                  <textarea className="lf-edit" disabled={noPreview} maxLength={300} rows={2} title={t('linkb.card.edit')} aria-label={t('linkb.card.text')} placeholder={line} value={cardText ?? line} onChange={(e) => setCardText(e.target.value)} />
                  <span className="lf-card-site">{CARD_SITE}</span>
                </div>
              </div>
              <p className="small muted">{t('linkb.card.open')}</p>
              <div className="field-row">
                <input type="checkbox" id="lb-no-preview" checked={noPreview} onChange={(e) => setNoPreview(e.target.checked)} />
                <label htmlFor="lb-no-preview">{t('linkb.card.none')}</label>
              </div>
              {picking && <PicturePicker places={places} chosen={shown} onPick={(ref) => (setPicture(ref), setPicking(false))} onClose={() => setPicking(false)} />}
            </>
          )}

          <div className="buttons">
            <button onClick={() => (step > 1 ? setStep(step - 1) : onClose(false))}>{t('linkb.back')}</button>
            {step < STEPS ? (
              <button className="default" onClick={() => setStep(step + 1)}>
                {t('linkb.next')}
              </button>
            ) : (
              <AsyncButton className="default" onClick={create}>
                {t('linkb.create')}
              </AsyncButton>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Pictures for a link's card: Weave's mark, the places' icons and banners, pictures in their posts, or none. */
function PicturePicker({ places, chosen, onPick, onClose }: { places: SpaceInfo[]; chosen?: string; onPick(ref: string | null): void; onClose(): void }) {
  const { t } = useTexts();
  const { data: pictures } = useApi(async () => {
    const own = places.flatMap((s) => [s.background, s.icon]).filter((r): r is string => !!r);
    const posted = (await Promise.all(places.map((s) => api<PostInfo[]>('posts', { space: s.id, sort: 'new' }).catch(() => [] as PostInfo[])))).flat().map((p) => p.image).filter((r): r is string => !!r);
    return [...new Set([...own, ...posted])].slice(0, 40);
  }, [places.map((s) => s.id).join()]);
  return (
    <Modal title={t('linkb.card.picker')} onClose={onClose}>
      <div className="lf-pictures">
        <button type="button" className={`lf-picture lf-picture-weave${chosen === WEAVE ? ' on' : ''}`} title="Weave" onClick={() => onPick(WEAVE)}>
          <img src={weaveMark} alt="Weave" />
        </button>
        {(pictures ?? []).map((ref) => (
          <button type="button" key={ref} className={`lf-picture${ref === chosen ? ' on' : ''}`} onClick={() => onPick(ref)}>
            <BlobImage src={ref} />
          </button>
        ))}
        <button type="button" className={`lf-picture lf-picture-none${chosen ? '' : ' on'}`} onClick={() => onPick(null)}>
          {t('linkb.card.nopicture')}
        </button>
      </div>
      {pictures && !pictures.length && <p className="small muted">{t('linkb.card.pictures.none')}</p>}
    </Modal>
  );
}

/** Your links, with how often each was used, to copy one again or take it back (Keys & devices). */
export function YourLinks() {
  const { t } = useTexts();
  const { data: links } = useApi(() => api<OnboardLinkInfo[]>('onboardLinks').catch(() => [] as OnboardLinkInfo[]), []);
  const revoke = async (l: OnboardLinkInfo) => {
    if (!(await ask(t('linkb.revoke.ask', { link: l.code }), t('linkb.revoke')))) return;
    await attempt(() => api('revokeOnboardLink', l.code).then(bump), t('linkb.revoked'));
  };
  if (!links?.length) return null;
  return (
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
