import type { ArtifactInfo, MessageInfo, SpaceInfo, WebsiteInfo } from '@weave/node/client';
import { api, navigate, useApi } from './lib.ts';
import { ItemList } from './lists.tsx';
import { useTexts } from './texts.tsx';

/**
 * Under a message that announces something live (a website opened, a version offered): what it is now, as one row of
 * a list, with its button. It asks itself whether it's still on, so an announcement never points at what's gone.
 */
export function AnnounceCard({ space, announce }: { space: Pick<SpaceInfo, 'id' | 'kind'>; announce: NonNullable<MessageInfo['announce']> }) {
  const { t } = useTexts();
  const website = announce.kind === 'website';
  const { data: rooms } = useApi(() => (website ? api<WebsiteInfo[]>('websites', space.id) : Promise.resolve([] as WebsiteInfo[])).catch(() => [] as WebsiteInfo[]), [space.id, announce.id]);
  const { data: artifacts } = useApi(() => (!website ? api<ArtifactInfo[]>('artifacts', space.id) : Promise.resolve([] as ArtifactInfo[])).catch(() => [] as ArtifactInfo[]), [space.id, announce.id]);
  if (space.kind !== 'project') return null;
  if (website) {
    // The website, or the one its service hosts (a release launched as a website).
    const room = rooms?.find((r) => r.id === announce.id || r.offeredBy?.did === announce.id);
    if (!rooms) return null;
    return (
      <div className="announce-card">
        <ItemList
          title=""
          empty={t('announce.closed')}
          rows={
            room
              ? [
                  {
                    key: room.id,
                    icon: 'globe',
                    title: room.name,
                    badge: t('announce.live'),
                    detail: room.mayJoin || room.mine ? t('announce.running.by', { host: room.host.name ?? t('announce.its.host') }) : t('announce.ticket.holders'),
                    ...(room.mayJoin || room.mine
                      ? {
                          main: (
                            <button className="default" onClick={() => navigate(`#/p/${space.id}/live`)}>
                              {t('announce.join')}
                            </button>
                          ),
                        }
                      : {}),
                  },
                ]
              : []
          }
        />
      </div>
    );
  }
  const a = artifacts?.find((x) => x.id === announce.id);
  if (!artifacts) return null;
  return (
    <div className="announce-card">
      <ItemList
        title=""
        empty={t('announce.not.offered')}
        rows={
          a
            ? [
                {
                  key: a.id,
                  icon: a.kind === 'website' ? 'globe' : a.kind === 'file' ? 'folder' : a.kind === 'keyvault' ? 'lock' : 'plug',
                  title: a.name,
                  badge: a.tag,
                  detail: a.mine ? t('announce.get.it', { kind: a.kind.replace('-', ' ') }) : t('announce.only.some'),
                  ...(a.mine
                    ? {
                        main: (
                          <button className="default" onClick={() => navigate(`#/p/${space.id}/available`)}>
                            {t('announce.open')}
                          </button>
                        ),
                      }
                    : {}),
                },
              ]
            : []
        }
      />
    </div>
  );
}
