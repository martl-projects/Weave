import { randomBytes } from 'node:crypto';
import { connect as connectTcp, type Socket } from 'node:net';
import { hostname } from 'node:os';
import { connect as connectTls, type TLSSocket } from 'node:tls';

/*
 * Sending a company's invitations by email (stage 14): a small SMTP client, so
 * the company's node needs nothing but its mail server. WEAVE_SMTP_URL names
 * it: smtp://user:password@host:587 (STARTTLS when offered), smtps://…:465
 * (TLS from the start), smtp://host:25 (no sign-in). WEAVE_SMTP_FROM is the sender.
 */

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

/** The mail server from the environment, if there is one. */
export function mailServer(): { url: URL; from: string } | undefined {
  const raw = process.env.WEAVE_SMTP_URL;
  if (!raw) return undefined;
  const url = new URL(raw);
  return { url, from: process.env.WEAVE_SMTP_FROM ?? `weave@${url.hostname}` };
}

const encodeHeader = (value: string) => (/^[\x20-\x7e]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value).toString('base64')}?=`);

/** Send one mail. Resolves once the server took it. */
export async function sendMail(server: { url: URL; from: string }, mail: Mail): Promise<void> {
  const { url, from } = server;
  const secure = url.protocol === 'smtps:';
  const port = Number(url.port || (secure ? 465 : 587));
  let socket: Socket | TLSSocket = secure ? connectTls({ host: url.hostname, port, servername: url.hostname }) : connectTcp({ host: url.hostname, port });
  socket.setTimeout(20_000, () => socket.destroy(new Error(`the mail server ${url.hostname} didn't answer`)));
  let buffer = '';
  let waiting: ((reply: { code: number; text: string }) => void) | undefined;
  let failed: ((error: Error) => void) | undefined;
  const onData = (chunk: Buffer) => {
    buffer += chunk.toString('utf8');
    // A reply ends with a line "NNN text" (no dash after the code).
    const lines = buffer.split('\r\n');
    const last = lines.findIndex((l) => /^\d{3} /.test(l));
    if (last < 0 || !waiting) return;
    const text = lines.slice(0, last + 1).join('\n');
    buffer = lines.slice(last + 1).join('\r\n');
    const resolve = waiting;
    waiting = undefined;
    resolve({ code: Number(lines[last].slice(0, 3)), text });
  };
  const listen = (s: Socket | TLSSocket) => {
    s.on('data', onData);
    s.on('error', (e) => failed?.(e));
  };
  listen(socket);
  const reply = () =>
    new Promise<{ code: number; text: string }>((resolve, reject) => {
      waiting = resolve;
      failed = reject;
      if (buffer) onData(Buffer.alloc(0));
    });
  const command = async (line: string, expect: number[]) => {
    socket.write(`${line}\r\n`);
    const r = await reply();
    if (!expect.includes(r.code)) throw new Error(`the mail server refused ${line.split(' ')[0]}: ${r.text.split('\n').pop()}`);
    return r;
  };
  try {
    const greeting = await reply();
    if (greeting.code !== 220) throw new Error(`the mail server said: ${greeting.text}`);
    const me = hostname().replace(/[^A-Za-z0-9.-]/g, '-') || 'weave';
    let hello = await command(`EHLO ${me}`, [250]);
    if (!secure && /STARTTLS/i.test(hello.text)) {
      await command('STARTTLS', [220]);
      socket.removeAllListeners('data');
      socket = connectTls({ socket: socket as Socket, servername: url.hostname });
      listen(socket);
      await new Promise<void>((resolve, reject) => (socket as TLSSocket).once('secureConnect', resolve).once('error', reject));
      hello = await command(`EHLO ${me}`, [250]);
    }
    if (url.username) {
      const user = decodeURIComponent(url.username);
      const password = decodeURIComponent(url.password);
      await command(`AUTH PLAIN ${Buffer.from(`\0${user}\0${password}`).toString('base64')}`, [235]);
    }
    await command(`MAIL FROM:<${from}>`, [250]);
    await command(`RCPT TO:<${mail.to}>`, [250, 251]);
    await command('DATA', [354]);
    const boundary = `weave-${randomBytes(8).toString('hex')}`;
    const headers = [`From: Weave <${from}>`, `To: <${mail.to}>`, `Subject: ${encodeHeader(mail.subject)}`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${randomBytes(12).toString('hex')}@${me}>`, 'MIME-Version: 1.0'];
    const body = mail.html
      ? [
          ...headers,
          `Content-Type: multipart/alternative; boundary="${boundary}"`,
          '',
          `--${boundary}`,
          'Content-Type: text/plain; charset=utf-8',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from(mail.text).toString('base64').replace(/.{76}/g, '$&\r\n'),
          `--${boundary}`,
          'Content-Type: text/html; charset=utf-8',
          'Content-Transfer-Encoding: base64',
          '',
          Buffer.from(mail.html).toString('base64').replace(/.{76}/g, '$&\r\n'),
          `--${boundary}--`,
        ]
      : [...headers, 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64', '', Buffer.from(mail.text).toString('base64').replace(/.{76}/g, '$&\r\n')];
    await command(`${body.join('\r\n')}\r\n.`, [250]);
    socket.write('QUIT\r\n');
  } finally {
    socket.end();
  }
}

/** The invitation a new colleague gets: a page to open (it shows the link, a button that opens Weave, and where to get it). */
export function invitationMail(input: { to: string; company: string; joinUrl: string; link: string; by?: string }): Mail {
  const text = [
    `${input.by ? `${input.by} invites you` : 'You are invited'} to ${input.company} on Weave.`,
    '',
    `Open this page and click "Open Weave": ${input.joinUrl}`,
    '',
    "Don't have Weave yet? The page links to it. Once it's installed, choose \"My company uses Weave…\" and sign in with your company account; there are no passwords or words to keep.",
    '',
    'Or paste this enrollment link into Weave:',
    input.link,
  ].join('\n');
  const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
  const html = `<div style="font:15px system-ui,sans-serif;color:#101828;max-width:520px">
<p>${escape(input.by ? `${input.by} invites you` : 'You are invited')} to <b>${escape(input.company)}</b> on Weave.</p>
<p><a href="${escape(input.joinUrl)}" style="display:inline-block;background:#1f3a93;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">Join ${escape(input.company)}</a></p>
<p style="color:#667085">You sign in with your company account; there are no passwords or recovery words to keep.</p></div>`;
  return { to: input.to, subject: `Join ${input.company} on Weave`, text, html };
}
