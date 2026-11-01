import { useEffect, useState } from 'react';
import type { InviteLook, SpaceInfo, SpaceRef } from '@weave/node/client';
import { api, bump, navigate, shortDid, useApi } from './lib.ts';
import { spaceHref, spaceLabel } from './posts.tsx';
import { AsyncButton, attempt, Modal, sprite, toast } from './ui.tsx';
import { Icon } from './icons.tsx';

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
const KIND_WORD: Record<string, string> = { project: 'project', group: 'group', community: 'community' };

/** One line on where you stand with the link, for the card. */
export function standingLine(look: InviteLook): string {
  switch (look.standing) {
    case 'open':
      return look.kind === 'knock' ? `${who(look.inviter)} decides who comes in` : `Joins right away · until ${new Date(look.expires).toLocaleDateString()}`;
    case 'member':
      return `You're in${look.members ? ` · ${look.members} member${look.members === 1 ? '' : 's'}` : ''}`;
    case 'waiting':
      return `Asked, waiting for ${who(look.inviter)}`;
    case 'mine':
      return 'Your own link';
    case 'expired':
      return 'Expired: ask for a new one';
    case 'old':
      return 'Made by an older Weave: ask for a new one';
    case 'elsewhere':
      return look.problem ?? "Your company's accounts stay in its spaces";
    default:
      return 'Damaged link';
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
        text.textContent = `An invite link that doesn't work here: ${error.message}`;
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
  const heading = look.standing === 'mine' ? `You invite to this ${KIND_WORD[look.space.kind] ?? 'space'}` : `${who(look.inviter)} invites you to this ${KIND_WORD[look.space.kind] ?? 'space'}`;
  body.append(el('span', 'post-embed-where', heading), el('b', 'post-embed-title', spaceLabel(look.space)));
  if (look.boards.length) body.append(el('span', 'post-embed-text', `With ${look.boards.length === 1 ? 'the board' : 'the boards'} ${look.boards.join(', ')}`));
  body.append(el('span', 'post-embed-meta', standingLine(look)));
  const action = el('button', 'invite-action');
  action.textContent = look.standing === 'open' ? (look.kind === 'knock' ? 'Ask to join…' : 'Join…') : look.standing === 'member' ? 'Open' : 'Details';
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
      toast(`Asked. ${who(look.inviter)} decides; you'll see the answer in your Inbox.`);
      close();
    } else {
      toast(`You're in ${look.space.name}`);
      open(look.space);
    }
  };
  let body: React.ReactNode;
  if (!look) body = <p>Looking at the link…</p>;
  else if ('problem' in look) body = <p>This invite link doesn't work here: {look.problem}</p>;
  else {
    const inviter = who(look.inviter);
    const label = <b>{spaceLabel(look.space)}</b>;
    const boards = look.boards.length ? <p className="small muted">The link also opens {look.boards.length === 1 ? 'the board' : 'the boards'} {look.boards.join(', ')}.</p> : null;
    switch (look.standing) {
      case 'open':
        body =
          look.kind === 'knock' ? (
            <>
              <p>
                {inviter} invites you to {label}, a {KIND_WORD[look.space.kind]}. They decide who comes in: ask them?
              </p>
              {boards}
              <div className="field-row-stacked">
                <label htmlFor="invite-note">A note for {inviter} (optional)</label>
                <input id="invite-note" maxLength={500} placeholder="Hi, it's me from…" value={note} onChange={(e) => setNote(e.target.value)} />
              </div>
              <div className="buttons">
                <button onClick={close}>No</button>
                <AsyncButton className="default" onClick={join}>
                  Ask to join
                </AsyncButton>
              </div>
            </>
          ) : (
            <>
              <p>
                {inviter} invites you to {label}, a {KIND_WORD[look.space.kind]}. Join?
              </p>
              {boards}
              <p className="small muted">You'll read what members read there, and they'll see you came in. The link works until {new Date(look.expires).toLocaleString()}.</p>
              <div className="buttons">
                <button onClick={close}>No</button>
                <AsyncButton className="default" onClick={join}>
                  Yes, join
                </AsyncButton>
              </div>
            </>
          );
        break;
      case 'member':
        body = (
          <>
            <p>You're in {label} already.</p>
            <div className="buttons">
              <button onClick={close}>Close</button>
              <button className="default" onClick={() => open(look.space)}>
                Open
              </button>
            </div>
          </>
        );
        break;
      case 'waiting':
        body = (
          <>
            <p>
              You asked to join {label}. {inviter} decides; the answer comes to your Inbox.
            </p>
            <div className="buttons">
              <button className="default" onClick={close}>
                Close
              </button>
            </div>
          </>
        );
        break;
      case 'mine':
        body = (
          <>
            <p>This is your own link to {label}: send it to whoever you invite.</p>
            <div className="buttons">
              <button className="default" onClick={close}>
                Close
              </button>
            </div>
          </>
        );
        break;
      default:
        body = (
          <>
            <p>
              {inviter}'s link to {label} doesn't work: {look.problem ?? standingLine(look)}.
            </p>
            <div className="buttons">
              <button className="default" onClick={close}>
                Close
              </button>
            </div>
          </>
        );
    }
  }
  return (
    <Modal title="Invitation" onClose={close}>
      <div className="form invite-dialog">{body}</div>
    </Modal>
  );
}

/** From a chat with someone: pick one of your spaces, make a link for it and send it here as a card. */
export function InviteToDialog({ chat, peerName, onClose }: { chat: SpaceRef; peerName: string; onClose(): void }) {
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces'), []);
  const choices = (spaces ?? []).filter((s) => s.kind !== 'direct' && !s.waiting && !s.closed);
  const [picked, setPicked] = useState('');
  const [accept, setAccept] = useState(false);
  const space = choices.find((s) => s.id === picked);
  const send = async () => {
    if (!space) return;
    const link = await attempt(() => api<string>('invite', space.id, 7 * 24, { accept, access: [] }));
    if (!link) return;
    const sent = await attempt(() => api('say', { space: chat.id, text: link }), `Invited ${peerName} to ${space.name}`);
    if (sent !== undefined) onClose();
  };
  return (
    <Modal title={`Invite ${peerName} to…`} onClose={onClose}>
      <div className="form">
        {choices.length === 0 ? (
          <p>You're in no project, group or community to invite {peerName} to yet.</p>
        ) : (
          <>
            <div className="field-row-stacked">
              <label htmlFor="invite-to-space">Where to</label>
              <select id="invite-to-space" value={picked} onChange={(e) => setPicked(e.target.value)}>
                <option value="">Pick a place…</option>
                {choices.map((s) => (
                  <option key={s.id} value={s.id}>
                    {spaceLabel(s)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field-row">
              <input type="checkbox" id="invite-to-accept" checked={accept} onChange={(e) => setAccept(e.target.checked)} />
              <label htmlFor="invite-to-accept">Ask me first before they come in</label>
            </div>
            <p className="small muted">
              <Icon name="lock" size={12} /> The link goes into this chat, which only the two of you read. It works for a week.
            </p>
          </>
        )}
        <div className="buttons">
          <button onClick={onClose}>Cancel</button>
          {choices.length > 0 && (
            <AsyncButton className="default" onClick={send} disabled={!space}>
              Send invite
            </AsyncButton>
          )}
        </div>
      </div>
    </Modal>
  );
}
