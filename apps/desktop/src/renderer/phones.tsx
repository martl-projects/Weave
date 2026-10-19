import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { Icon } from './icons.tsx';
import { ago, api, bump, useApi } from './lib.ts';
import { ask, attempt, AsyncButton, Modal } from './ui.tsx';

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
