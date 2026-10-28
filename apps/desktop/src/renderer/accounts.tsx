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
