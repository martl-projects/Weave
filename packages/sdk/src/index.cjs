'use strict';
/*
 * @weave/sdk: who is playing, for apps shared in Weave rooms.
 *
 * Players reach a project's app through Weave: their connections arrive on
 * the host's computer from 127.0.0.1, one local port per connection, and the
 * host's Weave knows which person opened each one. This asks it, through the
 * app API Weave describes in WEAVE_API, WEAVE_TOKEN and WEAVE_PROJECT (set when
 * Weave starts the app; `weave app env <project>` prints them otherwise).
 *
 * For http services Weave also says it in each request: X-Weave-Person, signed
 * with the app's token. who(req) reads that first; it needs no call back to
 * Weave, and works where ports can't tell (an app in a container, behind a proxy).
 *
 * A service with a web page of its own announces it with serve(): the website
 * service of its project makes the port reachable for the project's people.
 *
 * One file, no dependencies, Node 18+ or Bun: require it, import it, or copy it.
 */

const { createHmac, timingSafeEqual } = require('node:crypto');

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;
/** How old an X-Weave-Person may be, in seconds: it's made fresh for every request. */
const HEADER_AGE = 300;

class WeaveError extends Error {
  constructor(status, message) {
    super(message);
    this.name = 'WeaveError';
    this.status = status;
  }
}

class Weave {
  constructor(options) {
    if (!options || !options.api || !options.token) throw new TypeError('Weave needs api and token (from WEAVE_API and WEAVE_TOKEN)');
    this.api = String(options.api).replace(/\/+$/, '');
    this.token = String(options.token);
    this.projectId = options.project ? String(options.project) : undefined;
    this.serviceApi = options.serviceApi ? String(options.serviceApi).replace(/\/+$/, '') : undefined;
  }

  /**
   * Serve a website: this service listens on `port`, and the website service of the project (`space`, or the
   * service's only project) makes it reachable for the project's people. Asked again, it keeps the same website.
   */
  async serve(port, options) {
    if (!this.serviceApi) throw new TypeError('serve() is for services: Weave starts them with WEAVE_SERVICE_API');
    const space = (options && options.space) || this.projectId;
    if (!space) throw new TypeError('serve() needs the space when the service is in several');
    const res = await fetch(`${this.serviceApi}/website`, {
      method: 'POST',
      headers: { authorization: `Bearer ${this.token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ space, port, ...(options && options.name ? { name: options.name } : {}), ...(options && options.pages ? { pages: options.pages } : {}) }),
      signal: AbortSignal.timeout(5000),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new WeaveError(res.status, (body && body.error) || `Weave answered ${res.status}`);
    return body.result;
  }

  /** The host: the person running the app on this computer. */
  me() {
    return this.#get('/v1/me');
  }

  /**
   * Who is behind a connection: an http request, a socket, a WebSocket's
   * underlying request, Bun's server.requestIP(req), or a remote port.
   * The host's own browser (127.0.0.1, not through a room) counts as the host.
   * Resolves undefined for connections that didn't come through Weave (other
   * computers on the network).
   */
  async who(from) {
    const vouched = this.#vouched(from);
    if (vouched) return vouched;
    const peer = remoteOf(from);
    if (!peer) throw new TypeError('who() needs a request, a socket, {address, port} or a port number');
    if (peer.address !== undefined && !LOOPBACK.test(peer.address)) return undefined;
    try {
      return await this.#get(`/v1/who?port=${peer.port}`);
    } catch (error) {
      if (error instanceof WeaveError && error.status === 404) return this.me();
      throw error;
    }
  }

  /**
   * The project, its open rooms with the people in them, and its groups. A service in several spaces names one
   * (its id or name), and also gets the settings it was given there.
   */
  project(space) {
    return this.#get(space ? `/v1/project?${new URLSearchParams({ project: String(space) })}` : '/v1/project');
  }

  /** What someone is in the project, and which of its groups (or the host's own groups and tiers) they're in; `group` (id or name) asks about one. */
  access(did, options) {
    const query = new URLSearchParams({ did: String(did) });
    if (options && options.group) query.set('group', String(options.group));
    return this.#get(`/v1/access?${query}`);
  }

  /** The project's shows someone has a ticket to (paid on chain), and whether each is on right now: let them in while `open`. */
  tickets(did) {
    return this.#get(`/v1/tickets?${new URLSearchParams({ did: String(did) })}`);
  }

  /** The project's badges someone holds: only valid ones, checked against the issuer's signatures. */
  badges(did) {
    return this.#get(`/v1/badges?${new URLSearchParams({ did: String(did) })}`);
  }

  /** The person in a request's X-Weave-Person, if Weave signed it with this app's token lately. */
  #vouched(from) {
    const headers = from && typeof from === 'object' ? from.headers : undefined;
    if (!headers) return undefined;
    const raw = typeof headers.get === 'function' ? headers.get('x-weave-person') : headers['x-weave-person'];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (typeof value !== 'string') return undefined;
    const [payload, sig] = value.split('.');
    if (!payload || !sig) return undefined;
    const expected = createHmac('sha256', this.token).update(payload).digest();
    const given = Buffer.from(sig, 'base64url');
    if (given.length !== expected.length || !timingSafeEqual(given, expected)) return undefined;
    let person;
    try {
      person = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    } catch {
      return undefined;
    }
    if (!person || typeof person.did !== 'string' || typeof person.t !== 'number' || Math.abs(Date.now() / 1000 - person.t) > HEADER_AGE) return undefined;
    const { t: _time, ...who } = person;
    return who;
  }

  async #get(path) {
    const res = await fetch(this.api + path, { headers: { authorization: `Bearer ${this.token}` }, signal: AbortSignal.timeout(5000) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new WeaveError(res.status, (body && body.error) || `Weave answered ${res.status}`);
    return body;
  }
}

/** The connection's far end, from whatever the app has at hand. */
function remoteOf(from) {
  if (typeof from === 'number') return { port: from };
  if (!from || typeof from !== 'object') return undefined;
  const socket = from.socket || from.connection || from._socket || from;
  if (typeof socket.remotePort === 'number') return { address: socket.remoteAddress, port: socket.remotePort };
  if (typeof from.port === 'number') return { address: from.address, port: from.port };
  return undefined;
}

/** Weave as the app was started with it, or undefined when Weave didn't start it (the app then runs without knowing who is who). */
function connect(env) {
  const vars = env || (typeof process !== 'undefined' ? process.env : {});
  if (!vars.WEAVE_API || !vars.WEAVE_TOKEN) return undefined;
  return new Weave({ api: vars.WEAVE_API, token: vars.WEAVE_TOKEN, project: vars.WEAVE_PROJECT, serviceApi: vars.WEAVE_SERVICE_API });
}

module.exports = { connect, Weave, WeaveError };
