import data from '@emoji-mart/data';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Picker } from 'emoji-mart';
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent, type KeyboardEvent } from 'react';
import type { MemberInfo, MessageInfo, SpaceInfo } from '@weave/node/client';
import type { Attachment } from '@weave/core';
import { TEXT_LIMITS } from '@weave/core/limits';
import { CharCount } from './editor.tsx';
import { api, clock, dayLabel, loadBlobImages, markSeen, plain, renderMarkdown, shortDid, useApi, useStickToBottom } from './lib.ts';
import { Icon } from './icons.tsx';
import { ask, attempt, Avatar, loadEmbeds, toast } from './ui.tsx';
import { Marks } from './marks.tsx';
import { HintSigns, useHints } from './notify.tsx';
import { AnnounceCard } from './announce.tsx';
import { AttachedChip, AttachmentView, fileLine, isImage, MAX_FILE, uploadFile } from './attachments.tsx';
import { t, useTexts } from './texts.tsx';

const QUICK_REACTIONS = ['👍', '❤️', '😂', '🎉', '👀', '✅'];

/** emoji-mart's picker is a web component; we mount it and hand back the chosen emoji. */
export function EmojiPicker({ onPick, onClose }: { onPick(emoji: string): void; onClose(): void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const picker = new Picker({
      data,
      theme: 'light',
      previewPosition: 'none',
      skinTonePosition: 'search',
      maxFrequentRows: 1,
      onEmojiSelect: (emoji: { native: string }) => onPick(emoji.native),
      onClickOutside: onClose,
    });
    const host = ref.current!;
    host.appendChild(picker as unknown as Node);
    return () => host.replaceChildren();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <div className="emoji-pop" ref={ref} />;
}

type Row = { kind: 'day'; label: string; key: string } | { kind: 'msg'; m: MessageInfo; compact: boolean; key: string };

/** Day separators, and consecutive messages from the same sender within 5 minutes shown without repeating the header. */
function toRows(messages: MessageInfo[]): Row[] {
  const rows: Row[] = [];
  let prev: MessageInfo | undefined;
  for (const m of messages) {
    const day = new Date(m.time).toDateString();
    if (!prev || new Date(prev.time).toDateString() !== day) rows.push({ kind: 'day', label: dayLabel(m.time), key: `day-${day}` });
    const sameSender = prev && prev.by.did === m.by.did && prev.by.agent === m.by.agent;
    const compact = !!sameSender && !m.replyTo && Date.parse(m.time) - Date.parse(prev!.time) < 5 * 60_000 && rows.at(-1)?.kind === 'msg';
    rows.push({ kind: 'msg', m, compact, key: m.id });
    prev = m;
  }
  return rows;
}

const nameOf = (by: MessageInfo['by'], meDid: string) => (by.did === meDid && !by.agent ? t('word.you') : (by.name ?? shortDid(by.did)));

function Message({
  row,
  meDid,
  mentionNames,
  onReply,
  moderating,
  space,
}: {
  /** The space it's in: its own mark services show too, and its announcements open from here. */
  space: SpaceInfo;
  row: Extract<Row, { kind: 'msg' }>;
  meDid: string;
  mentionNames: string[];
  onReply(m: MessageInfo): void;
  /** You maintain or moderate the space: you may take down anyone's message. */
  moderating: boolean;
}) {
  const { m, compact } = row;
  const { t } = useTexts();
  const [picking, setPicking] = useState(false);
  const html = useMemo(() => renderMarkdown(m.text), [m.text]);
  const textRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!textRef.current) return;
    loadBlobImages(textRef.current);
    loadEmbeds(textRef.current);
  }, [html]);
  const mentionsMe = mentionNames.some((name) => new RegExp(`@${name}\\b`, 'i').test(m.text));
  // What your hint services say about it (Spotlight: someone close to you, your contacts); asks of all rows go in one batch.
  const [hint] = useHints('message', [{ message: { space: space.id, id: m.id } }]);
  const react = (emoji: string, on = true) => attempt(() => api('react', { target: m.id, emoji, on }));
  const mayDelete = m.by.did === meDid || moderating;
  const remove = async () => {
    const question = m.by.did === meDid ? t('msg.delete.own') : m.by.name ? t('msg.delete.other', { name: m.by.name }) : t('msg.delete.this');
    if (await ask(question, t('button.delete'))) await attempt(() => api('deleteMessage', { message: m.id }), t('msg.deleted'));
  };
  const author = (
    <span className={`author${m.by.agent ? ' is-agent' : ''}`}>
      <a href={`#/space/${encodeURIComponent(m.by.did)}`}>{nameOf(m.by, meDid)}</a>
      {!m.by.agent && <Marks did={m.by.did} slot="author" space={space.id} />}
      <HintSigns signs={hint.signs} />
      {m.by.agent && (
        <span className="agent-tag" title={t('member.agent.title', { name: m.by.name ?? t('word.someone') })}>
          {t('agent.tag.caps', { agent: m.by.agent })}
        </span>
      )}
    </span>
  );

  return (
    <div className={`msg-row${compact ? ' compact' : ''}${mentionsMe ? ' mentioned' : ''}${hint.tone ? ` tint-${hint.tone}` : ''}`} title={hint.tooltip}>
      {m.replyTo && (
        <div className="reply-ref">
          <span className="reply-line" />
          <Avatar did={m.replyTo.by.did} name={m.replyTo.by.name} size={16} />
          <b>{nameOf(m.replyTo.by, meDid)}</b>
          <span className="reply-text">{plain(m.replyTo.text)}</span>
        </div>
      )}
      <div className="msg-main">
        <div className="gutter">{compact ? <time className="hover-time">{clock(m.time)}</time> : <Avatar did={m.by.did} name={m.by.name} size={40} />}</div>
        <div className="msg-body">
          {!compact && (
            <div className="msg-head">
              {author}
              <time>{t('msg.time', { day: dayLabel(m.time), clock: clock(m.time) })}</time>
            </div>
          )}
          {m.text && <div ref={textRef} className="msg-text" dangerouslySetInnerHTML={{ __html: html }} />}
          {m.file && <AttachmentView file={m.file} />}
          {m.announce && <AnnounceCard space={space} announce={m.announce} />}
          {m.reactions.length > 0 && (
            <div className="reactions">
              {m.reactions.map((r) => (
                <button key={r.emoji} className={`reaction${r.mine ? ' mine' : ''}`} title={r.by.join(', ')} onClick={() => react(r.emoji, !r.mine)}>
                  <span>{r.emoji}</span> {r.count}
                </button>
              ))}
              <button className="reaction add" title={t('msg.react.add')} onClick={() => setPicking(true)}>
                ☺+
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="msg-tools">
        {QUICK_REACTIONS.map((emoji) => (
          <button key={emoji} title={t('msg.react', { emoji })} onClick={() => react(emoji)}>
            {emoji}
          </button>
        ))}
        <button title={t('msg.react.more')} onClick={() => setPicking(true)}>
          ☺
        </button>
        <button title={t('msg.reply')} onClick={() => onReply(m)}>
          ↩
        </button>
        {mayDelete && (
          <button title={t('button.delete')} onClick={() => void remove()}>
            🗑
          </button>
        )}
      </div>
      {picking && (
        <EmojiPicker
          onPick={(emoji) => {
            setPicking(false);
            void react(emoji);
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

function Composer({
  space,
  channel,
  post,
  replyTo,
  onCancelReply,
  members,
}: {
  space: SpaceInfo;
  channel: string;
  post?: string;
  replyTo?: MessageInfo;
  onCancelReply(): void;
  members: MemberInfo[];
}) {
  const { t } = useTexts();
  const [text, setText] = useState('');
  const [picking, setPicking] = useState(false);
  const [suggestIndex, setSuggestIndex] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);
  // One file per message: picked here, uploaded when sent (shrunk if it is a picture), taken off with ✕ before.
  const [file, setFile] = useState<File>();
  const [uploading, setUploading] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const pick = (e: ChangeEvent<HTMLInputElement>) => {
    const picked = e.target.files?.[0];
    e.target.value = '';
    if (!picked) return;
    // Pictures shrink before the check; anything else is sent as it is.
    if (!picked.type.startsWith('image/') && picked.size > MAX_FILE) return void toast(t('file.too.big', { name: picked.name }), 'error');
    setFile(picked);
    area.current?.focus();
  };

  useEffect(() => {
    if (replyTo) area.current?.focus();
  }, [replyTo]);

  // @mention suggestions: people here and their agents.
  const names = useMemo(() => {
    const list = new Set<string>();
    for (const m of members) {
      if (m.name) list.add(m.name);
      for (const agent of m.agents) list.add(agent);
    }
    return [...list];
  }, [members]);
  const query = /(?:^|\s)@([\w-]*)$/.exec(text)?.[1];
  const suggestions = query === undefined ? [] : names.filter((n) => n.toLowerCase().startsWith(query.toLowerCase())).slice(0, 6);

  const complete = (name: string) => {
    setText((t) => t.replace(/@([\w-]*)$/, `@${name} `));
    setSuggestIndex(0);
    area.current?.focus();
  };

  const send = async () => {
    const message = text.trim();
    if ((!message && !file) || uploading) return;
    let attachment: Attachment | undefined;
    if (file) {
      setUploading(true);
      attachment = await attempt(() => uploadFile(file));
      setUploading(false);
      if (!attachment) return; // the file stays in the composer, the error said why
    }
    setText('');
    setFile(undefined);
    onCancelReply();
    const where = post ? { post } : { space: space.id, channel };
    const sent = await attempt(() => api('say', { ...where, text: message, replyTo: replyTo?.id, ...(attachment ? { file: attachment } : {}) }));
    if (sent === undefined) {
      // Keep it all if sending failed.
      setText(message);
      setFile(file);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (suggestions.length) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        setSuggestIndex((i) => (i + (e.key === 'ArrowDown' ? 1 : suggestions.length - 1)) % suggestions.length);
        return;
      }
      if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
        e.preventDefault();
        complete(suggestions[suggestIndex] ?? suggestions[0]);
        return;
      }
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    } else if (e.key === 'Escape' && replyTo) {
      onCancelReply();
    }
  };

  return (
    <div className="composer-wrap">
      {replyTo && (
        <div className="replying">
          {t('msg.replying')} <b>{replyTo.by.name ?? t('word.someone.lc')}</b>
          <span className="reply-text">{plain(replyTo.text) || fileLine(replyTo.file)}</span>
          <button onClick={onCancelReply} title={t('msg.reply.cancel')}>
            ✕
          </button>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="suggest">
          {suggestions.map((name, i) => (
            <button key={name} className={i === suggestIndex ? 'on' : ''} onMouseDown={(e) => (e.preventDefault(), complete(name))}>
              @{name}
            </button>
          ))}
        </div>
      )}
      {file && <AttachedChip file={file} uploading={uploading} onRemove={() => setFile(undefined)} />}
      <div className={`composer${replyTo || file ? ' with-reply' : ''}`}>
        <input ref={fileInput} type="file" hidden onChange={pick} />
        <button className="emoji-btn attach-btn" title={t('msg.attach')} disabled={uploading} onClick={() => fileInput.current?.click()}>
          <Icon name="attachment" />
        </button>
        <textarea
          ref={area}
          rows={1}
          value={text}
          placeholder={file ? t('msg.placeholder.file', { name: file.name }) : post ? t('msg.placeholder.post') : space.kind === 'direct' ? t('msg.placeholder.direct', { name: space.name }) : t('msg.placeholder.channel', { channel })}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
        />
        <button className="emoji-btn" title={t('msg.emoji')} onClick={() => setPicking((p) => !p)}>
          <Icon name="emoji" />
        </button>
      </div>
      <CharCount length={text.length} max={TEXT_LIMITS.text} onlyNear />
      {picking && (
        <EmojiPicker
          onPick={(emoji) => {
            setText((t) => t + emoji);
            setPicking(false);
            area.current?.focus();
          }}
          onClose={() => setPicking(false)}
        />
      )}
    </div>
  );
}

/**
 * A Discord-style chat: grouped messages, reactions, replies, @mentions and a
 * virtualized history. Either a channel of a space, or the chat of one post.
 */
export function ChatView({ space, channel = 'general', post, meDid, meName, members }: { space: SpaceInfo; channel?: string; post?: string; meDid: string; meName?: string; members: MemberInfo[] }) {
  const { data: messages } = useApi(
    () => api<MessageInfo[]>('messages', post ? null : space.id, post ? { post, limit: 1000 } : { channel, limit: 1000 }),
    [space.id, channel, post],
  );
  const seenKey = post ? `post/${post}` : `${space.id}/${channel}`;
  const { t } = useTexts();
  const [replyTo, setReplyTo] = useState<MessageInfo>();
  const [scroller, setScroller] = useState<HTMLDivElement | null>(null);
  const stuck = useStickToBottom(scroller);
  const rows = useMemo(() => toRows(messages ?? []), [messages]);
  const mentionNames = useMemo(() => {
    const mine = members.find((m) => m.did === meDid);
    return [meName, ...(mine?.agents ?? [])].filter((n): n is string => !!n);
  }, [members, meDid, meName]);
  const moderating = space.kind !== 'direct' && !!members.find((m) => m.did === meDid)?.maintainer;

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller,
    estimateSize: (i) => {
      if (rows[i]?.kind === 'day') return 44;
      const row = rows[i] as Extract<Row, { kind: 'msg' }>;
      return (row.compact ? 26 : 62) + (row.m.file ? (isImage(row.m.file.type) ? 240 : 40) : 0);
    },
    overscan: 12,
    getItemKey: (i) => rows[i].key,
  });

  // New messages keep the view pinned to the bottom, unless the reader scrolled up.
  useLayoutEffect(() => {
    if (!rows.length || !stuck.current) return;
    virtualizer.scrollToIndex(rows.length - 1, { align: 'end' });
    const frame = requestAnimationFrame(() => virtualizer.scrollToIndex(rows.length - 1, { align: 'end' }));
    return () => cancelAnimationFrame(frame);
  }, [rows.length, virtualizer, stuck]);

  useEffect(() => {
    const last = messages?.at(-1);
    if (last) markSeen(seenKey, last.time);
  }, [messages, seenKey]);

  useEffect(() => {
    setReplyTo(undefined);
    stuck.current = true;
  }, [seenKey, stuck]);

  return (
    <div className="chat">
      <div className="chat-scroll" ref={setScroller}>
        {messages && rows.length === 0 && (
          <div className="channel-intro">
            {space.kind === 'direct' ? (
              <>
                <h2>{space.name}</h2>
                <p className="muted">{t('chat.intro.direct', { name: space.name })}</p>
              </>
            ) : post ? (
              <p className="muted">{t('chat.intro.post', { who: space.kind, name: space.name })}</p>
            ) : (
              <>
                <h2>{t('chat.intro.welcome', { channel })}</h2>
                <p className="muted">{t('chat.intro.channel', { channel, name: space.name, who: space.kind })}</p>
              </>
            )}
          </div>
        )}
        <div className="virtual" style={{ height: virtualizer.getTotalSize() }}>
          {virtualizer.getVirtualItems().map((item) => {
            const row = rows[item.index];
            return (
              <div key={item.key} data-index={item.index} ref={virtualizer.measureElement} className="virtual-row" style={{ transform: `translateY(${item.start}px)` }}>
                {row.kind === 'day' ? (
                  <div className="day-sep">
                    <span>{row.label}</span>
                  </div>
                ) : (
                  <Message row={row} meDid={meDid} mentionNames={mentionNames} onReply={setReplyTo} moderating={moderating} space={space} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      <Composer space={space} channel={channel} post={post} replyTo={replyTo} onCancelReply={() => setReplyTo(undefined)} members={members} />
    </div>
  );
}
