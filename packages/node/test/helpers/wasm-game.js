// A WebAssembly website, for tests (built into a component of the website world by componentize-js, see
// wasm-website.test.ts): a shared counter. Weave holds the players' connections and says who each one is; this only
// handles what they say.
import { log } from 'weave:service/host@0.1.0';
import { send, broadcast, disconnect, tickEvery } from 'weave:service/players@0.1.0';

const players = new Map();
let count = 0;
let ticks = 0;

export function onEvent() {}

export function onJoin(text) {
  const player = JSON.parse(text);
  players.set(player.id, player.name ?? player.did);
  send(player.id, JSON.stringify({ hello: player.name ?? null, host: player.host, member: player.member, count }));
  broadcast(JSON.stringify({ joined: player.name ?? null }));
  if (players.size === 1) tickEvery(100);
  log(`${player.name} joined`);
}

export function onMessage(id, message) {
  if (message === 'inc') {
    count += 1;
    broadcast(JSON.stringify({ count, by: players.get(id) }));
  }
  if (message === 'ticks') send(id, JSON.stringify({ ticks }));
  if (message === 'bye') disconnect(id);
}

export function onLeave(id) {
  const name = players.get(id);
  players.delete(id);
  broadcast(JSON.stringify({ left: name ?? null }));
  if (!players.size) tickEvery(0);
}

export function onTick() {
  ticks += 1;
}
