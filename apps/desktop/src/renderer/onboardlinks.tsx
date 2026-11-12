import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { OnboardLinkInfo, OnboardLook, SpaceInfo } from '@weave/node/client';
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
    if (!(await ask(t('onboard.revoke.ask', { link: l.code }), t('onboard.revoke')))) return;
    await attempt(() => api('revokeOnboardLink', l.code).then(bump), t('onboard.revoked'));
  };

  return (
    <div className="form">
      {made ? (
        <>
          <p className="small">{t('onboard.made', { space: space.name })}</p>
          <div className="onboard-made">
            <span className="qr" dangerouslySetInnerHTML={{ __html: made.svg }} />
            <input className="wide" readOnly value={made.link} onFocus={(e) => e.target.select()} />
          </div>
          <div className="buttons">
            <button onClick={() => setMade(undefined)}>{t('onboard.another')}</button>
            <button className="default" onClick={() => copy(made.link, t('copy.what.copied', { what: t('onboard.link') }))}>
              <Icon name="copy" /> {t('button.copy')}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="small">{t('onboard.intro')}</p>
          <div className="field-row">
            <input type="checkbox" id="onboard-friends" checked={friends} onChange={(e) => setFriends(e.target.checked)} />
            <label htmlFor="onboard-friends">{t('onboard.friends')}</label>
          </div>
          <div className="field-row">
            <input type="checkbox" id="onboard-play" checked={play} onChange={(e) => setPlay(e.target.checked)} />
            <label htmlFor="onboard-play">{t('onboard.play')}</label>
          </div>
          <div className="field-row">
            <input type="checkbox" id="onboard-ask" checked={askFirst} onChange={(e) => setAskFirst(e.target.checked)} />
            <label htmlFor="onboard-ask">{t('onboard.ask')}</label>
          </div>
          {groups.length > 0 && (
            <fieldset>
              <legend>{t('onboard.also')}</legend>
              {groups.map((g) => (
                <div className="field-row" key={g.id}>
                  <input type="checkbox" id={`onboard-also-${g.id}`} checked={also.includes(g.id)} onChange={(e) => setAlso((a) => (e.target.checked ? [...a, g.id] : a.filter((x) => x !== g.id)))} />
                  <label htmlFor={`onboard-also-${g.id}`}>{g.name}</label>
                </div>
              ))}
            </fieldset>
          )}
          <div className="field-row-stacked">
            <label htmlFor="onboard-welcome">{t('onboard.welcome')}</label>
            <input id="onboard-welcome" maxLength={300} placeholder={t('onboard.welcome.placeholder')} value={welcome} onChange={(e) => setWelcome(e.target.value)} />
          </div>
          <div className="field-row">
            <label htmlFor="onboard-uses">{t('onboard.uses')}</label>
            <select id="onboard-uses" value={uses} onChange={(e) => setUses(Number(e.target.value))}>
              {USES.map((n) => (
                <option key={n} value={n}>
                  {n ? t('onboard.uses.n', { n }) : t('onboard.uses.any')}
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
            <legend>{t('onboard.preview')}</legend>
            <div className="field-row">
              <input type="checkbox" id="onboard-preview" checked={preview} onChange={(e) => setPreview(e.target.checked)} />
              <label htmlFor="onboard-preview">{t('onboard.preview.on')}</label>
            </div>
            {preview && (
              <>
                <div className="field-row-stacked">
                  <label htmlFor="onboard-preview-text">{t('onboard.preview.text')}</label>
                  <input id="onboard-preview-text" maxLength={300} placeholder={t('onboard.preview.text.placeholder', { space: space.name })} value={previewText} onChange={(e) => setPreviewText(e.target.value)} />
                </div>
                <div className="field-row">
                  <label htmlFor="onboard-image">{t('onboard.preview.image')}</label>
                  <select id="onboard-image" value={image} onChange={(e) => setImage(e.target.value as typeof image)}>
                    <option value="banner">{t('onboard.image.banner')}</option>
                    <option value="icon">{t('onboard.image.icon')}</option>
                    <option value="none">{t('onboard.image.none')}</option>
                  </select>
                </div>
                <p className="small muted">{t('onboard.preview.open')}</p>
              </>
            )}
          </fieldset>
          <div className="buttons">
            <button onClick={onClose}>{t('button.cancel')}</button>
            <AsyncButton className="default" onClick={create}>
              {t('onboard.create')}
            </AsyncButton>
          </div>
        </>
      )}
      {mine.length > 0 && (
        <fieldset>
          <legend>{t('onboard.yours')}</legend>
          {mine.map((l) => (
            <div className="field-row" key={l.code}>
              <span className="grow">
                <code>{l.code}</code>{' '}
                <span className="small muted">
                  {l.revoked ? t('onboard.state.revoked') : l.used === undefined ? t('onboard.state.unknown') : l.uses ? t('onboard.state.used.of', { n: l.used, uses: l.uses }) : t('onboard.state.used', { n: l.used })}
                  {l.expires && !l.revoked ? ` · ${t('onboard.state.until', { date: new Date(l.expires).toLocaleDateString() })}` : ''}
                </span>
              </span>
              {!l.revoked && (
                <>
                  <button onClick={() => copy(l.link, t('copy.what.copied', { what: t('onboard.link') }))} title={t('button.copy')}>
                    <Icon name="copy" />
                  </button>
                  <AsyncButton onClick={() => revoke(l)}>{t('onboard.revoke')}</AsyncButton>
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
  if (!link) return null;
  const close = () => setLink(undefined);
  const follow = async () => {
    const done = await attempt(() => api<{ open?: SpaceInfo; welcome?: string }>('followOnboardLink', link));
    if (!done) return;
    bump();
    close();
    toast(done.welcome ? `${look?.by.name ?? ''}: ${done.welcome}` : t('onboard.joined', { title: look?.title ?? '' }));
    if (done.open) navigate(spaceHref(done.open));
  };
  const by = look?.by.name ?? look?.by.did.slice(0, 16) ?? '';
  const pending = look?.spaces.filter((s) => !s.member) ?? [];
  return (
    <Modal title={t('onboard.join.title')} onClose={close}>
      {error ? (
        <p>{t('inv.doesnt.work', { problem: error })}</p>
      ) : !look ? (
        <p>{t('inv.looking')}</p>
      ) : look.mine ? (
        <p>{t('onboard.join.mine')}</p>
      ) : (
        <>
          <p>{t('onboard.join.ask', { by, title: look.title })}</p>
          {look.welcome && <p className="small">“{look.welcome}”</p>}
          <p className="small muted">{pending.length ? t('onboard.join.spaces', { spaces: pending.map((s) => s.name).join(', '), by }) : t('onboard.join.in.already')}</p>
          <div className="buttons">
            <button onClick={close}>{t('inv.no')}</button>
            <AsyncButton className="default" onClick={follow}>
              {t('inv.yes.join')}
            </AsyncButton>
          </div>
        </>
      )}
    </Modal>
  );
}
