import { useEffect, useState, type ReactNode } from 'react';
import QRCode from 'qrcode';
import { Icon } from './icons.tsx';
import { ago, api, bridge, bump, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal, WeaveMark } from './ui.tsx';

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
    <Modal title="Add a phone" onClose={onClose}>
      {error ? (
        <p>{error}</p>
      ) : paired ? (
        <p>
          <Icon name="info" /> <b>{paired}</b> is paired. It uses Weave through this computer whenever both are online.
        </p>
      ) : !offer ? (
        <p className="small">Making a pairing code…</p>
      ) : (
        <div className="pair-phone">
          <div className="qr" dangerouslySetInnerHTML={{ __html: offer.svg }} />
          <div>
            <ol className="steps">
              <li>Open Weave on your phone.</li>
              <li>Choose “Pair with my computer” and scan this code.</li>
            </ol>
            <p className="small">
              The code works once, for {left} more minute{left === 1 ? '' : 's'}. Whoever scans it can use your Weave as you, so show it only to your own phone.
            </p>
          </div>
        </div>
      )}
      <div className="buttons">
        <button className="default" onClick={onClose}>
          {paired ? 'Done' : 'Close'}
        </button>
      </div>
    </Modal>
  );
}

/** In Keys & devices: phones paired with this computer. */
export function PhonesBox() {
  const { data: phones } = useApi(() => api<Phone[]>('phones'), []);
  const [pairing, setPairing] = useState(false);
  return (
    <fieldset>
      <legend>Phones</legend>
      {(phones ?? []).map((p) => (
        <div className="field-row" key={p.key}>
          <Icon name="user" />
          <span className="grow">
            <b>{p.name}</b> <span className="small muted">paired {ago(p.paired)}</span> {p.lastSeen && <span className="tag friend">connected</span>}
          </span>
          <AsyncButton onClick={async () => (await ask(`Unpair ${p.name}? It's cut off at once and needs a new code to come back.`, 'Unpair')) && attempt(() => api('unpairPhone', p.key).then(bump), `${p.name} is unpaired`)}>
            Unpair
          </AsyncButton>
        </div>
      ))}
      {phones?.length === 0 && <p className="small">No phone paired yet.</p>}
      <p className="small">A paired phone uses Weave through this computer, end-to-end encrypted, with no server in between. It works while this computer runs Weave.</p>
      <div className="buttons">
        <button onClick={() => setPairing(true)}>Add a phone…</button>
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
  const phone = bridge.phone!;
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const pair = async (link: string) => {
    setBusy(true);
    const ok = await attempt(() => phone.pair(link).then(() => true), 'Paired with your computer');
    setBusy(false);
    if (ok) onDone();
  };
  const scan = async () => {
    const link = await attempt(() => phone.scan());
    if (link) await pair(link);
  };
  return (
    <PhoneWindow title="Pair with your computer">
      <div className="welcome-head">
        <WeaveMark size={48} />
        <p>This app uses Weave on your computer: your hub, your keys and your friends stay there. The two talk end-to-end encrypted, with no server in between.</p>
      </div>
      <ol className="steps">
        <li>
          On your computer, open Weave, then <b>Keys &amp; devices</b> and <b>Add a phone…</b>
        </li>
        <li>Scan the code it shows.</li>
      </ol>
      {busy ? (
        <p className="small">Connecting to your computer…</p>
      ) : (
        <>
          <div className="buttons">
            <button className="default" onClick={scan}>
              Scan the code
            </button>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void pair(code);
            }}
          >
            <div className="field-row-stacked">
              <label htmlFor="pair-code">Or paste the code (weave:phone:…)</label>
              <input id="pair-code" required spellCheck={false} autoCapitalize="off" autoCorrect="off" value={code} onChange={(e) => setCode(e.target.value)} />
            </div>
            <div className="buttons">
              <button disabled={!code.trim()}>Pair</button>
            </div>
          </form>
        </>
      )}
    </PhoneWindow>
  );
}

/** While the phone looks for its computer at start (up to some seconds over the DHT). */
export function PhoneConnecting() {
  return (
    <PhoneWindow title="Weave">
      <p className="small">Connecting to your computer…</p>
    </PhoneWindow>
  );
}

/** The phone can't reach its computer right now. */
export function PhoneNotConnected({ name, onRetry }: { name?: string; onRetry(): void }) {
  const forget = async () => {
    if (!(await ask("Forget your computer on this phone? You'll need a new code from it to pair again. Unpair this phone on the computer too, under Keys & devices.", 'Forget'))) return;
    if (await attempt(() => bridge.phone!.forget().then(() => true))) onRetry();
  };
  return (
    <PhoneWindow title="Weave">
      <p>
        <Icon name="info" /> Can't reach {name ? `${name}'s computer` : 'your computer'}. This app works through Weave on it, so Weave has to be running there, and both need to be online.
      </p>
      <div className="buttons">
        <button onClick={forget}>Pair again…</button>
        <button className="default" onClick={onRetry}>
          Try again
        </button>
      </div>
    </PhoneWindow>
  );
}
