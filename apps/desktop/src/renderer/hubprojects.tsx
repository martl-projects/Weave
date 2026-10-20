import { useState } from 'react';
import type { AppManifest, MemberInfo, ProjectInfo, SpaceInfo, TierInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bump, navigate, shortDid, useApi } from './lib.ts';
import { attempt, Markdown, Modal, ProjectIcon } from './ui.tsx';

/*
 * The projects box on your own hub: every project you maintain, not only the
 * public ones visitors see. Private ones are marked, and each one can show
 * who may see and do what.
 */

function PermissionsDialog({ project, onClose }: { project: ProjectInfo; onClose(): void }) {
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: members } = useApi(() => api<MemberInfo[]>('members', project.id), [project.id]);
  const { data: app } = useApi(() => api<AppManifest | null>('projectApp', project.id), [project.id]);
  const { data: tiers } = useApi(() => api<TierInfo[]>('tiers'), []);
  const p = info ?? project;
  const tierOf = (groupId: string) => tiers?.find((t) => t.id === groupId);
  const how = (m: MemberInfo) => (m.maintainer ? 'maintainer' : m.via ? `via ${m.via.name}` : m.invitedByName ? `invited by ${m.invitedByName}` : 'founder');
  return (
    <Modal title={`Permissions · p/${p.name}`} onClose={onClose} wide>
      <fieldset>
        <legend>Who can see the project page</legend>
        <div className="field-row">
          <input
            id="perm-public"
            type="checkbox"
            checked={p.page.public}
            disabled={!p.maintainer}
            onChange={(e) => attempt(() => api('setProjectPage', { project: p.id, public: e.target.checked }).then(bump), e.target.checked ? 'The page is public now' : 'The page is private now')}
          />
          <label htmlFor="perm-public">Public: name, status and description show on your hub for everyone</label>
        </div>
        <p className="small">Always only for participants, public page or not: chat, boards, votes and live rooms. Everything inside is end-to-end encrypted.</p>
      </fieldset>
      <fieldset>
        <legend>Who takes part ({members?.length ?? p.members})</legend>
        <table className="perm-table">
          <tbody>
            {(members ?? []).map((m) => (
              <tr key={m.did}>
                <td>{m.name ?? shortDid(m.did)}</td>
                <td className="small">{how(m)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </fieldset>
      <fieldset>
        <legend>How people get in</legend>
        <ul className="perm-list">
          <li>Invite links from maintainers ({p.maintainers.map((m) => m.name ?? shortDid(m.did)).join(', ')})</li>
          {p.groups.map((g) => {
            const tier = tierOf(g.id);
            return (
              <li key={g.id}>
                {tier ? 'Tier' : 'Group'} <b>{g.name}</b>
                {tier && ` (${tier.price ? `${(tier.price / 100).toFixed(2)} ${tier.currency}/month` : 'free'}${tier.auto ? ', lets people in automatically' : ', you grant it'})`}
                {': '}
                {g.auto ? 'its members join this project automatically' : 'you are asked about each newcomer'}
              </li>
            );
          })}
          {p.groups.length === 0 && <li className="muted">No groups or tiers invited.</li>}
        </ul>
      </fieldset>
      {app && (
        <fieldset>
          <legend>Live app</legend>
          <p className="small">
            <b>{app.name}</b> can be shared in rooms; a room forwards only {app.services.map((s) => `port ${s.port}`).join(', ')} on the host's computer, and only to the people the host lets in.
          </p>
        </fieldset>
      )}
      <div className="buttons">
        <button
          onClick={() => {
            onClose();
            navigate(`#/p/${p.id}/settings`);
          }}
        >
          Open settings
        </button>
        <button className="default" onClick={onClose}>
          Close
        </button>
      </div>
    </Modal>
  );
}

/** Your own hub's projects box: all projects you maintain, private ones marked. */
export function MyProjects({ name }: { name: string }) {
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces', 'project'), []);
  const ids = (spaces ?? []).map((s) => s.id).join();
  const { data: projects } = useApi(() => Promise.all((spaces ?? []).map((s) => api<ProjectInfo>('project', s.id))), [ids]);
  const [inspecting, setInspecting] = useState<ProjectInfo>();
  const mine = (projects ?? []).filter((p) => p.maintainer);
  if (!mine.length) return null;
  return (
    <section className="space-box">
      <h3>{name}'s projects</h3>
      <div className="showcase">
        {mine.map((project) => (
          <article className="showcase-item" key={project.id}>
            <ProjectIcon id={project.id} icon={project.page.icon} size={48} />
            <div className="grow">
              <a href={`#/p/${project.id}`}>
                <b>{project.name}</b>
              </a>{' '}
              <span className={`tag status-${project.page.status}`}>{project.page.status}</span>{' '}
              {project.page.public ? (
                <span className="tag friend">public</span>
              ) : (
                <span className="tag" title="Visitors of your hub don't see this project">
                  <Icon name="lock" size={10} /> private · only you see it here
                </span>
              )}
              {project.page.description && <Markdown text={project.page.description} />}
            </div>
            <button onClick={() => setInspecting(project)}>Permissions…</button>
          </article>
        ))}
      </div>
      {inspecting && <PermissionsDialog project={inspecting} onClose={() => setInspecting(undefined)} />}
    </section>
  );
}
