import { useState, type FormEvent } from 'react';
import type { AppManifest, MemberInfo, ProjectInfo, RoomChatMessage, RoomInfo, SpaceInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bridge, bump, clock, shortDid, useApi } from './lib.ts';
import { attempt, AsyncButton, Avatar, Modal } from './ui.tsx';
import { Page } from './views.tsx';

/*
 * Rooms: a host shares the project's app from their computer, players use it
 * through an encrypted tunnel. The ▶ button opens it in its own window; nobody
 * sees an address. Who is in a room and what they say there is never stored.
 */

const play = (room: RoomInfo) => room.url && bridge.openApp(room.url, `${room.app?.name ?? 'App'} · ${room.name}`);

function RoomChat({ room }: { room: RoomInfo }) {
  const { data: messages } = useApi(() => api<RoomChatMessage[]>('roomChat', room.id), [room.id]);
  const [text, setText] = useState('');
  return (
    <div className="room-chat">
      <div className="room-messages sunken">
        {(messages ?? []).map((m) => (
          <div key={m.id} className="room-message">
            <time>{clock(m.time)}</time> <b>{m.mine ? 'You' : (m.by.name ?? shortDid(m.by.did))}</b> {m.text}
          </div>
        ))}
        {messages?.length === 0 && <div className="small muted">Room chat: not stored, gone when the room ends.</div>}
      </div>
      <form
        className="room-say"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const message = text.trim();
          if (!message) return;
          setText('');
          if ((await attempt(() => api('sayInRoom', { room: room.id, text: message }).then(() => true))) === undefined) setText(message);
          bump();
        }}
      >
        <input value={text} placeholder="Say something…" onChange={(e) => setText(e.target.value)} disabled={!room.connected} aria-label="Room chat" />
        <button disabled={!room.connected}>Send</button>
      </form>
    </div>
  );
}

function RoomCard({ room }: { room: RoomInfo }) {
  const label = room.service?.label ?? (room.mine ? 'Open' : 'Play');
  let main;
  if (room.mine)
    main = room.service?.ready ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <span className="waiting">
        <button disabled>Start the app first</button>
        {room.app?.startHint && <span className="small"> {room.app.startHint}</span>}{' '}
        <button onClick={bump}>Check again</button>
      </span>
    );
  else if (!room.joined)
    main = room.mayJoin ? (
      <AsyncButton className="default" onClick={() => attempt(() => api('joinRoom', room.id).then(bump))}>
        Join
      </AsyncButton>
    ) : (
      <span className="small muted">You're not invited to this room.</span>
    );
  else
    main = room.url ? (
      <button className="default play" onClick={() => play(room)}>
        ▶ {label}
      </button>
    ) : (
      <button disabled>Waiting for {room.host.name ?? 'the host'}…</button>
    );
  return (
    <article className="room window">
      <div className="title-bar">
        <div className="title-bar-text">
          {room.name} · {room.app?.name}
        </div>
      </div>
      <div className="window-body">
        <div className="room-head">
          <span className="live-dot" /> {room.mine ? 'You host this room' : `Hosted by ${room.host.name ?? shortDid(room.host.did)}`}
          {room.joined && (
            <span className="room-peers">
              {room.peers.map((p) => (
                <span key={p.did} className="tag" title={p.did}>
                  <Avatar did={p.did} size={12} /> {p.name ?? shortDid(p.did)}
                </span>
              ))}
            </span>
          )}
        </div>
        <div className="room-actions">
          {main}
          <span className="grow" />
          {room.mine ? (
            <AsyncButton onClick={async () => confirm(`End "${room.name}"? Everyone in it is disconnected.`) && attempt(() => api('endRoom', room.id).then(bump), 'Room ended')}>End room</AsyncButton>
          ) : (
            room.joined && <AsyncButton onClick={() => attempt(() => api('leaveRoom', room.id).then(bump))}>Leave</AsyncButton>
          )}
        </div>
        {!room.mine && !room.joined && room.mayJoin && <p className="small muted">Joining connects you directly to {room.host.name ?? 'the host'}'s computer.</p>}
        {room.joined && <RoomChat room={room} />}
      </div>
    </article>
  );
}

function HostDialog({ project, members, meDid, app, onClose }: { project: SpaceInfo; members: MemberInfo[]; meDid: string; app: AppManifest; onClose(): void }) {
  const [name, setName] = useState('');
  const [everyone, setEveryone] = useState(true);
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <Modal title={`Host a room · ${app.name}`} onClose={onClose}>
      <form
        className="form"
        onSubmit={async (e: FormEvent) => {
          e.preventDefault();
          const room = await attempt(() => api<RoomInfo>('hostRoom', { project: project.id, name, invite: everyone ? undefined : picked }), 'Room is open');
          if (room) {
            bump();
            onClose();
          }
        }}
      >
        <div className="field-row-stacked">
          <label htmlFor="room-name">Name</label>
          <input id="room-name" autoFocus maxLength={60} placeholder="Saturday show" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <p className="small">
          Shares <b>{app.name}</b> from this computer (port {app.services[0].port}). Only that port; nothing else on your computer.
        </p>
        <fieldset>
          <legend>Who may join</legend>
          <div className="field-row">
            <input id="who-all" type="radio" checked={everyone} onChange={() => setEveryone(true)} />
            <label htmlFor="who-all">Everyone in p/{project.name}</label>
          </div>
          <div className="field-row">
            <input id="who-some" type="radio" checked={!everyone} onChange={() => setEveryone(false)} />
            <label htmlFor="who-some">Only…</label>
          </div>
          {!everyone &&
            members
              .filter((m) => m.did !== meDid)
              .map((m) => (
                <div className="field-row indent" key={m.did}>
                  <input id={`who-${m.did}`} type="checkbox" checked={picked.includes(m.did)} onChange={(e) => setPicked((p) => (e.target.checked ? [...p, m.did] : p.filter((x) => x !== m.did)))} />
                  <label htmlFor={`who-${m.did}`}>{m.name ?? shortDid(m.did)}</label>
                </div>
              ))}
        </fieldset>
        <div className="buttons">
          <button type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="default" disabled={!everyone && picked.length === 0}>
            Open room
          </button>
        </div>
      </form>
    </Modal>
  );
}

function PublishApp({ project }: { project: SpaceInfo }) {
  const [text, setText] = useState('');
  return (
    <fieldset>
      <legend>Publish the project's app</legend>
      <p className="small">
        Paste the app's <code>weave.app.json</code>: the ports a room may share and what host and players open. (Or: <code>weave app publish -p "{project.name}"</code> in the app's folder.)
      </p>
      <textarea className="wide code" rows={8} spellCheck={false} value={text} onChange={(e) => setText(e.target.value)} placeholder={'{\n  "app": "my-app",\n  "name": "My App",\n  "services": [{ "id": "web", "port": 3000, "open": { "host": { "path": "/", "label": "Open" }, "joiner": { "path": "/", "label": "Play" } } }]\n}'} />
      <div className="buttons">
        <AsyncButton
          className="default"
          onClick={() =>
            attempt(async () => {
              let manifest: unknown;
              try {
                manifest = JSON.parse(text);
              } catch {
                throw new Error("that isn't valid JSON");
              }
              await api('publishApp', { project: project.id, manifest });
              bump();
            }, 'App published')
          }
        >
          Publish
        </AsyncButton>
      </div>
    </fieldset>
  );
}

export function RoomsView({ project, members, meDid }: { project: SpaceInfo; members: MemberInfo[]; meDid: string }) {
  const { data: rooms } = useApi(() => api<RoomInfo[]>('rooms', project.id), [project.id]);
  const { data: app } = useApi(() => api<AppManifest | null>('projectApp', project.id), [project.id]);
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const [hosting, setHosting] = useState(false);
  return (
    <Page
      title={<><Icon name="zap" /> Live · p/{project.name}</>}
      actions={
        app && (
          <button onClick={() => setHosting(true)}>
            <Icon name="plus" /> Host room…
          </button>
        )
      }
    >
      {app === null && (info?.maintainer ? <PublishApp project={project} /> : <p className="empty">This project has no app to share yet; its maintainers can publish one.</p>)}
      {app && (
        <p className="small">
          <b>{app.name}</b> runs on the host's computer; players use it through an encrypted tunnel. Who's in a room and what's said there is never stored.
        </p>
      )}
      {(rooms ?? []).map((room) => (
        <RoomCard key={room.id} room={room} />
      ))}
      {app && rooms?.length === 0 && <p className="empty">No open rooms. Host one to share {app.name}.</p>}
      {hosting && app && <HostDialog project={project} members={members} meDid={meDid} app={app} onClose={() => setHosting(false)} />}
    </Page>
  );
}
