// A buzzer quiz: a Weave website in JavaScript, built into a WebAssembly component that Weave runs itself. Weave
// serves the files in site/ and holds the players' connections: it tells the game who each player is (their name,
// whether they're the host), passes on what they say, and the game answers. Nothing else to run, nothing to install.
import { load, save, log } from 'weave:service/host@0.1.0';
import { send, broadcast, tickEvery } from 'weave:service/players@0.1.0';

const SECONDS = 15;
/** Who is connected now, by connection id: { did, name, host }. */
const players = new Map();
/**
 * Points, by Weave id (did): the same person keeps them when they come back. Kept in /data between runs, and read
 * on first use: top-level code runs while the component is built, when Weave's functions aren't there yet.
 */
let kept;
const points = () => (kept ??= JSON.parse(load('scores.json') ?? '{}'));
/** The question being played: who may still buzz, who buzzed, and the time left. */
let round = null;

const people = () => [...players.values()].map(({ name, host }) => ({ name, host }));
const table = () => Object.entries(points()).map(([did, s]) => ({ name: s.name, points: s.points, did })).sort((a, b) => b.points - a.points);
const state = () => ({ type: 'state', players: people(), scores: table(), round: round && { question: round.question, left: round.left, buzzed: round.buzzed && players.get(round.buzzed)?.name } });

export function onEvent() {}

export function onJoin(text) {
  const player = JSON.parse(text);
  players.set(player.id, { did: player.did, name: player.name ?? 'someone', host: player.host });
  send(player.id, JSON.stringify({ type: 'welcome', you: { name: player.name ?? 'someone', host: player.host } }));
  broadcast(JSON.stringify(state()));
}

export function onLeave(id) {
  players.delete(id);
  broadcast(JSON.stringify(state()));
}

export function onMessage(id, text) {
  const player = players.get(id);
  if (!player) return;
  let message;
  try {
    message = JSON.parse(text);
  } catch {
    return;
  }
  // The host asks and judges; everyone else buzzes.
  if (player.host && message.type === 'ask' && typeof message.question === 'string' && message.question.trim()) {
    round = { question: message.question.trim().slice(0, 300), left: SECONDS, buzzed: null, out: new Set() };
    tickEvery(1000);
  }
  if (!player.host && message.type === 'buzz' && round && !round.buzzed && round.left > 0 && !round.out.has(player.did)) {
    round.buzzed = id;
    tickEvery(0);
  }
  if (player.host && (message.type === 'right' || message.type === 'wrong') && round?.buzzed) {
    const buzzer = players.get(round.buzzed);
    if (message.type === 'right' && buzzer) {
      const s = (points()[buzzer.did] ??= { name: buzzer.name, points: 0 });
      s.name = buzzer.name;
      s.points += 1;
      save('scores.json', JSON.stringify(points()));
      log(`${buzzer.name} got it: ${round.question}`);
      round = null;
    } else {
      // Wrong: the others may buzz again, for the time that was left.
      if (buzzer) round.out.add(buzzer.did);
      round.buzzed = null;
      tickEvery(1000);
    }
  }
  broadcast(JSON.stringify(state()));
}

export function onTick() {
  if (!round || round.buzzed) return tickEvery(0);
  round.left -= 1;
  if (round.left <= 0) {
    broadcast(JSON.stringify({ type: 'timeout', question: round.question }));
    round = null;
    tickEvery(0);
  }
  broadcast(JSON.stringify(state()));
}
