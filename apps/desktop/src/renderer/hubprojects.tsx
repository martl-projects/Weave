import { useState } from 'react';
import type { AppManifest, MemberInfo, ProjectInfo, SpaceInfo, TierInfo } from '@weave/node/client';
import { Icon } from './icons.tsx';
import { api, bump, navigate, shortDid, useApi } from './lib.ts';
import { attempt, Markdown, Modal, ProjectIcon } from './ui.tsx';
import { T, useTexts } from './texts.tsx';

/*
 * The projects box on your own hub: every project you maintain, not only the
 * public ones visitors see. Private ones are marked, and each one can show
 * who may see and do what.
 */

function PermissionsDialog({ project, onClose }: { project: ProjectInfo; onClose(): void }) {
  const { t } = useTexts();
  const { data: info } = useApi(() => api<ProjectInfo>('project', project.id), [project.id]);
  const { data: members } = useApi(() => api<MemberInfo[]>('members', project.id), [project.id]);
  const { data: app } = useApi(() => api<AppManifest | null>('projectApp', project.id), [project.id]);
  const { data: tiers } = useApi(() => api<TierInfo[]>('tiers'), []);
  const p = info ?? project;
  const tierOf = (groupId: string) => tiers?.find((tier) => tier.id === groupId);
  const how = (m: MemberInfo) => (m.maintainer ? t('role.maintainer') : m.via ? t('member.how.via', { group: m.via.name }) : m.invitedByName ? t('member.how.invited', { name: m.invitedByName }) : t('role.founder'));
  return (
    <Modal title={t('perm.title', { project: p.name })} onClose={onClose} wide>
      <fieldset>
        <legend>{t('perm.who.sees.page')}</legend>
        <div className="field-row">
          <input
            id="perm-public"
            type="checkbox"
            checked={p.page.public}
            disabled={!p.maintainer}
            onChange={(e) => attempt(() => api('setProjectPage', { project: p.id, public: e.target.checked }).then(bump), t(e.target.checked ? 'perm.page.public.now' : 'perm.page.private.now'))}
          />
          <label htmlFor="perm-public">{t('perm.public.label')}</label>
        </div>
        <p className="small">{t('perm.always.participants')}</p>
      </fieldset>
      <fieldset>
        <legend>{t('perm.who.takes.part', { n: members?.length ?? p.members })}</legend>
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
        <legend>{t('perm.how.get.in')}</legend>
        <ul className="perm-list">
          <li>{t('perm.invite.links', { names: p.maintainers.map((m) => m.name ?? shortDid(m.did)).join(', ') })}</li>
          {p.groups.map((g) => {
            const tier = tierOf(g.id);
            return (
              <li key={g.id}>
                <T name={tier ? 'perm.tier' : 'perm.group'} values={{ name: <b>{g.name}</b> }} />
                {tier && t('perm.tier.detail', { price: tier.price ? `${(tier.price / 100).toFixed(2)} ${tier.currency}` : '', free: tier.price ? 'paid' : 'free', auto: tier.auto ? 'auto' : 'granted' })}
                {': '}
                {t(g.auto ? 'perm.group.auto' : 'perm.group.asked')}
              </li>
            );
          })}
          {p.groups.length === 0 && <li className="muted">{t('perm.no.groups')}</li>}
        </ul>
      </fieldset>
      {app && (
        <fieldset>
          <legend>{t('perm.live.app')}</legend>
          <p className="small">
            <T name="perm.live.app.note" values={{ app: <b>{app.name}</b>, ports: app.services.map((s) => t('perm.port', { port: s.port })).join(', ') }} />
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
          {t('perm.open.settings')}
        </button>
        <button className="default" onClick={onClose}>
          {t('button.close')}
        </button>
      </div>
    </Modal>
  );
}

/** Your own hub's projects box: all projects you maintain, private ones marked. */
export function MyProjects({ name }: { name: string }) {
  const { t } = useTexts();
  const { data: spaces } = useApi(() => api<SpaceInfo[]>('spaces', 'project'), []);
  const ids = (spaces ?? []).map((s) => s.id).join();
  const { data: projects } = useApi(() => Promise.all((spaces ?? []).map((s) => api<ProjectInfo>('project', s.id))), [ids]);
  const [inspecting, setInspecting] = useState<ProjectInfo>();
  const mine = (projects ?? []).filter((p) => p.maintainer);
  if (!mine.length) return null;
  return (
    <section className="space-box">
      <h3>{t('hub.projects.of', { name })}</h3>
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
                <span className="tag friend">{t('hub.project.public')}</span>
              ) : (
                <span className="tag" title={t('hub.project.private.title')}>
                  <Icon name="lock" size={10} /> {t('hub.project.private')}
                </span>
              )}
              {project.page.description && <Markdown text={project.page.description} />}
            </div>
            <button onClick={() => setInspecting(project)}>{t('hub.permissions')}</button>
          </article>
        ))}
      </div>
      {inspecting && <PermissionsDialog project={inspecting} onClose={() => setInspecting(undefined)} />}
    </section>
  );
}
