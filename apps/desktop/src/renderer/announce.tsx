import type { ArtifactInfo, MessageInfo, SpaceInfo, WebsiteInfo } from '@weave/node/client';
import { api, navigate, useApi } from './lib.ts';
import { ItemList } from './lists.tsx';

/**
 * Under a message that announces something live (a website opened, a version offered): what it is now, as one row of
 * a list, with its button. It asks itself whether it's still on, so an announcement never points at what's gone.
 */
export function AnnounceCard({ space, announce }: { space: Pick<SpaceInfo, 'id' | 'kind'>; announce: NonNullable<MessageInfo['announce']> }) {
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
          empty="It's closed now."
          rows={
            room
              ? [
                  {
                    key: room.id,
                    icon: 'globe',
                    title: room.name,
                    badge: 'live',
                    detail: room.mayJoin || room.mine ? `running, by ${room.host.name ?? 'its host'}` : 'for ticket holders or a tier only',
                    ...(room.mayJoin || room.mine ? { main: <button className="default" onClick={() => navigate(`#/p/${space.id}/live`)}>Join</button> } : {}),
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
        empty="It isn't offered any more."
        rows={
          a
            ? [
                {
                  key: a.id,
                  icon: a.kind === 'website' ? 'globe' : a.kind === 'file' ? 'folder' : a.kind === 'keyvault' ? 'lock' : 'plug',
                  title: a.name,
                  badge: a.tag,
                  detail: a.mine ? `a ${a.kind.replace('-', ' ')}: get it, start it or add it` : 'only for some here',
                  ...(a.mine ? { main: <button className="default" onClick={() => navigate(`#/p/${space.id}/available`)}>Open</button> } : {}),
                },
              ]
            : []
        }
      />
    </div>
  );
}
