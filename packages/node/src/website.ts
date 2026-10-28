import { hostsWebsites } from './services.ts';
import { b64u, showOpen, KIND_ROOM, parsePages, type RoomPages, randomBytes, roomsOf, sealFor, type Did, type Json, type Room, type SpaceState } from '@weave/core';
import { roomKeyPair } from '@weave/net';
import { type AppEnv, type AppPerson, type HostedWebsiteInfo, type WebsiteChatMessage, type WebsiteInfo } from './backend.ts';
import { createHash, createHmac } from 'node:crypto';
import { portOpen } from './live.ts';
import { type AgentKey } from './keystore.ts';
import { AppApiError, sameToken, startAppApi, type AppApiServer } from './appapi.ts';
import { type StoredSpace } from './spacestore.ts';
import type { WebsiteHost, StoredService, StoredRoom, Handover } from './node.ts';
import type { Services } from './services.ts';

/*
 * Websites (rooms, in the code and on the wire for now): what the website service makes reachable for the people a
 * project lets in. A website is a port on this device: a service's (it serves it, see serve) or a program you run
 * yourself (openWebsite). The website service starts nothing: it announces the website in the project under its key,
 * lets visitors in through an encrypted tunnel (see live.ts), and tells whatever answers who each visitor is, in a
 * signed header and through the app API, here too.
 */

export class Website {
  readonly h: WebsiteHost;
  readonly #svc: () => Services;
  get svc(): Services {
    return this.#svc();
  }

  constructor(h: WebsiteHost, svc: () => Services) {
    this.h = h;
    this.#svc = svc;
  }

  /** The app API (see appapi.ts), started when a room's handler or a service first needs it. */
  appApi?: Promise<AppApiServer>;

  /**
   * What a room's handler needs to ask Weave who its players are: Weave passes it to handlers it starts; for one
   * that runs by itself (a room on a port), `weave room env` prints it.
   */
  async websiteEnv(ref: string): Promise<AppEnv> {
    const { room } = this.roomById(ref);
    const hosted = room.agent ? this.svc.localServiceByKey(room.agent)?.hosted?.[room.id] : undefined;
    if (!hosted) throw new Error(`"${room.name}" isn't a website your website service runs here`);
    const api = await this.startAppApi();
    return { WEAVE_API: `http://127.0.0.1:${api.port}`, WEAVE_TOKEN: hosted.token, WEAVE_PROJECT: hosted.project, WEAVE_WEBSITE: hosted.id };
  }

  /** The port of the app API once it runs (services get it as WEAVE_API). */
  appApiPort?: number;

  startAppApi(): Promise<AppApiServer> {
    this.appApi ??= startAppApi(
      (token) => this.appScope(token),
      (scope, route, params) => this.appAnswer(scope, route, params),
    ).then((api) => {
      this.appApiPort = api.port;
      return api;
    });
    return this.appApi;
  }

  /** Whose a token is: a project's app (the project id), or a service running here ("service:<name>"). */
  appScope(token: string): string | undefined {
    const services = this.svc.storedServices().filter((s) => s.enabled);
    const service = services.find((s) => sameToken(s.token, token));
    if (service) return `service:${service.name}`;
    // What answers a website you run yourself: that website only.
    const room = services.flatMap((s) => Object.values(s.hosted ?? {})).find((r) => !r.servedBy && sameToken(r.token, token));
    return room && `room:${room.id}`;
  }

  /**
   * The space a service asks the app API about: the room a connection came through (who), the one it names
   * (?project=), or its only one. Never a space it wasn't added to.
   */
  serviceAppSpace(name: string, route: string, params: URLSearchParams): string {
    const stored = this.svc.storedServices().find((s) => s.name === name && s.enabled);
    if (!stored) throw new AppApiError(401, 'unauthorized');
    if (route === '/v1/who') {
      const found = this.h.live.personOnPort(Number(params.get('port')));
      const room = found && this.hosted().find((h) => h.room.id === found.room && h.room.servedBy === name);
      if (!room) throw new AppApiError(404, 'not a connection through one of this service’s websites');
      return room.room.project;
    }
    const mine = stored.spaces.filter((id) => this.h.spaces.has(id));
    const asked = params.get('project');
    if (asked) {
      const id = mine.find((s) => s === asked || this.h.spaceName(this.h.spaces.get(s)!).toLowerCase() === asked.toLowerCase());
      if (!id) throw new AppApiError(404, `"${asked}" isn't one of the spaces ${name} was added to`);
      return id;
    }
    if (mine.length === 1) return mine[0];
    throw new Error(mine.length ? `${name} runs in ${mine.length} spaces: say which (?project=<id>)` : `${name} wasn't added to any space yet`);
  }

  appAnswer(scope: string, route: string, params: URLSearchParams): unknown {
    const service = scope.startsWith('service:') ? scope.slice('service:'.length) : undefined;
    const hosted = scope.startsWith('room:') ? this.svc.storedServices().flatMap((s) => Object.values(s.hosted ?? {})).find((r) => r.id === scope.slice('room:'.length)) : undefined;
    if (scope.startsWith('room:') && !hosted) throw new AppApiError(401, 'unauthorized');
    const projectId = hosted ? hosted.project : service ? this.serviceAppSpace(service, route, params) : scope;
    const project = this.h.spaces.get(projectId);
    if (!project) throw new AppApiError(404, 'this project is no longer here');
    const me = this.h.identity.author;
    if (route === '/v1/me') return this.appPerson(project, me);
    if (route === '/v1/who') {
      const port = Number(params.get('port'));
      if (!Number.isInteger(port) || port <= 0 || port > 65535) throw new Error('port: the remote port of the connection (a number)');
      const found = this.h.live.personOnPort(port);
      const room = found && this.allRooms().find((r) => r.room.id === found.room && r.project.id === projectId && (!hosted || r.room.id === hosted.id));
      if (!found || !room) throw new AppApiError(404, hosted ? 'not a connection through this room' : 'not a connection through one of this project’s rooms');
      return { ...this.appPerson(project, found.person), room: { id: room.room.id, name: room.room.name } };
    }
    if (route === '/v1/project') {
      // A service sees the websites it serves only, and the settings it was given for this space.
      const served = service ? new Set(this.hosted().filter((h) => h.room.servedBy === service).map((h) => h.room.id)) : undefined;
      const rooms = this.allRooms().filter((r) => r.project.id === projectId && r.room.open && r.room.host === me && this.h.live.isHosting(r.room.id) && (!served || served.has(r.room.id)) && (!hosted || r.room.id === hosted.id));
      return {
        id: project.id,
        name: project.name,
        ...(service ? { service, settings: this.svc.storedServices().find((s) => s.name === service)?.spaceSettings?.[projectId] ?? {} } : {}),
        host: { did: me, name: this.h.nameOf(me) },
        rooms: rooms.map(({ room }) => ({ id: room.id, name: room.name, people: this.h.live.peers(room.id).map((did) => this.appPerson(project, did)) })),
        groups: this.appGroups(project).map(({ space, state }) => ({ id: space.id, name: space.name, ...(state.tier ? { tier: true } : {}) })),
      };
    }
    if (route === '/v1/access') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose access to look up');
      const groups = this.appGroups(project);
      const group = params.get('group');
      const asked = group ? groups.filter(({ space }) => space.id === group || space.name.toLowerCase() === group.toLowerCase()) : groups;
      if (group && asked.length === 0) throw new AppApiError(404, `no group "${group}" here: only the project's groups and the host's own groups and tiers`);
      return {
        ...this.appPerson(project, did as Did),
        groups: asked.filter(({ state }) => state.members.has(did as Did)).map(({ space, state }) => ({ id: space.id, name: space.name, ...(state.tier ? { tier: true } : {}) })),
      };
    }
    if (route === '/v1/tickets') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose tickets to look up');
      const now = new Date(this.h.clock());
      return this.h.allShows()
        .filter((s) => s.project === projectId && s.host === this.h.identity.author)
        .flatMap((s) => (this.h.ticketRecords(s.id).some((r) => r.holder === did) ? [{ show: s.id, name: s.name, ...(s.room ? { room: s.room } : {}), starts: s.starts, ends: s.ends, open: showOpen(s, now), cancelled: s.cancelled }] : []));
    }
    if (route === '/v1/badges') {
      const did = params.get('did') ?? '';
      if (!did.startsWith('did:')) throw new Error('did: whose badges to look up');
      const { series, badges } = this.h.allBadges();
      const ours = new Map(series.filter((s) => s.project?.id === projectId && s.project.checked && !s.broken).map((s) => [s.id, s]));
      return badges
        .filter((b) => b.holder === did && !b.invalid && ours.has(b.series))
        .map((b) => {
          const s = ours.get(b.series)!;
          return { id: b.id, series: { id: s.id, name: s.name, symbol: s.symbol, ...(s.image ? { image: s.image } : {}), ...(s.limit ? { limit: s.limit } : {}) }, n: b.n, issuer: { did: b.issuer, name: this.h.nameOf(b.issuer) }, note: b.note, ...(b.ref ? { ref: b.ref } : {}), ...(b.personal?.published ? { personal: b.personal.published } : {}), time: b.time };
        });
    }
    throw new AppApiError(404, `no route ${route}`);
  }

  /**
   * X-Weave-Person for a room's http service (Weave and Docker): who this player is, as the app API would say,
   * the room, and the time, signed with the app's own token (HMAC-SHA256), which only Weave and the app know.
   * Only for apps Weave gave a token (it started them, or weave app env): otherwise nobody could check it.
   */
  personHeader(room: Room, person: Did): string | undefined {
    if (this.roomService(room)?.protocol !== 'http') return undefined;
    const found = this.allRooms().find((r) => r.room.id === room.id);
    // Vouched for with the token of what answers it: the service that serves it, or the website's own (weave website env).
    const stored = room.agent ? this.svc.localServiceByKey(room.agent)?.hosted?.[room.id] : undefined;
    const token = stored?.servedBy ? this.svc.storedServices().find((s) => s.name === stored.servedBy)?.token : stored?.token;
    if (!found || !token) return undefined;
    const payload = Buffer.from(JSON.stringify({ ...this.appPerson(found.project, person), room: { id: room.id, name: room.name }, t: Math.floor(this.h.clock() / 1000) })).toString('base64url');
    return `${payload}.${createHmac('sha256', token).update(payload).digest('base64url')}`;
  }

  /** A person as an app sees them: who they are and their place in the project. */
  appPerson(project: StoredSpace, did: Did): AppPerson {
    const state = this.h.state(project);
    const name = this.h.nameOf(did);
    return {
      did,
      ...(name ? { name } : {}),
      host: did === this.h.identity.author,
      member: state.members.has(did) || did === this.h.identity.author,
      maintainer: state.maintainers.has(did),
    };
  }

  /** Groups an app may ask about: the ones invited into the project, and the host's own groups and tiers. Nothing else of the host's. */
  appGroups(project: StoredSpace): Array<{ space: StoredSpace; state: SpaceState }> {
    const invited = new Set(this.h.state(project).groups.keys());
    const out: Array<{ space: StoredSpace; state: SpaceState }> = [];
    for (const space of this.h.spaces.values()) {
      if (space.kind !== 'group') continue;
      const state = this.h.state(space);
      if (invited.has(space.id) || state.founder === this.h.identity.author) out.push({ space, state });
    }
    return out;
  }

  async websites(ref?: string): Promise<WebsiteInfo[]> {
    const only = ref ? this.h.project(ref).id : undefined;
    // Rooms come from room services (rooms hosts announced themselves, before them, are left out).
    const rooms = this.allRooms().filter(({ room, project }) => room.open && !!room.agent && (!only || project.id === only));
    return Promise.all(rooms.map(({ room, project }) => this.roomInfo(room, project)));
  }

  async closeWebsite(ref: string): Promise<void> {
    const { room } = this.roomById(ref);
    if (room.host !== this.h.identity.author || !room.agent) throw new Error('only the person whose website service offers a website closes it');
    // A website of the website service closes. On an always-on node: handed over as a change.
    const service = this.svc.localServiceByKey(room.agent);
    if (service?.hosted?.[room.id]) return this.closeHostedRooms(service.name, (r) => r.id !== room.id);
    const away = this.h.isLinkedNode ? undefined : [...this.svc.handedOver().values()].find((h) => h.did === room.agent);
    if (away?.hosted?.[room.id]) {
      const { [room.id]: _gone, ...hosted } = away.hosted;
      return this.svc.changeNodeService(away, { hosted });
    }
    throw new Error(`${this.h.agentName(room.agent, room.host) ?? 'a service'} offers "${room.name}": close it on the device it runs on`);
  }

  async visitWebsite(ref: string): Promise<WebsiteInfo> {
    const { room, project } = this.roomById(ref);
    if (!room.open) throw new Error('this website is closed');
    if (this.hostedHere(room)) return this.roomInfo(room, project);
    if (!this.mayJoin(room, this.h.identity.author)) throw new Error(room.show || room.groups ? "this website is for a show's ticket holders, while it's on (weave shows), or for members of its tiers" : "you're not invited to this website");
    await this.h.live.join(room, room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'room');
    return this.roomInfo(room, project);
  }

  async leaveWebsite(ref: string): Promise<void> {
    await this.h.live.leave(this.roomById(ref).room.id);
  }

  async websiteChat(ref: string): Promise<WebsiteChatMessage[]> {
    const { room } = this.roomById(ref);
    return this.h.live.chat(room.id).map((m) => ({ id: m.id, by: { did: m.from, name: this.h.nameOf(m.from) ?? m.name }, text: m.text, time: m.time, mine: m.from === this.h.identity.author }));
  }

  async sayOnWebsite(input: { room: string; text: string }): Promise<void> {
    if (!input.text?.trim()) throw new Error('a message needs text');
    this.h.live.say(this.roomById(input.room).room.id, input.text);
  }

  /** Where a room's app is reached on this computer while we're in the room: the same port its address (WebsiteInfo.url) has. */
  roomPort(roomId: string): number | undefined {
    const found = this.allRooms().find((r) => r.room.id === roomId && r.room.open);
    if (!found) return undefined;
    if (found.room.host !== this.h.identity.author) return this.h.live.localPort(roomId);
    return this.h.live.isHosting(roomId) ? this.roomService(found.room)?.port : undefined;
  }

  /** A room's key seed, from our own secret: the host can reopen its rooms after a restart. */
  roomSeed(roomId: string): Uint8Array {
    return createHash('sha256').update('weave/room-seed/v1').update(this.h.selfSecret()).update(roomId).digest();
  }

  allRooms(): Array<{ room: Room; project: StoredSpace }> {
    const out: Array<{ room: Room; project: StoredSpace }> = [];
    for (const project of this.h.spaces.values()) {
      if (project.kind !== 'project') continue;
      for (const room of roomsOf(this.h.entries(project))) out.push({ room, project });
    }
    return out;
  }

  roomById(ref: string): { room: Room; project: StoredSpace } {
    const matches = this.allRooms().filter(({ room }) => room.id === ref || room.id.startsWith(ref) || room.name.toLowerCase() === ref.toLowerCase());
    if (matches.length === 0) throw new Error(`no website "${ref}"`);
    const open = matches.filter((m) => m.room.open);
    if (open.length > 1) throw new Error(`several websites match "${ref}": use its id`);
    return open[0] ?? matches[0];
  }

  /** Participants of the room's project who are invited (or everyone, by default); the host always. */
  mayJoin(room: Room, person: Did): boolean {
    if (person === room.host) return true;
    const found = this.allRooms().find((r) => r.room.id === room.id);
    if (!found || !this.h.state(found.project).members.has(person)) return false;
    if (room.show || room.groups?.length) {
      // A ticketed room: a ticket while the show is on (the host checks its own records, a guest its ticket)…
      const show = room.show ? this.h.allShows().find((s) => s.id === room.show && s.host === room.host) : undefined;
      const ticket =
        !!show &&
        showOpen(show, new Date(this.h.clock())) &&
        (person === this.h.identity.author ? this.h.myTickets().some((t) => t.show === show.id && t.host === show.host) : show.host === this.h.identity.author && this.h.ticketRecords(show.id).some((r) => r.holder === person));
      // …or an active membership in one of its groups (a tier).
      const member = (room.groups ?? []).some((id) => this.activeMember(id, person));
      if (!ticket && !member) return false;
    }
    return room.invite === 'participants' || room.invite.includes(person);
  }

  /** Whether someone is in a group right now (a tier's grant not run out). */
  activeMember(groupId: string, person: Did): boolean {
    const group = this.h.spaces.get(groupId);
    const member = group && this.h.state(group).members.get(person);
    return !!member && (!member.until || member.until > new Date(this.h.clock()).toISOString());
  }

  /** Whether this node hosts a room: one of a room service running here. */
  hostedHere(room: Room): boolean {
    return room.host === this.h.identity.author && !!room.agent && !!this.svc.localServiceByKey(room.agent)?.hosted?.[room.id];
  }

  /** What a room's clients reach on this computer: its handler's port, where the room service runs. */
  roomService(room: Room) {
    const port = room.agent ? this.svc.localServiceByKey(room.agent)?.hosted?.[room.id]?.port : undefined;
    return port ? { id: 'room', port, protocol: 'http' as const } : undefined;
  }

  /** A room, offered by a room service: hosted where that service runs, joined like any room everywhere else (also on your own computers). */
  async roomInfo(room: Room, project: StoredSpace): Promise<WebsiteInfo> {
    const me = this.h.identity.author;
    const here = this.hostedHere(room);
    const service = here ? this.roomService(room) : undefined;
    const joined = here ? this.h.live.isHosting(room.id) : this.h.live.isJoined(room.id);
    const ready = here ? !!service && (await portOpen(service.port)) : this.h.live.appReady(room.id);
    const localPort = this.h.live.localPort(room.id);
    const slug = room.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'room';
    const side = here ? room.pages?.host : room.pages?.joiner;
    const path = side?.path ?? '/';
    const url = here ? (service && ready ? `http://localhost:${service.port}${path}` : undefined) : localPort && ready ? `http://${slug}.weave.localhost:${localPort}${path}` : undefined;
    const name = this.h.agentName(room.agent!, room.host);
    return {
      id: room.id,
      project: { id: project.id, kind: 'project', name: project.name },
      name: room.name,
      host: { did: room.host, name: this.h.nameOf(room.host) },
      offeredBy: { did: room.agent!, ...(name ? { name } : {}) },
      mine: here,
      open: room.open,
      mayJoin: this.mayJoin(room, me),
      ...(room.show ? { show: room.show } : {}),
      ...(room.groups?.length ? { groups: room.groups.map((id) => ({ id, name: this.h.spaces.get(id)?.name })) } : {}),
      joined,
      connected: this.h.live.connected(room.id),
      peers: joined ? this.h.live.peers(room.id).map((did) => ({ did, name: this.h.nameOf(did) })) : [],
      service: { id: 'room', label: side?.label ?? (here ? 'Open' : 'Play'), ready },
      ...(url ? { url } : {}),
      time: room.time,
    };
  }

  /**
   * Open a website: in a project the website service was added to, reaching something already running on this
   * device at `port` (a program of yours; services announce their own with serve). Who may visit: every participant,
   * or invited people, a show's ticket holders (while it's on), members of tiers.
   */
  async openWebsite(input: { service?: string; project: string; name: string; port?: number; invite?: string[]; show?: string; groups?: string[]; pages?: RoomPages }): Promise<WebsiteInfo> {
    const service = this.roomServiceFor(input.service);
    const project = this.h.project(input.project);
    if (!service.spaces.includes(project.id)) throw new Error(`${service.name} isn't in ${project.name}: add it there first`);
    const name = input.name?.trim().slice(0, 60);
    if (!name) throw new Error('a website has a name');
    const port = this.roomPortOf(input.port);
    // Who may visit: every participant, or these people, a show's ticket holders (while it's on), members of tiers.
    const invite = input.invite?.length ? input.invite.map((who) => this.h.resolve(who)) : ('participants' as const);
    const show = input.show ? this.h.showRef(input.show) : undefined;
    if (show && show.host !== this.h.identity.author) throw new Error(`only ${this.h.nameOf(show.host) ?? 'its host'} opens websites for ${show.name}: they let ticket holders in`);
    const groups = (input.groups ?? []).map((ref) => {
      const group = this.h.space(ref);
      if (group.kind !== 'group') throw new Error(`${group.name} is a ${group.kind}, not a group or tier`);
      if (!this.h.state(project).groups.has(group.id)) throw new Error(`${group.name} isn't invited into ${project.name}: invite it first (its members then take part)`);
      return group.id;
    });
    this.portFree(service.away ? Object.values(service.hosted) : this.hosted().map((h) => h.room), port);
    const access = { ...(invite !== 'participants' ? { invite } : {}), ...(show ? { show: show.id } : {}), ...(groups.length ? { groups } : {}) };
    const pages = parsePages(input.pages);
    const room: StoredRoom = {
      id: b64u.encode(randomBytes(12)),
      project: project.id,
      name,
      port,
      token: b64u.encode(randomBytes(24)),
      ...(Object.keys(access).length ? { access } : {}),
      ...(pages ? { pages } : {}),
    };
    if (service.away) {
      // Its key is on the always-on node: the website goes there, sealed to yourself, and the node announces it.
      this.svc.changeNodeService(service.away, { hosted: { ...service.hosted, [room.id]: room } });
      return {
        id: room.id,
        project: { id: project.id, kind: 'project', name: project.name },
        name,
        host: { did: this.h.identity.author, name: this.h.nameOf(this.h.identity.author) },
        offeredBy: { did: service.away.did, name: service.name },
        mine: false,
        open: false,
        mayJoin: true,
        joined: false,
        connected: false,
        peers: [],
        time: new Date(this.h.clock()).toISOString(),
      };
    }
    this.svc.saveServices(this.svc.storedServices().map((s) => (s.name === service.name ? { ...s, hosted: { ...(s.hosted ?? {}), [room.id]: room } } : s)));
    const announced = this.announceRoom(service.name, room)!;
    this.h.emitLive();
    return this.roomInfo(announced, project);
  }

  /**
   * A service on this device serves a website: its process listens on `port`, and the website service of this device
   * that's in the project makes it reachable there. Asked again (after a restart), it keeps the same website.
   */
  async serve(by: string, input: { space: string; port: number; name?: string; pages?: RoomPages }): Promise<WebsiteInfo> {
    const serving = this.svc.storedService(by);
    if (!serving.contract.website) throw new Error(`service "${by}" doesn't serve websites in its contract`);
    const project = this.h.project(input.space);
    if (!serving.spaces.includes(project.id)) throw new Error(`service "${by}" wasn't added to ${project.name}`);
    const port = this.roomPortOf(input.port);
    // Code from others serves only its own port: never another of this computer (a database, a router's page) for a
    // project to reach. Your own code runs with all your rights anyway: it serves what you have it serve.
    const own = this.svc.servesOn(serving);
    if (own && !own.has(port)) throw new Error(`service "${by}" may serve only its own port${own.size ? ` (${[...own].join(', ')})` : 's, and has none'}, not ${port}`);
    const site = this.svc.storedServices().find((s) => hostsWebsites(s) && s.enabled && s.spaces.includes(project.id));
    if (!site) throw new Error(`p/${project.name} has no website service on this device: add it there, and ${by} shows up as a website`);
    const name = input.name?.trim().slice(0, 60) || serving.artifact?.manifest.name || by;
    const pages = parsePages(input.pages);
    const before = Object.values(site.hosted ?? {}).find((r) => r.servedBy === by && r.project === project.id && r.name === name);
    // Its own websites may share its port: one process answers them all, in each project.
    this.portFree(this.hosted().map((h) => h.room).filter((r) => r.servedBy !== by), port);
    const room: StoredRoom = before ? { ...before, port, ...(pages ? { pages } : {}) } : { id: b64u.encode(randomBytes(12)), project: project.id, name, port, token: b64u.encode(randomBytes(24)), servedBy: by, ...(pages ? { pages } : {}) };
    this.svc.saveServices(this.svc.storedServices().map((s) => (s.name === site.name ? { ...s, hosted: { ...(s.hosted ?? {}), [room.id]: room } } : s)));
    const announced = this.announceRoom(site.name, room)!;
    this.h.emitLive();
    return this.roomInfo(announced, project);
  }

  /** Close the websites a service serves (all of them, or those `keep` doesn't keep): it stopped, left a project, or went. */
  async unserve(by: string, keep: (room: StoredRoom) => boolean = () => false): Promise<void> {
    for (const site of this.svc.storedServices().filter(hostsWebsites)) await this.closeHostedRooms(site.name, (r) => r.servedBy !== by || keep(r));
  }

  /** The websites the website services of this device serve, with the service each belongs to. */
  hosted(): Array<{ site: StoredService; room: StoredRoom }> {
    return this.svc.storedServices().flatMap((site) => Object.values(site.hosted ?? {}).map((room) => ({ site, room })));
  }

  /** Ports answer on one device: websites there can't share one. */
  portFree(rooms: StoredRoom[], port: number): void {
    const taken = rooms.find((r) => r.port === port);
    if (taken) throw new Error(`port ${port} already answers the website "${taken.name}": close it first, or use another port`);
  }

  /** A room of the room service, announced under its key (so everyone sees whose service offers it), and hosted here. */
  announceRoom(serviceName: string, room: StoredRoom): Room | undefined {
    const project = this.h.spaces.get(room.project);
    if (!project) return undefined;
    const key = this.svc.serviceKey(serviceName);
    const known = roomsOf(this.h.entries(project)).find((r) => r.id === room.id);
    if (!known?.open) {
      const roomKey = roomKeyPair(this.roomSeed(room.id)).publicKey.toString('hex');
      const a = room.access ?? {};
      this.h.replica.write(
        key,
        sealFor(this.h.cipher(project), { kind: KIND_ROOM, body: { room: room.id, name: room.name, service: 'room', key: roomKey, invite: a.invite ?? 'participants', ...(a.show ? { show: a.show } : {}), ...(a.groups?.length ? { groups: a.groups } : {}), ...(room.pages ? { pages: room.pages as unknown as Json } : {}), agent: key.did, open: true } }),
      );
    }
    const announced = this.roomById(room.id).room;
    // Hosting finds the network in the background: the room is announced already.
    if (this.h.swarm) void this.h.live.host(announced).catch(() => {});
    return announced;
  }

  /** A port a website's visitors may reach: one something listens on, on this device. */
  roomPortOf(port: unknown): number {
    const n = Number(port);
    if (!Number.isInteger(n) || n < 1 || n > 65535) throw new Error('which port does it listen on (on this device)?');
    return n;
  }

  /** Your website service: the one named, or your only one; here, or on one of your always-on nodes (`away`). */
  roomServiceFor(name?: string): { name: string; spaces: string[]; hosted: Record<string, StoredRoom>; away?: Handover } {
    const here = this.svc.storedServices()
      .filter(hostsWebsites)
      .map((s) => ({ name: s.name, spaces: s.spaces, hosted: s.hosted ?? {}, enabled: s.enabled, away: undefined as Handover | undefined }));
    const away = this.h.isLinkedNode ? [] : [...this.svc.handedOver().values()].filter((h) => h.builtin === 'website').map((h) => ({ name: h.service, spaces: h.spaces, hosted: h.hosted ?? {}, enabled: h.enabled !== false, away: h as Handover | undefined }));
    const all = [...here, ...away];
    const found = name ? all.find((s) => s.name === name) : all.length === 1 ? all[0] : undefined;
    if (!found) throw new Error(name ? `"${name}" isn't one of your website services` : all.length ? `you have several website services: say which (${all.map((s) => s.name).join(', ')})` : 'add the website service first (weave service add website --builtin website)');
    if (!found.enabled) throw new Error(`${found.name} is stopped: start it first`);
    return found;
  }

  /** A website the website service serves, as it lists it: what answers it, and how that's doing. */
  hostedRoomInfo(r: StoredRoom, here = true): HostedWebsiteInfo {
    const project = this.h.spaces.get(r.project);
    const serving = r.servedBy ? this.svc.storedServices().find((s) => s.name === r.servedBy) : undefined;
    const job = r.servedBy ? this.h.releases.jobs.get(`service:${r.servedBy}`) : undefined;
    return {
      id: r.id,
      project: { id: r.project, kind: 'project', name: project ? this.h.spaceName(project) : r.project },
      name: r.name,
      port: r.port,
      handler: r.servedBy ? { kind: 'service', service: r.servedBy } : { kind: 'address' },
      running: here && (!r.servedBy || (!!serving?.enabled && this.h.runtime.running(`service:${r.servedBy}`))),
      ...(r.note ? { note: r.note } : {}),
      ...(job?.progress ? { progress: { ...job.progress } } : {}),
      ...(job?.error ? { error: job.error } : {}),
    };
  }

  /** Close websites of a website service (all of them, or those `keep` doesn't keep): closed for everyone. */
  async closeHostedRooms(name: string, keep: (room: StoredRoom) => boolean = () => false): Promise<void> {
    const stored = this.svc.storedServices().find((s) => s.name === name);
    const key = this.h.agents.find((a) => a.name === name);
    if (!stored?.hosted || !key) return;
    const gone = Object.values(stored.hosted).filter((r) => !keep(r));
    for (const room of gone) await this.closeServiceRoom(key, room.project, room.id);
    if (gone.length) this.svc.saveServices(this.svc.storedServices().map((s) => (s.name === name ? { ...s, hosted: Object.fromEntries(Object.entries(s.hosted ?? {}).filter(([id]) => !gone.some((g) => g.id === id))) } : s)));
    this.h.emitLive();
  }

  async closeServiceRoom(key: AgentKey, projectId: string, roomId: string): Promise<void> {
    await this.h.live.stopHosting(roomId);
    const project = this.h.spaces.get(projectId);
    if (project) this.h.replica.write(key, sealFor(this.h.cipher(project), { kind: KIND_ROOM, body: { room: roomId, agent: key.did, open: false } }));
  }
}
