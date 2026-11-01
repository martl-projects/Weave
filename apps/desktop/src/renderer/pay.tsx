import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import type { PaymentRequestInfo } from '@weave/node/client';
import { formatUnits, isTxHash, TREASURY_CHAIN } from '@weave/core/chain';
import { api, bump } from './lib.ts';
import { copy } from './posts.tsx';
import { attempt, AsyncButton, toast } from './ui.tsx';
import { T, useTexts } from './texts.tsx';

/*
 * Paying a tier or a show from a wallet without copying anything: a phone
 * wallet scans the QR code (an EIP-681 link), a wallet in the browser gets the
 * transaction; meanwhile Weave looks for the payment on chain and, once it's
 * there, sends it on by itself. Pasting the transaction's hash still works.
 */

type Ethereum = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const browserWallet = (): Ethereum | undefined => (window as unknown as { ethereum?: Ethereum }).ethereum;

export function PayFromWallet({ tier, creator, show, payee, onDone }: { tier?: string; creator?: string; show?: string; payee: string; onDone(): void }) {
  const { t } = useTexts();
  const [request, setRequest] = useState<PaymentRequestInfo>();
  const [error, setError] = useState('');
  const [svg, setSvg] = useState('');
  const [hash, setHash] = useState('');
  const target = { ...(tier ? { tier } : { show }), ...(creator ? { creator } : {}) };

  useEffect(() => {
    let alive = true;
    api<PaymentRequestInfo>('paymentRequest', target).then(
      async (r) => {
        if (!alive) return;
        setRequest(r);
        setSvg(await QRCode.toString(r.uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } }));
      },
      (e: Error) => alive && setError(e.message),
    );
    return () => void (alive = false);
  }, [tier, show]);

  // Look for the payment on chain every few seconds, from where the last look ended.
  useEffect(() => {
    if (!request) return;
    let since = request.since;
    let stopped = false;
    const look = async () => {
      if (stopped) return;
      try {
        const answer = await api<{ found?: string; checkedTo: number }>('findPayment', { ...target, since });
        if (answer.found) {
          stopped = true;
          bump();
          toast(t('pay.found', { payee }));
          return onDone();
        }
        since = answer.checkedTo + 1;
      } catch {
        // the chain's node didn't answer: look again next round
      }
      if (!stopped) timer = setTimeout(look, 5000);
    };
    let timer = setTimeout(look, 5000);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [request]);

  const send = (payment: string) => attempt(() => api(tier ? 'requestMembership' : 'buyTicket', tier ? { ...target, payment } : { show, ...(creator ? { host: creator } : {}), payment }).then(bump), t('pay.sent', { payee })).then((sent) => sent !== undefined && onDone());

  if (error) return <p className="small">{error}</p>;
  if (!request) return <p className="small">{t('pay.preparing')}</p>;
  const amount = `${formatUnits(request.amount, request.decimals)} ${request.symbol}`;
  const wallet = browserWallet();
  return (
    <div>
      <p>
        <T name="pay.intro" values={{ amount: <b>{amount}</b>, what: request.what, from: <code>{request.from}</code>, chain: TREASURY_CHAIN.name }} />
      </p>
      <div className="field-row" style={{ alignItems: 'flex-start' }}>
        <div className="qr" style={{ width: 168 }} dangerouslySetInnerHTML={{ __html: svg }} />
        <div className="grow small">
          <p>{t('pay.scan')}</p>
          {wallet && (
            <AsyncButton
              className="default"
              onClick={async () => {
                try {
                  await wallet.request({ method: 'eth_requestAccounts' });
                  await wallet.request({ method: 'wallet_switchEthereumChain', params: [{ chainId: request.tx.chainId }] });
                  const sent = (await wallet.request({ method: 'eth_sendTransaction', params: [request.tx] })) as string;
                  await send(sent);
                } catch (e) {
                  toast((e as Error).message, 'error');
                }
              }}
            >
              {t('pay.with.browser.wallet')}
            </AsyncButton>
          )}
          <p className="muted">{t('pay.watching')}</p>
        </div>
      </div>
      <details className="small">
        <summary>{t('pay.another.way')}</summary>
        <div className="field-row">
          <span className="grow">
            <T name="pay.send.to" values={{ amount, to: <code>{request.to}</code> }} />
          </span>
          <button onClick={() => copy(request.to, t('address.copied'))}>{t('button.copy')}</button>
        </div>
        <div className="field-row">
          <input className="grow" spellCheck={false} placeholder={t('pay.hash.placeholder')} value={hash} onChange={(e) => setHash(e.target.value.trim())} aria-label={t('pay.hash')} />
          <AsyncButton onClick={() => (isTxHash(hash) ? send(hash) : Promise.resolve())}>{t('button.send')}</AsyncButton>
        </div>
      </details>
    </div>
  );
}
