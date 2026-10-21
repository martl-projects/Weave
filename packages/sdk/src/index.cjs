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
 * One file, no dependencies, Node 18+ or Bun: require it, import it, or copy it.
 */

const LOOPBACK = /^(127\.|::1$|::ffff:127\.)/;

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

  /** The project, its open rooms with the people in them, and its groups. */
  project() {
    return this.#get('/v1/project');
  }

  /** What someone is in the project, and which of its groups (or the host's own groups and tiers) they're in; `group` (id or name) asks about one. */
  access(did, options) {
    const query = new URLSearchParams({ did: String(did) });
    if (options && options.group) query.set('group', String(options.group));
    return this.#get(`/v1/access?${query}`);
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
  return new Weave({ api: vars.WEAVE_API, token: vars.WEAVE_TOKEN, project: vars.WEAVE_PROJECT });
}

module.exports = { connect, Weave, WeaveError };
