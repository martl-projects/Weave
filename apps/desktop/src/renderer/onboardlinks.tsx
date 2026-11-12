import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { OnboardLinkInfo, OnboardLook, PlayLinkInfo, SpaceInfo } from '@weave/node/client';
import { bridge } from './bridge.ts';
import { playSoon } from './websites.tsx';
import { Icon } from './icons.tsx';
import { api, bump, navigate, useApi } from './lib.ts';
import { copy, spaceHref } from './posts.tsx';
import { ask, attempt, AsyncButton, Modal, toast } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * "Invite link to play" (idea bZFDCQNT): one short web.martl.io link that makes a newcomer's account, makes you friends,
 * lets them into the project (and more of your spaces) and opens it. Its plan goes sealed to the storage node; what a
 * link card shows (title, a line, the project's picture) is open, and can be left out. Below, your links for this
 * project with how often each was used, to take one back.
 */

const USES = [0, 10, 50];
const DAYS = [7, 30, 365];

export function OnboardLinks({ space, spaces, onClose }: { space: SpaceInfo; spaces: SpaceInfo[]; onClose(): void }) {
  const { t } = useTexts();
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
  const [made, setMade] = useState<{ link: string; svg: string }>();
  const { data: links } = useApi(() => api<OnboardLinkInfo[]>('onboardLinks'), []);
  const mine = (links ?? []).filter((l) => l.spaces.includes(space.id));
  const groups = spaces.filter((s) => s.kind === 'group' && !s.closed);

  const create = async () => {
    const link = await attempt(() =>
      api<OnboardLinkInfo>('createOnboardLink', {
        project: space.id,
        also,
        friends,
        play,
        ask: askFirst,
        ...(welcome.trim() ? { welcome: welcome.trim() } : {}),
        ...(uses ? { uses } : {}),
        days,
        preview: preview ? { ...(previewText.trim() ? { text: previewText.trim() } : {}), image } : false,
      }),
    );
    if (!link) return;
    const svg = await QRCode.toString(link.link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
    setMade({ link: link.link, svg });
    bump();
  };

  const revoke = async (l: OnboardLinkInfo) => {
    if (!(await ask(t('playlink.revoke.ask', { link: l.code }), t('playlink.revoke')))) return;
    await attempt(() => api('revokeOnboardLink', l.code).then(bump), t('playlink.revoked'));
  };

  return (
    <div className="form">
      {made ? (
        <>
          <p className="small">{t('playlink.made', { space: space.name })}</p>
          <div className="onboard-made">
            <span className="qr" dangerouslySetInnerHTML={{ __html: made.svg }} />
            <input className="wide" readOnly value={made.link} onFocus={(e) => e.target.select()} />
          </div>
          <div className="buttons">
            <button onClick={() => setMade(undefined)}>{t('playlink.another')}</button>
            <button className="default" onClick={() => copy(made.link, t('copy.what.copied', { what: t('playlink.link') }))}>
              <Icon name="copy" /> {t('button.copy')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small">{t('playlink.intro')}</p>
          <div className="field-row">
            <input type="checkbox" id="onboard-friends" checked={friends} onChange={(e) => setFriends(e.target.checked)} />
            <label htmlFor="onboard-friends">{t('playlink.friends')}</label>
          </div>
          <div className="field-row">
            <input type="checkbox" id="onboard-play" checked={play} onChange={(e) => setPlay(e.target.checked)} />
            <label htmlFor="onboard-play">{t('playlink.play')}</label>
          </div>
          <div className="field-row">
            <input type="checkbox" id="onboard-ask" checked={askFirst} onChange={(e) => setAskFirst(e.target.checked)} />
            <label htmlFor="onboard-ask">{t('playlink.ask')}</label>
          </div>
          {groups.length > 0 && (
            <fieldset>
              <legend>{t('playlink.also')}</legend>
              {groups.map((g) => (
                <div className="field-row" key={g.id}>
                  <input type="checkbox" id={`onboard-also-${g.id}`} checked={also.includes(g.id)} onChange={(e) => setAlso((a) => (e.target.checked ? [...a, g.id] : a.filter((x) => x !== g.id)))} />
                  <label htmlFor={`onboard-also-${g.id}`}>{g.name}</label>
                </div>
              ))}
            </fieldset>
          )}
          <div className="field-row-stacked">
            <label htmlFor="onboard-welcome">{t('playlink.welcome')}</label>
            <input id="onboard-welcome" maxLength={300} placeholder={t('playlink.welcome.placeholder')} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
          </div>
          <div className="field-row">
            <label htmlFor="onboard-uses">{t('playlink.uses')}</label>
            <select id="onboard-uses" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
              {USES.map((n) => (
                <option key={n} value={n}>
                  {n ? t('playlink.uses.n', { n }) : t('playlink.uses.any')}
                </option>
              ))}
            </select>
            <label htmlFor="onboard-days">{t('invite.expires.after')}</label>
            <select id="onboard-days" value={days} onChange={(e) => setDays(Number(e.target.value))}>
              {DAYS.map((n) => (
                <option key={n} value={n}>
                  {t('invite.days', { n })}
                </option>
              ))}
            </select>
          </div>
          <fieldset>
            <legend>{t('playlink.preview')}</legend>
            <div className="field-row">
              <input type="checkbox" id="onboard-preview" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
              <label htmlFor="onboard-preview">{t('playlink.preview.on')}</label>
            </div>
            {preview && (
              <>
                <div className="field-row-stacked">
                  <label htmlFor="onboard-preview-text">{t('playlink.preview.text')}</label>
                  <input id="onboard-preview-text" maxLength={300} placeholder={t('playlink.preview.text.placeholder', { space: space.name })} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
                </div>
                <div className="field-row">
                  <label htmlFor="onboard-image">{t('playlink.preview.image')}</label>
                  <select id="onboard-image" value={image} onChange={(e) => setImage(e.target.value as typeof image)}>
                    <option value="banner">{t('playlink.image.banner')}</option>
                    <option value="icon">{t('playlink.image.icon')}</option>
                    <option value="none">{t('playlink.image.none')}</option>
                  </select>
                </div>
                <p className="small muted">{t('playlink.preview.open')}</p>
              </>
            )}
          </fieldset>
          <div className="buttons">
            <button onClick={onClose}>{t('button.cancel')}</button>
            <AsyncButton className="default" onClick={create}>
              {t('playlink.create')}
            </AsyncButton>
          </div>
        </>
      )}
      {mine.length > 0 && (
        <fieldset>
          <legend>{t('playlink.yours')}</legend>
          {mine.map((l) => (
            <div className="field-row" key={l.code}>
              <span className="grow">
                <code>{l.code}</code>{' '}
                <span className="small muted">
                  {l.revoked ? t('playlink.state.revoked') : l.used === undefined ? t('playlink.state.unknown') : l.uses ? t('playlink.state.used.of', { n: l.used, uses: l.uses }) : t('playlink.state.used', { n: l.used })}
                  {l.expires && !l.revoked ? ` · ${t('playlink.state.until', { date: new Date(l.expires).toLocaleDateString() })}` : ''}
                </span>
              </span>
              {!l.revoked && (
                <>
                  <button onClick={() => copy(l.link, t('copy.what.copied', { what: t('playlink.link') }))} title={t('button.copy')}>
                    <Icon name="copy" />
                  </button>
                  <AsyncButton onClick={() => revoke(l)}>{t('playlink.revoke')}</AsyncButton>
                </>
              )}
            </div>
          ))}
        </fieldset>
      )}
    </div>
  );
}

/** An onboarding link in text: https://…/j/<code>#<secret>. */
export const ONBOARD_IN_TEXT = /https?:\/\/[^\s/#?]+\/j\/[A-Za-z0-9]{8}#[A-Za-z0-9_-]{22}/;

/** Open the "Join?" dialog for an onboarding link someone sent: from Open link, or a link clicked. */
export function openOnboardLink(link: string): void {
  window.dispatchEvent(new CustomEvent('weave-onboard-link', { detail: link }));
}

/**
 * Someone with Weave follows an onboarding link: "martl invites you to Pferderennen. Join?" The creator becomes a contact,
 * the spaces are joined, and the project opens with the welcome. Mounted once, opened by openOnboardLink.
 */
export function OnboardLinkDialog() {
  const { t } = useTexts();
  const [link, setLink] = useState<string>();
  const { data: look, error } = useApi(() => (link ? api<OnboardLook>('lookAtOnboardLink', link) : Promise.resolve(undefined)), [link]);
  useEffect(() => {
    const onLink = (e: Event) => setLink((e as CustomEvent<string>).detail);
    window.addEventListener('weave-onboard-link', onLink);
    return () => window.removeEventListener('weave-onboard-link', onLink);
  }, []);
  const close = () => setLink(undefined);
  const follow = async (quiet = false) => {
    const done = await attempt(() => api<{ open?: SpaceInfo; welcome?: string; play?: true }>('followOnboardLink', link));
    if (!done) return;
    bump();
    close();
    if (!quiet) toast(done.welcome ? `${look?.by.name ?? ''}: ${done.welcome}` : t('playlink.joined', { title: look?.title ?? '' }));
    if (done.open) playIn(done.open, !!done.play);
  };
  // Your own link, or one whose spaces you're in: a quick start, straight in.
  const quick = !!look && (look.mine || look.spaces.every((s) => s.member));
  useEffect(() => {
    if (quick) void follow(true);
  }, [quick, link]);
  if (!link || quick) return null;
  const by = look?.by.name ?? look?.by.did.slice(0, 16) ?? '';
  const pending = look?.spaces.filter((s) => !s.member) ?? [];
  return (
    <Modal title={t('playlink.join.title')} onClose={close}>
      {error ? (
        <p>{t('inv.doesnt.work', { problem: error })}</p>
      ) : !look ? (
        <p>{t('inv.looking')}</p>
      ) : (
        <>
          <p>{t('playlink.join.ask', { by, title: look.title })}</p>
          {look.welcome && <p className="small">“{look.welcome}”</p>}
          <p className="small muted">{pending.length ? t('playlink.join.spaces', { spaces: pending.map((s) => s.name).join(', '), by }) : t('playlink.join.in.already')}</p>
          <div className="buttons">
            <button onClick={close}>{t('inv.no')}</button>
            <AsyncButton className="default" onClick={() => follow()}>
              {t('inv.yes.join')}
            </AsyncButton>
          </div>
        </>
      )}
    </Modal>
  );
}

/** Where a project's game is: its Live view, which enters the game (playSoon). */
export function playIn(space: { id: string; kind: string }, play: boolean): void {
  const prefix = ({ project: 'p', community: 'r', group: 'g' } as Record<string, string>)[space.kind] ?? 'p';
  if (play && space.kind === 'project') {
    playSoon(space.id);
    return navigate(`#/${prefix}/${space.id}/live`);
  }
  navigate(`#/${prefix}/${space.id}`);
}

/** /play/<code>: a quick start, from My games or an icon on the home screen. Opens its project and enters its game. */
export function PlayRoute({ code }: { code: string }) {
  const { t } = useTexts();
  const { data: links } = useApi(() => api<PlayLinkInfo[]>('playLinks'), []);
  const link = links?.find((l) => l.code === code);
  useEffect(() => {
    if (link) playIn(link.space, link.play);
  }, [link?.code]);
  if (!links || link) return null;
  return (
    <div className="center">
      <section className="pane-main">
        <header className="pane-head">
          <b>{t('playlink.unknown.title')}</b>
        </header>
        <p className="empty">{t('playlink.unknown')}</p>
      </section>
    </div>
  );
}

/** Your games: quick starts in the places tree, ▶ to play; ⋯ keeps one as an app of its own, or lets it go. */
export function MyGames({ route }: { route: string[] }) {
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
        <Icon name="globe" /> {t('playlink.games')}
      </li>
      {links.map((l) => (
        <li key={l.code} className="tree-game">
          <a className={`tree-link${route[0] === 'play' && route[1] === l.code ? ' on' : ''}`} href={`#/play/${l.code}`} title={t('playlink.play', { title: l.title })}>
            <span className="tree-label">▶ {l.title}</span>
          </a>
          <button className="tree-game-app" title={t('playlink.as.app')} onClick={() => asApp(l)}>
            <Icon name="externalLink" />
          </button>
          <button className="tree-game-app" title={t('playlink.remove')} onClick={() => void attempt(() => api('removePlayLink', l.code).then(bump))}>
            <Icon name="close" />
          </button>
        </li>
      ))}
    </>
  );
}
