import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal, WeaveMark } from './ui.tsx';
import { T, useTexts } from './texts.tsx';

/*
 * Phones that use this computer's Weave remotely: the companion app scans a
 * QR code shown here and from then on connects to this node over an
 * encrypted connection (no server). The node signs what the phone posts.
 * Unpairing cuts a phone off at once.
 */

interface Phone {
  key: string;
  name: string;
  paired: string;
  lastSeen?: string;
}

function PairDialog({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const [offer, setOffer] = useState<{ link: string; expires: string; svg: string }>();
  const [error, setError] = useState<string>();
  const [before] = useState(() => api<Phone[]>('phones').then((list) => list.length));
  const [paired, setPaired] = useState<string>();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let alive = true;
    api<{ link: string; expires: string }>('pairPhone').then(
      async (o) => alive && setOffer({ ...o, svg: await QRCode.toString(o.link, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }) }),
      (e: Error) => alive && setError(e.message),
    );
    return () => {
      alive = false;
    };
  }, []);

  // Pairing happens on the phone's side; look for it every two seconds.
  useEffect(() => {
    if (!offer || paired) return;
    const timer = setInterval(async () => {
      setNow(Date.now());
      const list = await api<Phone[]>('phones').catch(() => []);
      if (list.length > (await before)) {
        setPaired(list[list.length - 1].name);
        bump();
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [offer, paired, before]);

  const left = offer ? Math.max(0, Math.round((Date.parse(offer.expires) - now) / 60_000)) : 0;
  return (
    <Modal title={t('phone.add.title')} onClose={onClose}>
      {error ? (
        <p>{error}</p>
      ) : paired ? (
        <p>
          <Icon name="info" /> <T name="phone.paired" values={{ name: <b>{paired}</b> }} />
        </p>
      ) : !offer ? (
        <p className="small">{t('phone.making.code')}</p>
      ) : (
        <div className="pair-phone">
          <div className="qr" dangerouslySetInnerHTML={{ __html: offer.svg }} />
          <div>
            <ol className="steps">
              <li>{t('phone.step.open')}</li>
              <li>{t('phone.step.scan')}</li>
            </ol>
            <p className="small">{t('phone.code.works', { n: left })}</p>
          </div>
        </div>
      )}
      <div className="buttons">
        <button className="default" onClick={onClose}>
          {t(paired ? 'button.done' : 'button.close')}
        </button>
      </div>
    </Modal>
  );
}

/** In Keys & devices: phones paired with this computer. */
export function PhonesBox() {
  const { t } = useTexts();
  const { data: phones } = useApi(() => api<Phone[]>('phones'), []);
  const [pairing, setPairing] = useState(false);
  return (
    <fieldset>
      <legend>{t('phones.legend')}</legend>
      {(phones ?? []).map((p) => (
        <div className="field-row" key={p.key}>
          <Icon name="user" />
          <span className="grow">
            <b>{p.name}</b> <span className="small muted">{t('phone.paired.ago', { time: p.paired })}</span> {p.lastSeen && <span className="tag friend">{t('phone.connected')}</span>}
          </span>
          <AsyncButton onClick={async () => (await ask(t('phone.unpair.ask', { name: p.name }), t('phone.unpair'))) && attempt(() => api('unpairPhone', p.key).then(bump), t('phone.unpaired', { name: p.name }))}>
            {t('phone.unpair')}
          </AsyncButton>
        </div>
      ))}
      {phones?.length === 0 && <p className="small">{t('phones.none')}</p>}
      <p className="small">{t('phones.about')}</p>
      <div className="buttons">
        <button onClick={() => setPairing(true)}>{t('phone.add')}</button>
      </div>
      {pairing && (
        <PairDialog
          onClose={() => {
            setPairing(false);
            bump();
          }}
        />
      )}
    </fieldset>
  );
}

/** The phone app's own window, like the first-start one: centered, with a title bar. */
function PhoneWindow({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="desktop">
      <div className="window welcome">
        <div className="title-bar">
          <div className="title-bar-text">{title}</div>
        </div>
        <div className="window-body">{children}</div>
      </div>
    </div>
  );
}

/** First start on the phone: pair with your computer by scanning its code (or pasting it). */
export function PhonePairing({ onDone }: { onDone(): void }) {
  const { t } = useTexts();
  const phone = bridge.phone!;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const pair = async (link: string) => {
    setBusy(true);
    const ok = await attempt(() => phone.pair(link).then(() => true), t('phone.paired.computer'));
    setBusy(false);
    if (ok) onDone();
  };
  const scan = async () => {
    const link = await attempt(() => phone.scan());
    if (link) await pair(link);
  };
  return (
    <PhoneWindow title={t('phone.pair.title')}>
      <div className="welcome-head">
        <WeaveMark size={48} />
        <p>{t('phone.pair.intro')}</p>
      </div>
      <ol className="steps">
        <li>
          <T name="phone.pair.step.computer" />
        </li>
        <li>{t('phone.pair.step.scan')}</li>
      </ol>
      {busy ? (
        <p className="small">{t('phone.connecting')}</p>
      ) : (
        <>
          <div className="buttons">
            <button className="default" onClick={scan}>
              {t('phone.scan')}
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pair(code);
            }}
          >
            <div className="field-row-stacked">
              <label htmlFor="pair-code">{t('phone.paste.code')}</label>
              <input id="pair-code" required spellCheck={false} autoCapitalize="off" autoCorrect="off" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="buttons">
              <button disabled={!code.trim()}>{t('phone.pair')}</button>
            </div>
          </form>
        </>
      )}
    </PhoneWindow>
  );
}

/** While the phone looks for its computer at start (up to some seconds over the DHT). */
export function PhoneConnecting() {
  const { t } = useTexts();
  return (
    <PhoneWindow title="Weave">
      <p className="small">{t('phone.connecting')}</p>
    </PhoneWindow>
  );
}

/** The phone can't reach its computer right now. */
export function PhoneNotConnected({ name, onRetry }: { name?: string; onRetry(): void }) {
  const { t } = useTexts();
  const forget = async () => {
    if (!(await ask(t('phone.forget.ask'), t('phone.forget')))) return;
    if (await attempt(() => bridge.phone!.forget().then(() => true))) onRetry();
  };
  return (
    <PhoneWindow title="Weave">
      <p>
        <Icon name="info" /> {t('phone.cant.reach', { computer: name ? t('phone.their.computer', { name }) : t('phone.your.computer') })}
      </p>
      <div className="buttons">
        <button onClick={forget}>{t('phone.pair.again')}</button>
        <button className="default" onClick={onRetry}>
          {t('button.try.again')}
        </button>
      </div>
    </PhoneWindow>
  );
}
