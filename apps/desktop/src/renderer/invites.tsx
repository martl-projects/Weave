import { useEffect, useState } from 'react';
import type { InviteLook, SpaceInfo, SpaceRef } from '@weave/node/client';
import { api, bump, navigate, shortDid, useApi } from './lib.ts';
import { spaceHref, spaceLabel } from './posts.tsx';
import { AsyncButton, attempt, Modal, sprite, toast } from './ui.tsx';
import { Icon } from './icons.tsx';
import { t, T, useTexts } from './texts.tsx';

/*
 * Better invites, part 1 (post ye1AFnk1). An invite link (weave:invite:…, or
 * weave:knock:… which asks the inviter first) pasted into a chat or a post shows
 * as a card, not as its text: who invites to what, and where you stand. The card,
 * a link chip, or a link the OS hands over opens one dialog: "Join?" with Yes and
 * No. From a chat with someone, "Invite to…" picks a space and sends the card.
 */

/** An invite or knock link, as text. */
export const INVITE_LINK = /weave:(?:invite|knock):[A-Za-z0-9_-]+/;
export const isInviteHref = (href: string): boolean => new RegExp(`^${INVITE_LINK.source}$`).test(href);

/** Open the "Join?" dialog for a link: from a card, a chip or the OS. */
export function openInviteLink(link: string): void {
  window.dispatchEvent(new CustomEvent('weave-invite-link', { detail: link }));
}

/** Cards and dialogs look again: someone joined, or asked. */
const invitesChanged = () => window.dispatchEvent(new Event('weave-invites-changed'));

const who = (a: { did: string; name?: string }) => a.name ?? shortDid(a.did);
/** A space's kind as a word (word.project, word.group, word.community). */
const kindWord = (kind: string) => t(`word.${kind === 'direct' ? 'chat' : kind}`);

/** One line on where you stand with the link, for the card. */
export function standingLine(look: InviteLook): string {
  switch (look.standing) {
    case 'open':
      return look.kind === 'knock' ? t('inv.standing.knock', { inviter: who(look.inviter) }) : t('inv.standing.open', { until: look.expires });
    case 'member':
      return look.members ? t('inv.standing.member.n', { n: look.members }) : t('inv.standing.member');
    case 'waiting':
      return t('inv.standing.waiting', { inviter: who(look.inviter) });
    case 'mine':
      return t('inv.standing.mine');
    case 'expired':
      return t('inv.standing.expired');
    case 'old':
      return t('inv.standing.old');
    case 'elsewhere':
      return look.problem ?? t('inv.standing.elsewhere');
    default:
      return t('inv.standing.damaged');
  }
}

/** Fill the .invite-embed boxes renderMarkdown left for lone invite links with cards; a card opens the dialog. */
export function loadInviteEmbeds(root: ParentNode): void {
  for (const box of root.querySelectorAll<HTMLElement>('.invite-embed[data-invite]:not([data-ready])')) {
    const link = box.dataset.invite!;
    box.dataset.ready = 'loading';
    api<InviteLook>('lookAtInvite', link).then(
      (look) => box.replaceChildren(inviteCard(link, look)),
      (error: Error) => {
        box.classList.add('missing');
        const text = document.createElement('span');
        text.textContent = t('inv.embed.broken', { error: error.message });
        box.replaceChildren(text);
      },
    );
    box.dataset.ready = 'yes';
  }
}

// After a join or a knock, every card looks again.
window.addEventListener('weave-invites-changed', () => {
  for (const box of document.querySelectorAll<HTMLElement>('.invite-embed[data-ready]')) delete box.dataset.ready;
  loadInviteEmbeds(document);
});

function inviteCard(link: string, look: InviteLook): HTMLElement {
  const el = (tag: string, className: string, text?: string) => {
    const node = document.createElement(tag);
    node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const card = el('div', `invite-card ${look.standing}`);
  card.setAttribute('role', 'button');
  card.tabIndex = 0;
  const thumb = el('span', 'post-embed-thumb');
  thumb.innerHTML = sprite(look.space.id, 10, false);
  const body = el('span', 'post-embed-body');
  const heading = look.standing === 'mine' ? t('inv.card.you.invite', { kind: kindWord(look.space.kind) }) : t('inv.card.invites', { inviter: who(look.inviter), kind: kindWord(look.space.kind) });
  body.append(el('span', 'post-embed-where', heading), el('b', 'post-embed-title', spaceLabel(look.space)));
  if (look.boards.length) body.append(el('span', 'post-embed-text', t('inv.card.with.boards', { n: look.boards.length, boards: look.boards.join(', ') })));
  body.append(el('span', 'post-embed-meta', standingLine(look)));
  const action = el('button', 'invite-action');
  action.textContent = look.standing === 'open' ? t(look.kind === 'knock' ? 'inv.card.ask' : 'inv.card.join') : t(look.standing === 'member' ? 'inv.open' : 'inv.card.details');
  const act = () => (look.standing === 'member' ? navigate(spaceHref(look.space)) : openInviteLink(link));
  action.addEventListener('click', (e) => {
    e.stopPropagation();
    act();
  });
  card.addEventListener('click', act);
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      act();
    }
  });
  card.append(thumb, body, action);
  return card;
}

/**
 * The one dialog behind every invite link: "<Inviter> invites you to <space>. Join?"
 * with Yes and No; for a knock link, ask with a note. Mounted once, opened by openInviteLink.
 */
export function InviteLinkDialog() {
  const { t } = useTexts();
  const [link, setLink] = useState<string>();
  const [look, setLook] = useState<InviteLook | { problem: string }>();
  const [note, setNote] = useState('');
  useEffect(() => {
    const onLink = (e: Event) => {
      setLink((e as CustomEvent<string>).detail);
      setLook(undefined);
      setNote('');
    };
    window.addEventListener('weave-invite-link', onLink);
    return () => window.removeEventListener('weave-invite-link', onLink);
  }, []);
  useEffect(() => {
    if (!link) return;
    let alive = true;
    api<InviteLook>('lookAtInvite', link).then(
      (l) => alive && setLook(l),
      (error: Error) => alive && setLook({ problem: error.message }),
    );
    return () => {
      alive = false;
    };
  }, [link]);
  if (!link) return null;
  const close = () => setLink(undefined);
  const open = (space: SpaceRef) => {
    close();
    navigate(spaceHref(space));
  };
  const join = async () => {
    if (!look || 'problem' in look) return;
    const joined = await attempt(() => api<SpaceInfo>('joinSpace', link, look.kind === 'knock' ? note : undefined));
    if (!joined) return;
    bump();
    invitesChanged();
    if (look.kind === 'knock') {
      toast(t('inv.asked', { inviter: who(look.inviter) }));
      close();
    } else {
      toast(t('inv.youre.in', { space: look.space.name }));
      open(look.space);
    }
  };
  let body: React.ReactNode;
  if (!look) body = <p>{t('inv.looking')}</p>;
  else if ('problem' in look) body = <p>{t('inv.doesnt.work', { problem: look.problem })}</p>;
  else {
    const inviter = who(look.inviter);
    const label = <b>{spaceLabel(look.space)}</b>;
    const boards = look.boards.length ? <p className="small muted">{t('inv.also.opens', { n: look.boards.length, boards: look.boards.join(', ') })}</p> : null;
    switch (look.standing) {
      case 'open':
        body =
          look.kind === 'knock' ? (
            <>
              <p>
                <T name="inv.knock.ask" values={{ inviter, space: label, kind: kindWord(look.space.kind) }} />
              </p>
              {boards}
              <div className="field-row-stacked">
                <label htmlFor="invite-note">{t('inv.note.for', { inviter })}</label>
                <input id="invite-note" maxLength={500} placeholder={t('new.knock.note.placeholder')} value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="buttons">
                <button onClick={close}>{t('inv.no')}</button>
                <AsyncButton className="default" onClick={join}>
                  {t('join.ask')}
                </AsyncButton>
              </div>
            </>
          ) : (
            <>
              <p>
                <T name="inv.join.ask" values={{ inviter, space: label, kind: kindWord(look.space.kind) }} />
              </p>
              {boards}
              <p className="small muted">{t('inv.join.note', { until: look.expires })}</p>
              <div className="buttons">
                <button onClick={close}>{t('inv.no')}</button>
                <AsyncButton className="default" onClick={join}>
                  {t('inv.yes.join')}
                </AsyncButton>
              </div>
            </>
          );
        break;
      case 'member':
        body = (
          <>
            <p>
              <T name="inv.in.already" values={{ space: label }} />
            </p>
            <div className="buttons">
              <button onClick={close}>{t('button.close')}</button>
              <button className="default" onClick={() => open(look.space)}>
                {t('inv.open')}
              </button>
            </div>
          </>
        );
        break;
      case 'waiting':
        body = (
          <>
            <p>
              <T name="inv.waiting" values={{ space: label, inviter }} />
            </p>
            <div className="buttons">
              <button className="default" onClick={close}>
                {t('button.close')}
              </button>
            </div>
          </>
        );
        break;
      case 'mine':
        body = (
          <>
            <p>
              <T name="inv.mine" values={{ space: label }} />
            </p>
            <div className="buttons">
              <button className="default" onClick={close}>
                {t('button.close')}
              </button>
            </div>
          </>
        );
        break;
      default:
        body = (
          <>
            <p>
              <T name="inv.broken" values={{ inviter, space: label, why: look.problem ?? standingLine(look) }} />
            </p>
            <div className="buttons">
              <button className="default" onClick={close}>
                {t('button.close')}
              </button>
            </div>
          </>
        );
    }
  }
  return (
    <Modal title={t('inv.title')} onClose={close}>
      <div className="form invite-dialog">{body}</div>
    </Modal>
  );
}

/** From a chat with someone: pick one of your spaces, make a link for it and send it here as a card. */
export function InviteToDialog({ chat, peerName, onClose }: { chat: SpaceRef; peerName: string; onClose(): void }) {
  const { t } = useTexts();
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const choices = (spaces ?? []).filter((s) => s.kind !== 'direct' && !s.waiting && !s.closed);
  const [picked, setPicked] = useState('');
  const [accept, setAccept] = useState(false);
  const space = choices.find((s) => s.id === picked);
  const send = async () => {
    if (!space) return;
    const link = await attempt(() => api<string>('invite', space.id, 7 * 24, { accept, access: [] }));
    if (!link) return;
    const sent = await attempt(() => api('say', { space: chat.id, text: link }), t('inv.invited', { name: peerName, space: space.name }));
    if (sent !== undefined) onClose();
  };
  return (
    <Modal title={t('inv.to.title', { name: peerName })} onClose={onClose}>
      <div className="form">
        {choices.length === 0 ? (
          <p>{t('inv.to.none', { name: peerName })}</p>
        ) : (
          <>
            <div className="field-row-stacked">
              <label htmlFor="invite-to-space">{t('inv.where.to')}</label>
              <select id="invite-to-space" value={picked} onChange={(e) => setPicked(e.target.value)}>
                <option value="">{t('inv.pick.place')}</option>
                {choices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {spaceLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <input type="checkbox" id="invite-to-accept" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <label htmlFor="invite-to-accept">{t('inv.ask.me.first')}</label>
            </div>
            <p className="small muted">
              <Icon name="lock" size={12} /> {t('inv.link.note')}
            </p>
          </>
        )}
        <div className="buttons">
          <button onClick={onClose}>{t('button.cancel')}</button>
          {choices.length > 0 && (
            <AsyncButton className="default" onClick={send} disabled={!space}>
              {t('inv.send')}
            </AsyncButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
