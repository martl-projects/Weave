import { useState } from 'react';
import type { AccountInfo, AppOpen, MyAccountInfo, PlatformInfo, Profile, SpaceInfo } from '@weave/node/client';
import { Icon, isIconName, type IconName } from './icons.tsx';
import { api, bridge, bump, navigate, onItem, useApi } from './lib.ts';
import { openKeyvault } from './keyvaults.tsx';
import { copy, spaceHref } from './posts.tsx';
import { openLaunch, openServices } from './websites.tsx';
import { attempt, AsyncButton, Modal } from './ui.tsx';
import { T, useTexts } from './texts.tsx';

/*
 * Accounts elsewhere (GitHub, X…): you prove one is yours once, with a proof that names your Weave id there, and say
 * where it shows: on your hub (everyone sees it), in projects (their members do, and their services may give you
 * access by it). Weave knows no platform: each has a verifier, a client app every Weave runs to check the proof itself.
 */

/** A platform's icon, as its verifier names it (Weave knows no platform's look); a plain link where none does. */
function usePlatformIcon(): (platform: string) => IconName {
  const { data: platforms } = useApi(() => api<PlatformInfo[]>('platforms').catch(() => [] as PlatformInfo[]), []);
  return (platform) => {
    const icon = platforms?.find((p) => p.platform === platform)?.icon;
    return isIconName(icon) ? icon : 'externalLink';
  };
}

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
  const { t } = useTexts();
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
      <Modal title={t('account.in.place.title', { platform: title, place: placeName(space) })} onClose={onClose}>
        <p className="small">
          <T name="account.proved.already" values={{ handle: <b>{proven.handle}</b>, platform: title, place: placeName(space) }} />
        </p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <AsyncButton className="default" onClick={() => attempt(() => showIn(proven, space.id, true).then(done), t('account.shared.with', { handle: proven.handle, place: placeName(space) }))}>
            {t('account.share', { handle: proven.handle })}
          </AsyncButton>
        </div>
      </Modal>
    );

  const where = (
    <fieldset>
      <legend>{t('account.where.shows')}</legend>
      <div className="field-row">
        <input type="checkbox" id="show-hub" checked={hub} onChange={(e) => setHub(e.target.checked)} />
        <label htmlFor="show-hub">{t('account.your.hub.everyone')}</label>
      </div>
      {places.map((p) => (
        <div className="field-row" key={p.id}>
          <input type="checkbox" id={`show-${p.id}`} checked={spaces.includes(p.id)} onChange={(e) => setSpaces((x) => (e.target.checked ? [...x, p.id] : x.filter((id) => id !== p.id)))} />
          <label htmlFor={`show-${p.id}`}>{placeName(p)}</label>
        </div>
      ))}
      <p className="small muted">{t('account.in.project.note')}</p>
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
    }, t('account.proven', { platform: title }));

  if (about?.prove && !byHand)
    return (
      <Modal title={t('account.prove.title')} onClose={onClose}>
        {signing ? (
          <div className="notice">
            <T
              name="account.enter.code"
              values={{
                site: (
                  <a href={signing.url} target="_blank" rel="noopener noreferrer">
                    {new URL(signing.url).hostname}
                  </a>
                ),
                code: <b className="user-code">{signing.code}</b>,
                platform: title,
              }}
            />
          </div>
        ) : (
          <p className="small muted">{t('account.prove.once', { platform: title })}</p>
        )}
        {where}
        <div className="buttons">
          <button type="button" onClick={() => setByHand(true)}>
            {t('account.make.proof.myself')}
          </button>
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <AsyncButton className="default" disabled={!!signing || nowhere} onClick={proveWith}>
            {t('account.prove.with', { platform: title })}
          </AsyncButton>
        </div>
      </Modal>
    );
  return (
    <Modal title={t('account.prove.title')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const claim = { platform: chosen, handle, proof: address };
          const ok = await attempt(() => showIn(claim, first, true).then(() => showRest(claim)).then(() => true), t('account.handle.proven', { handle, platform: title }));
          if (ok !== undefined) done();
        }}
      >
        {platforms && platforms.length === 0 && <p className="small">{t('account.no.platforms')}</p>}
        {!asked && platforms && platforms.length > 1 && (
          <div className="field-row-stacked">
            <label htmlFor="account-platform">{t('account.where')}</label>
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
          <label htmlFor="account-handle">{t('account.your.account.on', { platform: title })}</label>
          <input id="account-handle" required autoFocus value={handle} onChange={(e) => setHandle(e.target.value.trim())} />
        </div>
        {proof && (
          <ol className="steps small">
            <li>
              {proof.howto ?? t('account.make.proof.howto')}
              <div className="user-code sunken small" title={t('account.click.copy')} onClick={() => copy(proof.text)}>
                {proof.text}
              </div>
            </li>
            <li>{t('account.paste.address')}</li>
          </ol>
        )}
        <div className="field-row-stacked">
          <label htmlFor="account-proof">{t('account.its.proof')}</label>
          <input id="account-proof" required value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        {where}
        <p className="small muted">{t('account.checks.note')}</p>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            {t('button.cancel')}
          </button>
          <button className="default" disabled={!chosen || !handle || !address || nowhere}>
            {t('account.prove.it')}
          </button>
        </div>
      </form>
    </Modal>
  );
}

/** In Keys & devices: your accounts elsewhere, proven once, and where each shows (your hub, the projects you pick). */
export function LinkedAccountsBox() {
  const { t } = useTexts();
  const { data: mine, reload } = useApi(() => api<MyAccountInfo[]>('myAccounts').catch(() => [] as MyAccountInfo[]), []);
  const places = usePlaces();
  const iconOf = usePlatformIcon();
  const [adding, setAdding] = useState(false);
  const toggle = (a: MyAccountInfo, space: string | undefined, on: boolean, where: string) => attempt(() => showIn(a, space, on).then(() => (reload(), bump())), t(on ? 'account.shows.now' : 'account.shows.no.more', { handle: a.handle, where }));
  return (
    <fieldset>
      <legend>{t('accounts.legend')}</legend>
      {(mine ?? []).map((a) => (
        <div className="linked-account" key={`${a.platform} ${a.handle}`}>
          <div className="field-row">
            <Icon name={iconOf(a.platform)} />
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
                {a.verified ? ' ✓' : a.verified === false ? t('account.proof.broken') : t('account.not.checked')}
              </span>
            </span>
          </div>
          <div className="linked-account-places small">
            {t('account.shows')}
            <label>
              <input type="checkbox" checked={a.hub} onChange={(e) => void toggle(a, undefined, e.target.checked, t('account.on.your.hub'))} /> {t('account.your.hub')}
            </label>
            {places.map((p) => (
              <label key={p.id}>
                <input type="checkbox" checked={a.spaces.some((x) => x.id === p.id)} onChange={(e) => void toggle(a, p.id, e.target.checked, t('account.in.place', { place: placeName(p) }))} /> {placeName(p)}
              </label>
            ))}
          </div>
        </div>
      ))}
      <div className="field-row">
        <span className="grow small">{t('accounts.about')}</span>
        <button onClick={() => setAdding(true)}>{t('account.prove.button')}</button>
      </div>
      {adding && <AccountProofDialog onClose={() => (setAdding(false), reload())} />}
    </fieldset>
  );
}

/** Under a hub's name: the accounts elsewhere they show, each opening its page; ✓ when its proof holds. */
export function HubAccounts({ profile }: { profile: Profile }) {
  const { t } = useTexts();
  const iconOf = usePlatformIcon();
  if (!profile.accounts?.length) return null;
  return (
    <>
      {profile.accounts.map((a) => (
        <a key={a.platform} className="hub-github" href={a.url} target="_blank" rel="noopener noreferrer" title={a.verified ? t('account.proof.names', { platform: a.platform }) : t('account.unreached', { platform: a.platform })}>
          <Icon name={iconOf(a.platform)} /> {a.handle}
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
    // A keyvault: Keys & devices, with its dialog open (the person's app to make, or a repository to hand the project).
    if (open.what === 'keyvault' && open.keyvault) {
      openKeyvault({ name: open.keyvault.name, ...(open.space ? { project: { id: open.space.id, name: open.space.name } } : {}) });
      return navigate('#/keys');
    }
    // A project's services: one it runs, or the Add a service catalog with something picked.
    if (open.what === 'service' && open.space) {
      openServices({ project: open.space.id, ...(open.service ? { service: open.service } : {}), ...(open.askedBy ? { askedBy: open.askedBy } : {}) });
      return navigate(`${spaceHref(open.space)}/services`);
    }
    // A website to launch from a release: the project's services, with the Launch dialog filled in (the click is the person's).
    if (open.what === 'website' && open.space && open.website) {
      openLaunch({ project: open.space.id, release: { project: open.website.project.id, id: open.website.id }, ...(open.askedBy ? { askedBy: open.askedBy } : {}) });
      return navigate(`${spaceHref(open.space)}/services`);
    }
    if (open.what === 'person' && open.person) return navigate(`#/space/${open.person.did}`);
    if (open.what === 'inbox' || !open.space) return navigate('#/inbox');
    navigate(spaceHref(open.space));
  });
}
