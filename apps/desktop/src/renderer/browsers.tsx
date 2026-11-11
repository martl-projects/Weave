import { useState } from 'react';
import QRCode from 'qrcode';
import type { KeyInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bump } from './lib.ts';
import { ask, attempt, AsyncButton, Info } from './ui.tsx';
import { useTexts } from './texts.tsx';

/** Weave Web, where a linked browser gets its handover (the storage node next to the page). */
const WEB = 'https://web.martl.io';

/**
 * Browsers linked to this person (docs/web-stage2.md): each gets a key of its own from this computer, without the
 * recovery words, through a link shown as a QR code. Revoked here like an always-on node.
 */
export function LinkedBrowsers({ keys }: { keys: KeyInfo[] }) {
  const { t } = useTexts();
  // A link that never reached its storage node was revoked at once, having signed nothing: not worth a line.
  const browsers = keys.filter((k) => k.name?.startsWith('browser:') && !(k.revokedAfter !== undefined && k.events === 0));
  const [name, setName] = useState('');
  const [made, setMade] = useState<{ link: string; name: string; svg: string }>();
  return (
    <fieldset>
      <legend>{t('browsers.legend')}</legend>
      {browsers.map((b) => (
        <div className="field-row" key={b.did}>
          <Icon name="externalLink" />
          <span className="grow">
            <b>{b.name!.slice('browser:'.length)}</b>{' '}
            <span className="small muted">
              {b.revokedAfter !== undefined ? t('key.revoked') : b.lastTime ? t('node.last.heard', { time: b.lastTime }) : t('node.not.heard')} · {t('key.events', { n: b.events })}
            </span>
          </span>
          {b.revokedAfter === undefined && (
            <AsyncButton onClick={async () => (await ask(t('browser.revoke.ask', { name: b.name!.slice('browser:'.length) }), t('button.revoke'))) && attempt(() => api('revokeKey', { key: b.did }).then(bump), t('key.revoked.done'))}>
              {t('button.revoke')}
            </AsyncButton>
          )}
        </div>
      ))}
      <p className="small">
        {t('browsers.about')} <Info>{t('browsers.about.more')}</Info>
      </p>
      {made ? (
        <div className="field-row-stacked">
          <p className="small">{t('browser.scan')}</p>
          <div className="qr" style={{ maxWidth: 220 }} dangerouslySetInnerHTML={{ __html: made.svg }} />
          <input className="wide" readOnly value={made.link} onFocus={(e) => e.currentTarget.select()} />
          <p className="small muted">{t('browser.once')}</p>
          <div className="buttons">
            <button onClick={() => void navigator.clipboard.writeText(made.link)}>{t('button.copy')}</button>
            <button onClick={() => setMade(undefined)}>{t('button.done')}</button>
          </div>
        </div>
      ) : (
        <div className="field-row">
          <input className="grow" placeholder={t('browser.name.placeholder')} value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
          <AsyncButton
            onClick={async () => {
              const linked = await attempt(() => api<{ link: string; name: string }>('linkBrowser', { url: WEB, name }));
              if (!linked) return;
              const svg = await QRCode.toString(linked.link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } });
              setMade({ ...linked, svg });
              setName('');
              bump();
            }}
          >
            {t('browser.link')}
          </AsyncButton>
        </div>
      )}
    </fieldset>
  );
}
