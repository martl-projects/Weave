import { useEffect, useState } from 'react';
import { allows, areaOfPost } from '@weave/core';
import type { AgentScope, AgentTokenInfo, BoardInfo, ChatInfo, SessionInfo, SpaceInfo, Whoami } from '@weave/node/client';
import { GroupIcon } from './avatar-editor.tsx';
import { Icon } from './icons.tsx';
import { api, bridge, bump, useApi } from './lib.ts';
import { SessionMap } from './sessions.tsx';
import { attempt, Avatar, Modal, ProjectIcon, Sprite } from './ui.tsx';
import { useTexts } from './texts.tsx';

/*
 * The Sessions view by machine and agent key (issue 4Vxe): a frame for each machine with the key its sessions act with,
 * the sessions inside, and beside them the spaces that key may use. This computer's sessions act with the daemon, which
 * may use everything; a machine connected with an agent key uses only the spaces given to that key, each with what it
 * may read and write there (Add a space). A key with no space given yet may use every space, as before.
 */

interface Frame {
  key: string;
  /** The machine's name; "" for this computer. */
  machine: string;
  kind: 'local' | 'remote' | 'token';
  host?: string;
  /** The agent key its sessions act with; none: this computer's daemon (every right). */
  agent?: string;
  sessions: SessionInfo[];
}

/** Sessions into frames: by the token's agent and machine, else by the Claude app's machine (this computer or a remote one). */
function framesOf(sessions: SessionInfo[], tokens: AgentTokenInfo[]): Frame[] {
  const frames = new Map<string, Frame>();
  const add = (f: Omit<Frame, 'sessions'>) => frames.get(f.key) ?? frames.set(f.key, { ...f, sessions: [] }).get(f.key)!;
  add({ key: 'local', machine: '', kind: 'local' });
  for (const s of sessions) {
    const frame = s.agent
      ? add({ key: `token:${s.agent}:${s.machine?.name ?? ''}`, machine: s.machine?.name ?? '', kind: 'token', agent: s.agent })
      : s.machine && s.machine.id !== 'local'
        ? add({ key: s.machine.id, machine: s.machine.name, kind: 'remote', ...(s.machine.host ? { host: s.machine.host } : {}) })
        : frames.get('local')!;
    frame.sessions.push(s);
  }
  for (const line of tokens) add({ key: `token:${line.agent}:${line.machine}`, machine: line.machine, kind: 'token', agent: line.agent });
  return [...frames.values()];
}

export function MachineFrames({ sessions, spaces, onNew }: { sessions: SessionInfo[]; spaces: SpaceInfo[]; onNew?(project?: string): void }) {
  const { t } = useTexts();
  const { data: tokens } = useApi(() => api<AgentTokenInfo[]>('agentTokens'), []);
  const agents = [...new Set((tokens ?? []).map((l) => l.agent))];
  const { data: scopes } = useApi(async () => Object.fromEntries(await Promise.all(agents.map(async (a) => [a, await api<AgentScope | undefined>('agentScope', a)] as const))), [agents.join('\n')]);
  const { data: chats } = useApi(() => api<ChatInfo[]>('chats'), []);
  const projects = spaces.filter((s) => s.kind === 'project' && !s.closed);
  const [editing, setEditing] = useState<{ agent: string; space?: string }>();
  const [connecting, setConnecting] = useState(false);

  /** A space of a scope by id: a group or project, or a friend's direct chat. */
  const spaceName = (id: string) => spaces.find((s) => s.id === id)?.name ?? chats?.find((c) => c.space.id === id)?.peer.name ?? id.slice(0, 8);

  return (
    <div className="machine-frames">
      {framesOf(sessions, tokens ?? []).map((frame) => {
        const scope = frame.agent ? scopes?.[frame.agent] : undefined;
        const allowed = scope ? projects.filter((p) => scope.spaces[p.id]) : projects;
        const others = scope ? Object.keys(scope.spaces).filter((id) => !projects.some((p) => p.id === id)) : [];
        const title = frame.kind === 'local' ? t('machine.this.computer') : frame.machine || t('machine.unnamed');
        return (
          <section key={frame.key} className={`machine-frame ${frame.kind}`}>
            <div className="machine-head">
              <b>{title}</b>
              {frame.host && <span className="small muted">{frame.host}</span>}
              <span className="grow small muted">
                {frame.agent ? t('machine.key', { agent: frame.agent }) : frame.kind === 'local' ? t('machine.daemon') : t('machine.no.key')}
              </span>
              {frame.agent && (
                <button className="small" title={t('machine.disconnect.title', { agent: frame.agent, machine: title })} onClick={() => void attempt(() => api('revokeAgentMachine', { name: frame.agent, machine: frame.machine }).then(bump), t('machine.disconnected', { machine: title }))}>
                  {t('machine.disconnect')}
                </button>
              )}
            </div>
            <SessionMap
              sessions={frame.sessions}
              projects={allowed}
              onNew={frame.kind === 'local' ? onNew : undefined}
              head={frame.agent ? t('machine.may.use') : undefined}
              {...(frame.agent && scope ? { onProject: (id: string) => setEditing({ agent: frame.agent!, space: id }), projectTitle: (name: string) => t('machine.rights.of', { space: name }) } : {})}
              foot={
                frame.agent && (
                  <div className="machine-spaces">
                    {!scope && <div className="small muted">{t('machine.all.spaces')}</div>}
                    {others.map((id) => (
                      <button key={id} className="machine-space" onClick={() => setEditing({ agent: frame.agent!, space: id })}>
                        <SpaceIcon id={id} spaces={spaces} chats={chats ?? []} /> {spaceName(id)}
                      </button>
                    ))}
                    <button className="machine-space add" onClick={() => setEditing({ agent: frame.agent! })}>
                      <Icon name="plus" /> {t('machine.add.space')}
                    </button>
                  </div>
                )
              }
            />
          </section>
        );
      })}
      {bridge.connectAgent && (
        <button className="machine-frame connect" onClick={() => setConnecting(true)}>
          <Icon name="plus" /> {t('machine.connect')}
        </button>
      )}
      {editing && <SpaceRightsDialog agent={editing.agent} space={editing.space} scope={scopes?.[editing.agent]} spaces={spaces} chats={chats ?? []} onClose={() => setEditing(undefined)} />}
      {connecting && <ConnectDialog onClose={() => setConnecting(false)} />}
    </div>
  );
}

/** A space's picture: a friend's avatar, a group's photo, a project's icon, or the sprite its id makes. */
function SpaceIcon({ id, spaces, chats, size = 16 }: { id: string; spaces: SpaceInfo[]; chats: ChatInfo[]; size?: number }) {
  const chat = chats.find((c) => c.space.id === id);
  const space = spaces.find((s) => s.id === id);
  if (chat) return <Avatar did={chat.peer.did} size={size} />;
  if (space?.kind === 'group') return <GroupIcon space={space} size={size} />;
  if (space?.icon) return <ProjectIcon id={space.id} icon={space.icon} size={size} />;
  return <Sprite seed={id} size={size} />;
}

/** A row of the rights dialog: the chat, or one board by name. */
type Row = 'chat' | `board:${string}`;

/** What a key may read and write in one space: pick the space (when adding), then board by board, and the chat. */
function SpaceRightsDialog({ agent, space, scope, spaces, chats, onClose }: { agent: string; space?: string; scope?: AgentScope; spaces: SpaceInfo[]; chats: ChatInfo[]; onClose(): void }) {
  const { t } = useTexts();
  const choices = [
    ...spaces.filter((s) => (s.kind === 'project' || s.kind === 'group') && !s.closed).map((s) => ({ id: s.id, name: s.name, kind: s.kind as string })),
    ...chats.filter((c) => c.friend).map((c) => ({ id: c.space.id, name: c.peer.name ?? c.peer.did.slice(8, 20), kind: 'person' })),
  ].filter((c) => c.id === space || !scope?.spaces[c.id]);
  const [chosen, setChosen] = useState(space ?? '');
  const isChat = chats.some((c) => c.space.id === chosen);
  const { data: boards } = useApi(() => (chosen && !isChat ? api<BoardInfo[]>('boards', chosen) : Promise.resolve([] as BoardInfo[])), [chosen, isChat]);
  const rows: Array<{ row: Row; label: string; board?: BoardInfo }> = [...(boards ?? []).map((b) => ({ row: `board:${b.name}` as Row, label: b.title || b.name, board: b })), { row: 'chat' as Row, label: t('machine.area.chat') }];
  const [read, setRead] = useState<Set<Row>>(new Set());
  const [write, setWrite] = useState<Set<Row>>(new Set());
  // What it may do now, row by row (a key given areas before boards counts by area); a new space: read everything, write ideas.
  useEffect(() => {
    if (!chosen || (!isChat && !boards)) return;
    const was = scope?.spaces[chosen];
    const may = (r: (typeof rows)[number], how: 'read' | 'write') =>
      was ? (r.row === 'chat' ? allows(scope, chosen, 'chat', how) : allows(scope, chosen, areaOfPost({ type: r.board?.type === 'issues' ? 'issue' : r.board?.type === 'proposals' ? 'proposal' : 'post', board: r.board?.name }), how, r.board?.name)) : how === 'read' ? true : r.row === 'board:ideas';
    setRead(new Set(rows.filter((r) => may(r, 'read')).map((r) => r.row)));
    setWrite(new Set(rows.filter((r) => may(r, 'write')).map((r) => r.row)));
  }, [chosen, isChat, boards]);
  const flip = (set: Set<Row>, setter: (s: Set<Row>) => void, row: Row) => {
    const next = new Set(set);
    if (next.has(row)) next.delete(row);
    else next.add(row);
    setter(next);
  };
  const name = choices.find((c) => c.id === chosen)?.name ?? '';
  const shown = new Set(rows.map((r) => r.row));
  const save = () =>
    void attempt(
      () => api('setAgentScope', { name: agent, space: chosen, access: { read: [...read, ...write].filter((r) => shown.has(r)), write: [...write].filter((r) => shown.has(r)) } }).then(() => (bump(), onClose())),
      t('machine.rights.saved', { agent, space: name }),
    );
  const remove = () => void attempt(() => api('setAgentScope', { name: agent, space: chosen, access: null }).then(() => (bump(), onClose())), t('machine.rights.removed', { agent, space: name }));
  return (
    <Modal title={space ? t('machine.rights.title', { agent, space: name }) : t('machine.add.title', { agent })} subtitle={t('machine.rights.about')} onClose={onClose}>
      {!space && (
        <label className="field">
          {t('machine.space.pick')}
          <select value={chosen} onChange={(e) => setChosen(e.target.value)}>
            <option value="">{t('machine.space.choose')}</option>
            {(['project', 'group', 'person'] as const).map((kind) => {
              const list = choices.filter((c) => c.kind === kind);
              return (
                list.length > 0 && (
                  <optgroup key={kind} label={t(`machine.kind.${kind}`)}>
                    {list.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </optgroup>
                )
              );
            })}
          </select>
        </label>
      )}
      {chosen && (
        <table className="rights">
          <thead>
            <tr>
              <th className="rights-space">
                <SpaceIcon id={chosen} spaces={spaces} chats={chats} size={20} /> {name}
              </th>
              <th>{t('machine.read')}</th>
              <th>{t('machine.write')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ row, label, board }) => (
              <tr key={row}>
                <td>
                  {label}
                  {board && board.type !== 'posts' && board.name !== board.type && <span className="small muted"> · {t(`machine.board.${board.type}`)}</span>}
                </td>
                <td>
                  <input type="checkbox" id={`read-${row}`} checked={read.has(row) || write.has(row)} disabled={write.has(row)} onChange={() => flip(read, setRead, row)} />
                  <label htmlFor={`read-${row}`} title={`${label}: ${t('machine.read')}`} />
                </td>
                <td>
                  <input type="checkbox" id={`write-${row}`} checked={write.has(row)} onChange={() => flip(write, setWrite, row)} />
                  <label htmlFor={`write-${row}`} title={`${label}: ${t('machine.write')}`} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {!scope && chosen && <p className="small">{t('machine.first.space')}</p>}
      <div className="buttons">
        {space && <button onClick={remove}>{t('machine.rights.remove')}</button>}
        <span className="grow" />
        <button onClick={onClose}>{t('button.cancel')}</button>
        <button className="default" disabled={!chosen} onClick={save}>
          {space ? t('button.save') : t('machine.give')}
        </button>
      </div>
    </Modal>
  );
}

/** Connect a machine: pick the agent key and name the machine; the app asks once more, then shows the token and how to use it, once. */
function ConnectDialog({ onClose }: { onClose(): void }) {
  const { t } = useTexts();
  const { data: me } = useApi(() => api<Whoami>('whoami'), []);
  const agents = (me?.agents ?? []).filter((a) => !a.node);
  const [agent, setAgent] = useState('');
  const [machine, setMachine] = useState('');
  const [token, setToken] = useState<string>();
  const [error, setError] = useState<string>();
  const connect = async () => {
    setError(undefined);
    const answer = await bridge.connectAgent!({ agent, machine });
    if (answer.cancelled) return;
    if (answer.error || !answer.result?.token) return setError(answer.error ?? t('machine.connect.failed'));
    setToken(answer.result.token);
    bump();
  };
  // How the VM reaches this computer's agent API: directly (LAN, Tailscale, WireGuard; the usual way with Remote
  // Control, where you start Claude Code on the VM yourself), or through an SSH tunnel from here.
  const [way, setWay] = useState<'direct' | 'ssh'>('direct');
  const [address, setAddress] = useState('');
  const host = machine.trim() || 'my-vm';
  const api_ = way === 'ssh' ? 'http://127.0.0.1:7712' : `http://${address.trim() || '<this-computer>'}:7712`;
  const steps = token ? `${way === 'ssh' ? `ssh -R 7712:127.0.0.1:7712 ${host}\n` : ''}claude mcp add weave -- weave mcp --api ${api_} --token ${token}` : '';
  return (
    <Modal title={t('machine.connect.title')} subtitle={token ? t('machine.connect.once') : t('machine.connect.about')} onClose={onClose} wide>
      {!token && (
        <>
          <label className="field">
            {t('machine.connect.agent')}
            <select value={agent} onChange={(e) => setAgent(e.target.value)}>
              <option value="">{t('machine.connect.agent.choose')}</option>
              {agents.map((a) => (
                <option key={a.name} value={a.name}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            {t('machine.connect.machine')}
            <input value={machine} maxLength={80} placeholder={t("machine.connect.machine.example")} onChange={(e) => setMachine(e.target.value)} />
          </label>
          {error && <p className="small error">{error}</p>}
        </>
      )}
      {token && (
        <>
          <div className="field">
            {t('machine.connect.way')}
            <div>
              <input type="radio" id="way-direct" name="way" checked={way === 'direct'} onChange={() => setWay('direct')} />
              <label htmlFor="way-direct">{t('machine.connect.direct')}</label>
            </div>
            <div>
              <input type="radio" id="way-ssh" name="way" checked={way === 'ssh'} onChange={() => setWay('ssh')} />
              <label htmlFor="way-ssh">{t('machine.connect.ssh')}</label>
            </div>
          </div>
          {way === 'direct' && (
            <label className="field">
              {t('machine.connect.address')}
              <input value={address} maxLength={200} placeholder={t('machine.connect.address.example')} onChange={(e) => setAddress(e.target.value)} />
            </label>
          )}
          <pre className="machine-steps">{steps}</pre>
          <ul className="small machine-howto">
            {way === 'ssh' ? (
              <>
                <li>{t('machine.connect.ssh.step1')}</li>
                <li>{t('machine.connect.ssh.step2')}</li>
                <li>{t('machine.connect.ssh.step3')}</li>
              </>
            ) : (
              <>
                <li>{t('machine.connect.direct.step1')}</li>
                <li>{t('machine.connect.direct.step2')}</li>
                <li>{t('machine.connect.direct.step3')}</li>
              </>
            )}
          </ul>
        </>
      )}
      <div className="buttons">
        <span className="grow" />
        {token ? (
          <>
            <button onClick={() => void navigator.clipboard.writeText(steps)}>
              <Icon name="copy" /> {t('machine.connect.copy')}
            </button>
            <button className="default" onClick={onClose}>
              {t('machine.connect.done')}
            </button>
          </>
        ) : (
          <>
            <button onClick={onClose}>{t('button.cancel')}</button>
            <button className="default" disabled={!agent || !machine.trim()} onClick={() => void connect()}>
              {t('machine.connect.make')}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}
