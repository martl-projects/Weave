import { useEffect, useRef, useState } from 'react';
import type { WalletInfo } from '@weave/node/client';
import { TREASURY_CHAIN } from '@weave/core/chain';
import { Icon } from './icons.tsx';
import { api, bump, useApi } from './lib.ts';
import { copy } from './posts.tsx';
import { attempt, AsyncButton, toast } from './ui.tsx';

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
  const [address, setAddress] = useState('');
  const [message, setMessage] = useState('');
  const [proof, setProof] = useState('');
  const wallet = browserWallet();
  const link = (a: string, p: string) => attempt(() => api('linkWallet', { address: a, proof: p }).then(bump), 'Wallet linked');
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
            Link the wallet in this browser…
          </AsyncButton>
          <span className="small grow">It asks your wallet to sign a short text saying the wallet is yours. No transaction, no cost.</span>
        </div>
      )}
      <details className="small" open={!wallet}>
        <summary>{wallet ? 'Or link another wallet by hand' : 'Link a wallet by hand'}</summary>
        <div className="field-row">
          <input className="grow" spellCheck={false} placeholder="0x… your wallet address" value={address} onChange={(e) => setAddress(e.target.value.trim())} aria-label="Wallet address" />
          <AsyncButton onClick={async () => setMessage((await attempt(() => api<string>('walletMessage', address))) ?? '')}>Next</AsyncButton>
        </div>
        {message && (
          <>
            <p>Sign this text with that wallet (“Sign message”, personal_sign), then paste the signature:</p>
            <div className="field-row">
              <code className="grow sunken" style={{ padding: 4, wordBreak: 'break-all' }}>
                {message}
              </code>
              <button onClick={() => copy(message, 'Text copied')}>Copy</button>
            </div>
            <div className="field-row">
              <input className="grow" spellCheck={false} placeholder="0x… signature" value={proof} onChange={(e) => setProof(e.target.value.trim())} aria-label="Signature" />
              <AsyncButton className="default" onClick={() => link(address, proof)}>
                Link wallet
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
  return (
    <p className="small">
      {why}{' '}
      <a href={WALLET_HREF}>
        <Icon name="lock" /> Link your wallet in Keys &amp; devices
      </a>
    </p>
  );
}

/** In Keys & devices: your wallet. */
export function WalletBox() {
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
      <legend>Wallet</legend>
      {wallet ? (
        <>
          <div className="field-row">
            <Icon name="user" />
            <code className="grow">{wallet.address}</code>
            {wallet.contract && <span className="tag">smart wallet</span>}
            <span className="tag">{wallet.verified ? 'verified' : 'not verified yet'}</span>
            <button onClick={() => copy(wallet.address, 'Address copied')}>Copy</button>
          </div>
          <p className="small">
            Linked to your identity: you pay tiers and tickets from it, and it owns your share of treasuries and shows' Safes. On {TREASURY_CHAIN.name}, a test network, for now.
            Changing it retires this address: whoever pays it is told to pay the new one.
          </p>
          <div className="buttons">
            <AsyncButton onClick={() => attempt(() => api('linkWallet', { address: '' }).then(bump), 'Wallet unlinked')}>Unlink</AsyncButton>
            <button onClick={() => setChanging((c) => !c)}>{changing ? 'Keep this one' : 'Change wallet…'}</button>
          </div>
          {changing && <WalletLink />}
        </>
      ) : (
        <WalletLink intro="Link a wallet to pay tiers and tickets from it, and to own treasuries with others. Weave never sees its key. Best use an address just for Weave: everything on chain is public. A Safe or a Coinbase Smart Wallet works too." />
      )}
    </fieldset>
  );
}
