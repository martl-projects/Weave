import { useState } from 'react';
import type { AccountInfo, AppOpen, MyAccountInfo, PlatformInfo, Profile, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bridge, bump, navigate, onItem, useApi } from './lib.ts';
import { copy, spaceHref } from './posts.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';

/*
 * Accounts elsewhere (GitHub, X…): you prove one is yours once, with a proof that names your Weave id there, and say
 * where it shows: on your hub (everyone sees it), in projects (their members do, and their services may give you
 * access by it). Weave knows no platform: each has a verifier, a client app every Weave runs to check the proof itself.
 */

/** Where an account can show besides your hub: the projects and groups you're in. */
function usePlaces(): SpaceInfo[] {
  const { data } = useApi(() => api<SpaceInfo[]>('spaces').catch(() => [] as SpaceInfo[]), []);
  return (data ?? []).filter((s) => s.kind === 'project' || s.kind === 'group');
}
const placeName = (s: { kind: string; name: string }) => (s.kind === 'project' ? `p/${s.name}` : s.name);

/** Show an account you proved in one more place (its proof, checked again), or take it from there. */
const showIn = (a: { platform: string; handle: string; proof: string }, space: string | undefined, on: boolean) =>
  api('linkAccount', on ? { platform: a.platform, handle: a.handle, proof: a.proof, ...(space ? { space } : {}) } : { platform: a.platform, on: false, ...(space ? { space } : {}) });

/**
 * Proving an account elsewhere, once: with one click where its verifier makes the proof (a sign-in with a code), or by
 * hand (a proof you make there, its address pasted here); then where it shows. Asked from a project (its service
 * wants it): shown there, and if you proved it already, that's all it takes.
 */
export function AccountProofDialog({ space, platform: asked, onClose }: { space?: SpaceInfo; platform?: string; onClose(): void }) {
  const { data: platforms } = useApi(() => api<PlatformInfo[]>('platforms'), []);
  const { data: mine } = useApi(() => api<MyAccountInfo[]>('myAccounts').catch(() => [] as MyAccountInfo[]), []);
  const places = usePlaces();
  const [platform, setPlatform] = useState(asked ?? '');
  const chosen = platform || platforms?.[0]?.platform || '';
  const about = platforms?.find((p) => p.platform === chosen);
  const title = about?.title ?? chosen;
  const { data: proof } = useApi(() => (chosen ? api<{ text: string; howto?: string }>('accountProof', { platform: chosen }) : Promise.resolve(undefined)), [chosen]);
  const [handle, setHandle] = useState('');
  const [address, setAddress] = useState('');
  // Where it shows: the project asking, or what you tick (your hub to begin with).
  const [hub, setHub] = useState(!space);
  const [spaces, setSpaces] = useState<string[]>(space ? [space.id] : []);
  const [byHand, setByHand] = useState(false);
  const [signing, setSigning] = useState<{ code: string; url: string }>();
  const proven = mine?.find((a) => a.platform === chosen && a.verified !== false);
  const nowhere = !hub && !spaces.length;
  // Made where it shows first (a project, or your hub), then shown in the others.
  const first = spaces[0];
  const showRest = async (a: { platform: string; handle: string; proof: string }) => {
    if (hub && first) await showIn(a, undefined, true);
    for (const id of spaces.slice(1)) await showIn(a, id, true);
  };
  const done = () => (bump(), onClose());

  // Proven already, asked from a project: shown there with one click.
  if (space && proven && !proven.spaces.some((x) => x.id === space.id))
    return (
      <Modal title={`Your ${title} account, in ${placeName(space)}`} onClose={onClose}>
        <p className="small">
          You proved <b>{proven.handle}</b> on {title} already. Shared with {placeName(space)}, its members see it, and its services may give you access by it.
        </p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <AsyncButton className="default" onClick={() => attempt(() => showIn(proven, space.id, true).then(done), `${proven.handle} is shared with ${placeName(space)}`)}>
            Share {proven.handle}
          </AsyncButton>
        </div>
      </Modal>
    );

  const where = (
    <fieldset>
      <legend>Where it shows</legend>
      <div className="field-row">
        <input type="checkbox" id="show-hub" checked={hub} onChange={(e) => setHub(e.target.checked)} />
        <label htmlFor="show-hub">Your hub: everyone sees it</label>
      </div>
      {places.map((p) => (
        <div className="field-row" key={p.id}>
          <input type="checkbox" id={`show-${p.id}`} checked={spaces.includes(p.id)} onChange={(e) => setSpaces((x) => (e.target.checked ? [...x, p.id] : x.filter((id) => id !== p.id)))} />
          <label htmlFor={`show-${p.id}`}>{placeName(p)}</label>
        </div>
      ))}
      <p className="small muted">In a project, its members see it, and its services may give you access by it (to a repository, say).</p>
    </fieldset>
  );

  const proveWith = () =>
    attempt(async () => {
      const { id, url, code } = await api<{ id: string; url: string; code: string }>('startAccountProof', { platform: chosen, ...(first ? { space: first } : {}) });
      void navigator.clipboard?.writeText(code).catch(() => {});
      setSigning({ code, url });
      window.open(url, '_blank', 'noopener');
      try {
        await api<AccountInfo[]>('finishAccountProof', { id });
        const made = (await api<MyAccountInfo[]>('myAccounts')).find((a) => a.platform === chosen && (first ? a.spaces.some((x) => x.id === first) : a.hub));
        if (made) await showRest(made);
        done();
      } finally {
        setSigning(undefined);
      }
    }, `Your ${title} account is proven yours`);

  if (about?.prove && !byHand)
    return (
      <Modal title="Prove an account elsewhere" onClose={onClose}>
        {signing ? (
          <div className="notice">
            Enter this code on{' '}
            <a href={signing.url} target="_blank" rel="noopener noreferrer">
              {new URL(signing.url).hostname}
            </a>{' '}
            (it's copied): <b className="user-code">{signing.code}</b>. Then {title} makes the proof, a secret note naming you, and Weave forgets the sign-in. Only ever enter a code Weave shows you, here.
          </div>
        ) : (
          <p className="small muted">You allow it once on {title}: it makes a proof naming you there (on GitHub, a secret gist), and Weave forgets the sign-in right away. Delete the proof there, and the account is no longer yours here.</p>
        )}
        {where}
        <div className="buttons">
          <button type="button" onClick={() => setByHand(true)}>
            Make the proof myself…
          </button>
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <AsyncButton className="default" disabled={!!signing || nowhere} onClick={proveWith}>
            Prove with {title}…
          </AsyncButton>
        </div>
      </Modal>
    );
  return (
    <Modal title="Prove an account elsewhere" onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const claim = { platform: chosen, handle, proof: address };
          const ok = await attempt(() => showIn(claim, first, true).then(() => showRest(claim)).then(() => true), `${handle} on ${title} is proven yours`);
          if (ok !== undefined) done();
        }}
      >
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
          <label htmlFor="account-handle">Your account on {title}</label>
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
        {where}
        <p className="small muted">Weave checks it now, and everyone's Weave checks it again. Delete the proof there, and the account is no longer yours here.</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!chosen || !handle || !address || nowhere}>
            Prove it
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** In Keys & devices: your accounts elsewhere, proven once, and where each shows (your hub, the projects you pick). */
export function LinkedAccountsBox() {
  const { data: mine, reload } = useApi(() => api<MyAccountInfo[]>('myAccounts').catch(() => [] as MyAccountInfo[]), []);
  const places = usePlaces();
  const [adding, setAdding] = useState(false);
  const toggle = (a: MyAccountInfo, space: string | undefined, on: boolean, where: string) => attempt(() => showIn(a, space, on).then(() => (reload(), bump())), on ? `${a.handle} shows ${where} now` : `${a.handle} no longer shows ${where}`);
  return (
    <fieldset>
      <legend>Accounts elsewhere</legend>
      {(mine ?? []).map((a) => (
        <div className="linked-account" key={`${a.platform} ${a.handle}`}>
          <div className="field-row">
            <Icon name={a.platform === 'github' ? 'github' : 'externalLink'} />
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
                {a.verified ? ' ✓' : a.verified === false ? " (its proof doesn't hold any more)" : " (couldn't be checked yet)"}
              </span>
            </span>
          </div>
          <div className="linked-account-places small">
            Shows:
            <label>
              <input type="checkbox" checked={a.hub} onChange={(e) => void toggle(a, undefined, e.target.checked, 'on your hub')} /> your hub
            </label>
            {places.map((p) => (
              <label key={p.id}>
                <input type="checkbox" checked={a.spaces.some((x) => x.id === p.id)} onChange={(e) => void toggle(a, p.id, e.target.checked, `in ${placeName(p)}`)} /> {placeName(p)}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="field-row">
        <span className="grow small">Prove an account on another platform once (each Weave checks it itself), then say where it shows: your hub for everyone, a project for its members and its services (access to its repositories, say).</span>
        <button onClick={() => setAdding(true)}>Prove an account…</button>
      </div>
      {adding && <AccountProofDialog onClose={() => (setAdding(false), reload())} />}
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
