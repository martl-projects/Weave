import { useEffect, useRef, useState } from 'react';
import type { WalletInfo } from '@weave/node/client';
import { TREASURY_CHAIN } from '@weave/core/chain';
import { Icon } from './icons.tsx';
import { api, bump, useApi } from './lib.ts';
import { copy } from './posts.tsx';
import { attempt, AsyncButton, toast } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * Your wallet: the address you pay from and get paid to, linked to your Weave
 * identity by the wallet's own signature, so nobody can claim an address they
 * don't hold. Weave never sees its key. A smart wallet (a Safe, a Coinbase
 * Smart Wallet) has no key of its own: its contract confirms the signature on
 * chain (EIP-1271), and every Weave that reads the link asks the chain itself.
 */

type Ethereum = { request(args: { method: string; params?: unknown[] }): Promise<unknown> };
const browserWallet = (): Ethereum | undefined => (window as unknown as { ethereum?: Ethereum }).ethereum;
const hexOf = (text: string) => '0x' + [...new TextEncoder().encode(text)].map((b) => b.toString(16).padStart(2, '0')).join('');

/** Link (or change) your wallet: with the wallet in this browser in one go, or by signing the message elsewhere and pasting the signature. */
export function WalletLink({ intro }: { intro?: string }) {
  const { t } = useTexts();
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [proof, setProof] = useState('');
  const wallet = browserWallet();
  const link = (a: string, p: string) => attempt(() => api('linkWallet', { address: a, proof: p }).then(bump), t('wallet.linked'));
  return (
    <>
      {intro && <p className="small">{intro}</p>}
      {wallet && (
        <div className="field-row">
          <AsyncButton
            className="default"
            onClick={async () => {
              try {
                const [account] = (await wallet.request({ method: 'eth_requestAccounts' })) as string[];
                const text = await api<string>('walletMessage', account);
                // personal_sign: the wallet shows the text and signs it; a smart wallet's signature is checked on chain.
                const signature = (await wallet.request({ method: 'personal_sign', params: [hexOf(text), account] })) as string;
                await link(account, signature);
              } catch (e) {
                toast((e as Error).message, 'error');
              }
            }}
          >
            {t('wallet.link.browser')}
          </AsyncButton>
          <span className="small grow">{t('wallet.link.browser.note')}</span>
        </div>
      )}
      <details className="small" open={!wallet}>
        <summary>{t(wallet ? 'wallet.link.another.by.hand' : 'wallet.link.by.hand')}</summary>
        <div className="field-row">
          <input className="grow" spellCheck={false} placeholder={t('wallet.address.placeholder')} value={address} onChange={(e) => setAddress(e.target.value.trim())} aria-label={t('wallet.address')} />
          <AsyncButton onClick={async () => setMessage((await attempt(() => api<string>('walletMessage', address))) ?? '')}>{t('button.next')}</AsyncButton>
        </div>
        {message && (
          <>
            <p>{t('wallet.sign.text')}</p>
            <div className="field-row">
              <code className="grow sunken" style={{ padding: 4, wordBreak: 'break-all' }}>
                {message}
              </code>
              <button onClick={() => copy(message, t('wallet.text.copied'))}>{t('button.copy')}</button>
            </div>
            <div className="field-row">
              <input className="grow" spellCheck={false} placeholder={t('wallet.signature.placeholder')} value={proof} onChange={(e) => setProof(e.target.value.trim())} aria-label={t('wallet.signature')} />
              <AsyncButton className="default" onClick={() => link(address, proof)}>
                {t('wallet.link')}
              </AsyncButton>
            </div>
          </>
        )}
      </details>
    </>
  );
}

/** Where your wallet is linked: elsewhere, a link there instead of asking for an address. */
export const WALLET_HREF = '#/keys/wallet';

/** Said where a wallet is needed and none is linked: what for, and the way to Keys & devices. */
export function WalletNeeded({ why }: { why: string }) {
  const { t } = useTexts();
  return (
    <p className="small">
      {why}{' '}
      <a href={WALLET_HREF}>
        <Icon name="lock" /> {t('wallet.link.in.keys')}
      </a>
    </p>
  );
}

/** In Keys & devices: your wallet. */
export function WalletBox() {
  const { t } = useTexts();
  // null: no wallet linked; undefined: still asking.
  const { data: wallet } = useApi(() => api<WalletInfo | undefined>('wallet').then((w) => w ?? null), []);
  const [changing, setChanging] = useState(false);
  const box = useRef<HTMLFieldSetElement>(null);
  // Sent here to link one (WALLET_HREF): bring it into view.
  const loaded = wallet !== undefined;
  useEffect(() => {
    if (loaded && location.hash === WALLET_HREF) box.current?.scrollIntoView({ block: 'start', behavior: 'smooth' });
  }, [loaded]);
  if (wallet === undefined) return null;
  return (
    <fieldset id="wallet" ref={box}>
      <legend>{t('wallet.legend')}</legend>
      {wallet ? (
        <>
          <div className="field-row">
            <Icon name="user" />
            <code className="grow">{wallet.address}</code>
            {wallet.contract && <span className="tag">{t('wallet.smart')}</span>}
            <span className="tag">{t(wallet.verified ? 'wallet.verified' : 'wallet.not.verified')}</span>
            <button onClick={() => copy(wallet.address, t('address.copied'))}>{t('button.copy')}</button>
          </div>
          <p className="small">{t('wallet.linked.about', { chain: TREASURY_CHAIN.name })}</p>
          <div className="buttons">
            <AsyncButton onClick={() => attempt(() => api('linkWallet', { address: '' }).then(bump), t('wallet.unlinked'))}>{t('wallet.unlink')}</AsyncButton>
            <button onClick={() => setChanging((c) => !c)}>{t(changing ? 'wallet.keep.this' : 'wallet.change')}</button>
          </div>
          {changing && <WalletLink />}
        </>
      ) : (
        <WalletLink intro={t('wallet.intro')} />
      )}
    </fieldset>
  );
}
