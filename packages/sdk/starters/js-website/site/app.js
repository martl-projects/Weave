// The page each player sees. Weave holds the connection at /weave/socket and tells the game who this is.
const socket = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/weave/socket`);
const $ = (id) => document.getElementById(id);
const say = (message) => socket.send(JSON.stringify(message));
let me = null;

socket.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  if (message.type === 'welcome') {
    me = message.you;
    $('who').textContent = me.host ? `You're the host, ${me.name}: ask, then judge.` : `You're playing as ${me.name}.`;
    $('host').hidden = !me.host;
    $('buzz').hidden = me.host;
  }
  if (message.type === 'timeout') $('status').textContent = `Time's up: nobody buzzed for "${message.question}".`;
  if (message.type !== 'state') return;
  const round = message.round;
  $('question').textContent = round ? round.question : 'Waiting for the next question…';
  if (round) $('status').textContent = round.buzzed ? `${round.buzzed} buzzed!` : `${round.left}s left`;
  $('buzz').disabled = !round || !!round.buzzed;
  $('scores').innerHTML = '';
  for (const s of message.scores) {
    const li = document.createElement('li');
    li.textContent = s.name;
    const b = document.createElement('b');
    b.textContent = s.points;
    li.append(b);
    $('scores').append(li);
  }
  $('players').textContent = `Here: ${message.players.map((p) => p.name + (p.host ? ' (host)' : '')).join(', ')}`;
});
socket.addEventListener('close', () => ($('who').textContent = 'Disconnected: reload to join again.'));

$('send').addEventListener('click', () => {
  say({ type: 'ask', question: $('ask').value });
  $('ask').value = '';
});
$('ask').addEventListener('keydown', (e) => e.key === 'Enter' && $('send').click());
$('right').addEventListener('click', () => say({ type: 'right' }));
$('wrong').addEventListener('click', () => say({ type: 'wrong' }));
$('buzz').addEventListener('click', () => say({ type: 'buzz' }));
document.addEventListener('keydown', (e) => e.code === 'Space' && !$('buzz').hidden && !$('buzz').disabled && $('buzz').click());
