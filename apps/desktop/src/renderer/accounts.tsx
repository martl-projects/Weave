import { useState } from 'react';
import type { AccountInfo, AppOpen, PlatformInfo, Profile, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bridge, bump, navigate, onItem, useApi } from './lib.ts';
import { copy, spaceHref } from './posts.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';

/*
 * Accounts elsewhere (GitHub, X…): you say one is yours, with a proof that names your Weave id there, on your hub
 * (everyone sees it) or in a space (its members do, and its services may give you access by it). Weave knows no
 * platform: each has a verifier, a client app every Weave runs to check the proof itself.
 */

/** Proving an account elsewhere: the line its proof holds, made there by you, its address pasted here. */
export function AccountProofDialog({ space, platform: asked, onClose }: { space?: SpaceInfo; platform?: string; onClose(): void }) {
  const { data: platforms } = useApi(() => api<PlatformInfo[]>('platforms'), []);
  const [platform, setPlatform] = useState(asked ?? '');
  const chosen = platform || platforms?.[0]?.platform || '';
  const about = platforms?.find((p) => p.platform === chosen);
  const { data: proof } = useApi(() => (chosen ? api<{ text: string; howto?: string }>('accountProof', { platform: chosen }) : Promise.resolve(undefined)), [chosen]);
  const [handle, setHandle] = useState('');
  const [address, setAddress] = useState('');
  // By hand: making the proof there yourself. Otherwise, where its verifier can: one click.
  const [byHand, setByHand] = useState(false);
  const [signing, setSigning] = useState<{ code: string; url: string }>();
  const oneClick = !!about?.prove && !byHand;
  const proveWith = () =>
    attempt(async () => {
      const { id, url, code } = await api<{ id: string; url: string; code: string }>('startAccountProof', { platform: chosen, ...(space ? { space: space.id } : {}) });
      void navigator.clipboard?.writeText(code).catch(() => {});
      setSigning({ code, url });
      window.open(url, '_blank', 'noopener');
      try {
        const all = await api<AccountInfo[]>('finishAccountProof', { id });
        bump();
        onClose();
        return all;
      } finally {
        setSigning(undefined);
      }
    }, `Your ${about?.title ?? chosen} account is proven yours`);
  if (oneClick)
    return (
      <Modal title={space ? `Your account elsewhere, in ${space.name}` : 'Show an account elsewhere'} onClose={onClose}>
        <p className="small">{space ? 'Its members see it, and its services may give you access by it (a repository, say).' : 'Your hub shows it, with a check: anyone can see that its proof names you.'}</p>
        {signing ? (
          <div className="notice">
            Enter this code on{' '}
            <a href={signing.url} target="_blank" rel="noopener noreferrer">
              {new URL(signing.url).hostname}
            </a>{' '}
            (it's copied): <b className="user-code">{signing.code}</b>. Then {about?.title ?? chosen} makes the proof, a secret note naming you, and Weave forgets the sign-in. Only ever enter a code Weave shows you, here.
          </div>
        ) : (
          <p className="small muted">You allow it once on {about?.title ?? chosen}: it makes a proof naming you there (on GitHub, a secret gist), and Weave forgets the sign-in right away. Delete the proof there, and the account is no longer yours here.</p>
        )}
        <div className="buttons">
          <button type="button" onClick={() => setByHand(true)}>
            Make the proof myself…
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <AsyncButton className="default" disabled={!!signing} onClick={proveWith}>
            Prove with {about?.title ?? chosen}…
          </AsyncButton>
        </div>
      </Modal>
    );
  return (
    <Modal title={space ? `Your account elsewhere, in ${space.name}` : 'Show an account elsewhere'} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const done = await attempt(() => api('linkAccount', { platform: chosen, handle, proof: address, ...(space ? { space: space.id } : {}) }).then(() => (bump(), true)), `${handle} on ${about?.title ?? chosen} is proven yours`);
          if (done !== undefined) onClose();
        }}
      >
        <p className="small">{space ? `Its members see it, and its services may give you access by it (a repository, say).` : 'Your hub shows it, with a check: anyone can see that its proof names you.'}</p>
        {platforms && platforms.length === 0 && <p className="small">This Weave checks accounts on no platform yet.</p>}
        {!asked && platforms && platforms.length > 1 && (
          <div className="field-row-stacked">
            <label htmlFor="account-platform">Where</label>
            <select id="account-platform" value={chosen} onChange={(e) => setPlatform(e.target.value)}>
              {platforms.map((p) => (
                <option key={p.platform} value={p.platform}>
                  {p.title}
                </option>
              ))}
            </select>
          </div>
        )}
        <div className="field-row-stacked">
          <label htmlFor="account-handle">Your account on {about?.title ?? chosen}</label>
          <input id="account-handle" required autoFocus value={handle} onChange={(e) => setHandle(e.target.value.trim())} />
        </div>
        {proof && (
          <ol className="steps small">
            <li>
              {proof.howto ?? 'Make a proof there, as that account, holding this line:'}
              <div className="user-code sunken small" title="Click to copy" onClick={() => copy(proof.text, 'Copied')}>
                {proof.text}
              </div>
            </li>
            <li>Paste its address here:</li>
          </ol>
        )}
        <div className="field-row-stacked">
          <label htmlFor="account-proof">Its proof</label>
          <input id="account-proof" required value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <p className="small muted">Weave checks it now, and everyone's Weave checks it again. Delete the proof there, and the account is no longer yours here.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!chosen || !handle || !address}>
            Prove it
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** In Keys & devices: the accounts elsewhere your hub shows, proven. */
export function LinkedAccountsBox() {
  const { data: me } = useApi(() => api<Profile>('profile'), []);
  const [adding, setAdding] = useState(false);
  return (
    <fieldset>
      <legend>Accounts elsewhere</legend>
      {(me?.accounts ?? []).map((a) => (
        <div className="field-row" key={a.platform}>
          <Icon name="externalLink" />
          <span className="grow">
            <b>{a.platform}</b>{' '}
            <span className="small">
              {a.url ? (
                <a href={a.url} target="_blank" rel="noopener noreferrer">
                  {a.handle}
                </a>
              ) : (
                a.handle
              )}
              {a.verified ? ' ✓' : " (couldn't be checked yet)"}
            </span>
          </span>
          <AsyncButton onClick={() => attempt(() => api('linkAccount', { platform: a.platform, on: false }).then(bump), `Your hub no longer shows ${a.handle}`)}>Stop showing</AsyncButton>
        </div>
      ))}
      <div className="field-row">
        <span className="grow small">Your hub can show your accounts on other platforms, proven: each with a check anyone's Weave makes itself. Nobody signs in anywhere.</span>
        <button onClick={() => setAdding(true)}>Show an account…</button>
      </div>
      {adding && <AccountProofDialog onClose={() => setAdding(false)} />}
    </fieldset>
  );
}

/** Under a hub's name: the accounts elsewhere they show, each opening its page; ✓ when its proof holds. */
export function HubAccounts({ profile }: { profile: Profile }) {
  if (!profile.accounts?.length) return null;
  return (
    <>
      {profile.accounts.map((a) => (
        <a key={a.platform} className="hub-github" href={a.url} target="_blank" rel="noopener noreferrer" title={a.verified ? `A proof on ${a.platform} names this identity` : `Not checked: ${a.platform} couldn't be reached`}>
          <Icon name={a.platform === 'github' ? 'github' : 'externalLink'} /> {a.handle}
          {a.verified && ' ✓'}
        </a>
      ))}
    </>
  );
}

/** The accounts elsewhere said in a space, for a list of its people: handle ✓ next to a name. */
export function useSpaceAccounts(space: string | undefined): Map<string, AccountInfo[]> {
  const { data } = useApi(() => (space ? api<AccountInfo[]>('accounts', { space }).catch(() => [] as AccountInfo[]) : Promise.resolve([] as AccountInfo[])), [space]);
  const byWho = new Map<string, AccountInfo[]>();
  for (const a of data ?? []) if (a.verified) byWho.set(a.who.did, [...(byWho.get(a.who.did) ?? []), a]);
  return byWho;
}

// ---------------------------------------------------------------- agents opening the app for their person

let opening = false;

/** Agents can bring the app to the front, at a space, a post, a person or the Inbox (weave_open_in_app). Once per app. */
export function startAppOpens(): void {
  if (opening) return;
  opening = true;
  onItem((item) => {
    if (item.kind !== 'weave.open') return;
    const open = item.body as unknown as AppOpen;
    void bridge.show();
    // A post (Open in Weave on its page): PublicPost takes it to where it lives.
    if (open.what === 'post' && open.post) return navigate(`#/post/${open.post.id}`);
    if (open.what === 'person' && open.person) return navigate(`#/space/${open.person.did}`);
    if (open.what === 'inbox' || !open.space) return navigate('#/inbox');
    navigate(spaceHref(open.space));
  });
}
