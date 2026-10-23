import {
  constants,
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  createSign,
  createVerify,
  generateKeyPairSync,
  privateDecrypt,
  publicEncrypt,
  randomBytes,
  type KeyObject,
} from "node:crypto";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";

/*
 * Stand-ins for a company's services, for tests: a Vault with the Transit
 * engine and JWT auth, and an OIDC identity provider. They follow the real
 * HTTP APIs closely enough to exercise Weave's side, nothing more.
 */

const b64url = (b: Buffer | string) => Buffer.from(b).toString("base64url");

/** An OIDC provider: signs ID tokens (RS256) and serves its discovery document and keys. */
export class OidcStub {
  readonly #keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
  readonly kid = "test-key";
  #server?: Server;
  issuer = "";
  /** Who signs in through /authorize (the code flow). */
  loginAs?: { sub: string; email?: string; name?: string; groups?: string[] };
  /** With people, /authorize shows a sign-in page to pick one (demos); without, loginAs signs in at once. */
  people?: Array<{
    sub: string;
    email?: string;
    name?: string;
    groups?: string[];
  }>;
  /** The stand-in's clock, for tokens' times (tests move it). */
  now = () => Date.now();
  /** How many times a refresh token was used. */
  refreshes = 0;
  /** How many tokens for other resources (delegated) it issued. */
  delegations = 0;
  /** People blocked in the sign-in: their refresh tokens stop working. */
  readonly disabled = new Set<string>();
  readonly #refresh = new Map<
    string,
    {
      claims: { sub: string; email?: string; name?: string; groups?: string[] };
      clientId: string;
    }
  >();
  readonly #codes = new Map<
    string,
    {
      claims: { sub: string; email?: string; name?: string; groups?: string[] };
      clientId: string;
      redirect: string;
      challenge: string;
      nonce: string;
    }
  >();

  async start(port = 0): Promise<this> {
    this.#server = createServer((req, res) => {
      res.setHeader("content-type", "application/json");
      if (req.url === "/.well-known/openid-configuration")
        return res.end(
          JSON.stringify({
            issuer: this.issuer,
            jwks_uri: `${this.issuer}/jwks`,
            authorization_endpoint: `${this.issuer}/authorize`,
            token_endpoint: `${this.issuer}/token`,
          }),
        );
      // Sign-in with authorization code and PKCE: whoever loginAs names signs in at once.
      if (req.url?.startsWith("/authorize")) {
        const q = new URL(req.url, this.issuer).searchParams;
        const chosen = q.get("as");
        if (this.people && chosen === null) {
          res.setHeader("content-type", "text/html; charset=utf-8");
          return void res.end(signInPage(this.people, q));
        }
        if (this.people && chosen !== null)
          this.loginAs = this.people[Number(chosen)];
        if (!this.loginAs) return void ((res.statusCode = 401), res.end("{}"));
        const code = randomBytes(12).toString("hex");
        this.#codes.set(code, {
          claims: this.loginAs,
          clientId: q.get("client_id") ?? "",
          redirect: q.get("redirect_uri") ?? "",
          challenge: q.get("code_challenge") ?? "",
          nonce: q.get("nonce") ?? "",
        });
        res.statusCode = 302;
        res.setHeader(
          "location",
          `${q.get("redirect_uri")}?code=${code}&state=${encodeURIComponent(q.get("state") ?? "")}`,
        );
        return res.end();
      }
      if (req.url === "/token" && req.method === "POST") {
        let raw = "";
        req.on("data", (c) => (raw += c));
        req.on("end", () => {
          const form = new URLSearchParams(raw);
          if (form.get("grant_type") === "refresh_token") {
            const held = this.#refresh.get(form.get("refresh_token") ?? "");
            if (
              !held ||
              held.clientId !== form.get("client_id") ||
              this.disabled.has(held.claims.sub)
            )
              return void ((res.statusCode = 400),
              res.end(
                JSON.stringify({
                  error: "invalid_grant",
                  error_description: "sign in again",
                }),
              ));
            // A token for another resource, issued to the person (delegated): Key Vault's audience.
            if ((form.get("scope") ?? "").includes("vault.azure.net")) {
              this.delegations++;
              return void res.end(
                JSON.stringify({
                  access_token: this.token({
                    ...held.claims,
                    aud: "https://vault.azure.net",
                  }),
                  expires_in: 3600,
                  token_type: "Bearer",
                }),
              );
            }
            this.refreshes++;
            return void res.end(
              JSON.stringify({
                id_token: this.token({ ...held.claims, aud: held.clientId }),
                refresh_token: form.get("refresh_token"),
                token_type: "Bearer",
              }),
            );
          }
          const grant = this.#codes.get(form.get("code") ?? "");
          this.#codes.delete(form.get("code") ?? "");
          const verifier = form.get("code_verifier") ?? "";
          const ok =
            grant &&
            grant.clientId === form.get("client_id") &&
            grant.redirect === form.get("redirect_uri") &&
            createHash("sha256").update(verifier).digest("base64url") ===
              grant.challenge;
          if (!ok)
            return void ((res.statusCode = 400),
            res.end(JSON.stringify({ error: "invalid_grant" })));
          const refresh = randomBytes(16).toString("hex");
          this.#refresh.set(refresh, {
            claims: grant.claims,
            clientId: grant.clientId,
          });
          res.end(
            JSON.stringify({
              id_token: this.token({
                ...grant.claims,
                aud: grant.clientId,
                nonce: grant.nonce,
              }),
              refresh_token: refresh,
              token_type: "Bearer",
            }),
          );
        });
        return;
      }
      if (req.url === "/jwks")
        return res.end(
          JSON.stringify({
            keys: [
              {
                ...(this.#keys.publicKey.export({ format: "jwk" }) as object),
                kid: this.kid,
                alg: "RS256",
                use: "sig",
              },
            ],
          }),
        );
      res.statusCode = 404;
      res.end("{}");
    });
    await new Promise<void>((resolve) =>
      this.#server!.listen(port, "127.0.0.1", resolve),
    );
    this.issuer = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  get publicKey(): KeyObject {
    return this.#keys.publicKey;
  }

  /** An ID token for an employee. */
  token(claims: {
    sub: string;
    email?: string;
    name?: string;
    groups?: string[];
    aud?: string;
    nonce?: string;
    expiresIn?: number;
    signWith?: KeyObject;
  }): string {
    const now = Math.floor(this.now() / 1000);
    const header = b64url(
      JSON.stringify({ alg: "RS256", typ: "JWT", kid: this.kid }),
    );
    const body = b64url(
      JSON.stringify({
        iss: this.issuer,
        aud: claims.aud ?? "weave",
        sub: claims.sub,
        email: claims.email,
        name: claims.name,
        groups: claims.groups ?? [],
        nonce: claims.nonce,
        iat: now,
        exp: now + (claims.expiresIn ?? 3600),
      }),
    );
    const signature = createSign("RSA-SHA256")
      .update(`${header}.${body}`)
      .sign(claims.signWith ?? this.#keys.privateKey);
    return `${header}.${body}.${b64url(signature)}`;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}

/** Vault with Transit (derived keys) and JWT auth bound to an OIDC issuer; it can disable people. */
export class VaultStub {
  readonly #keys = new Map<string, Buffer>();
  readonly #tokens = new Map<string, { sub: string }>();
  readonly #disabled = new Set<string>();
  readonly audit: Array<{ op: string; sub: string; context?: string }> = [];
  #server?: Server;
  address = "";
  /** The token an operator would hand out directly (no SSO). */
  readonly rootToken = "root-token";

  readonly oidc?: OidcStub;

  constructor(oidc?: OidcStub) {
    this.oidc = oidc;
    this.#tokens.set(this.rootToken, { sub: "root" });
  }

  createKey(name: string): void {
    this.#keys.set(name, randomBytes(32));
  }

  hasKey(name: string): boolean {
    return this.#keys.has(name);
  }

  /** Offboarding: the person's tokens stop working and they can't sign in again. */
  disable(sub: string): void {
    this.#disabled.add(sub);
    for (const [token, t] of this.#tokens)
      if (t.sub === sub) this.#tokens.delete(token);
  }

  async start(port = 0): Promise<this> {
    this.#server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        const body = raw ? JSON.parse(raw) : {};
        const url = req.url ?? "";
        if (url.startsWith("/v1/auth/jwt/login")) {
          const sub = this.#verify(String(body.jwt ?? ""));
          if (!sub || this.#disabled.has(sub))
            return send(403, { errors: ["permission denied"] });
          const token = `t-${randomBytes(8).toString("hex")}`;
          this.#tokens.set(token, { sub });
          return send(200, {
            auth: { client_token: token, lease_duration: 600 },
          });
        }
        const who = this.#tokens.get(
          String(req.headers["x-vault-token"] ?? ""),
        );
        if (!who) return send(403, { errors: ["permission denied"] });
        const match =
          /^\/v1\/transit\/(encrypt|decrypt|keys)\/([^/]+)(\/config)?$/.exec(
            url,
          );
        if (!match) return send(404, { errors: ["no handler"] });
        const [, op, name, config] = match;
        if (op === "keys") {
          if (config) return send(204, {});
          if (req.method === "DELETE") {
            this.#keys.delete(name);
            return send(204, {});
          }
        }
        const secret = this.#keys.get(name);
        if (!secret) return send(400, { errors: ["encryption key not found"] });
        const context = String(body.context ?? "");
        const key = createHmac("sha256", secret).update(context).digest();
        this.audit.push({
          op,
          sub: who.sub,
          context: Buffer.from(context, "base64").toString(),
        });
        if (op === "encrypt") {
          const iv = randomBytes(12);
          const cipher = createCipheriv("aes-256-gcm", key, iv);
          const ct = Buffer.concat([
            cipher.update(Buffer.from(String(body.plaintext), "base64")),
            cipher.final(),
          ]);
          return send(200, {
            data: {
              ciphertext: `vault:v1:${Buffer.concat([iv, ct, cipher.getAuthTag()]).toString("base64")}`,
            },
          });
        }
        try {
          const all = Buffer.from(
            String(body.ciphertext).replace(/^vault:v1:/, ""),
            "base64",
          );
          const decipher = createDecipheriv(
            "aes-256-gcm",
            key,
            all.subarray(0, 12),
          );
          decipher.setAuthTag(all.subarray(all.length - 16));
          const plain = Buffer.concat([
            decipher.update(all.subarray(12, all.length - 16)),
            decipher.final(),
          ]);
          return send(200, { data: { plaintext: plain.toString("base64") } });
        } catch {
          return send(400, {
            errors: ["cipher: message authentication failed"],
          });
        }
      });
    });
    await new Promise<void>((resolve) =>
      this.#server!.listen(port, "127.0.0.1", resolve),
    );
    this.address = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  /** A JWT's subject, if the issuer signed it and it's current. */
  #verify(jwt: string): string | undefined {
    if (!this.oidc) return undefined;
    const [h, b, s] = jwt.split(".");
    if (!h || !b || !s) return undefined;
    const ok = createVerify("RSA-SHA256")
      .update(`${h}.${b}`)
      .verify(this.oidc.publicKey, Buffer.from(s, "base64url"));
    const claims = JSON.parse(Buffer.from(b, "base64url").toString()) as {
      sub: string;
      exp: number;
    };
    return ok && claims.exp * 1000 > Date.now() ? claims.sub : undefined;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}

/** Azure Key Vault (RSA keys, wrapkey/unwrapkey) with Entra's token endpoint: a client secret, or a federated assertion from the OIDC stand-in. */
export class AzureStub {
  readonly #keys = new Map<
    string,
    { privateKey: KeyObject; publicKey: KeyObject }
  >();
  readonly #tokens = new Map<string, string>();
  readonly #disabled = new Set<string>();
  readonly secret = "client-secret";
  readonly log: Array<{ op: string; sub: string }> = [];
  #server?: Server;
  url = "";
  readonly oidc?: OidcStub;

  constructor(oidc?: OidcStub) {
    this.oidc = oidc;
  }

  /** A person's Key Vault token (delegated), checked as Key Vault would: signed by the sign-in, for Key Vault, current, not blocked. */
  #person(token: string): string | undefined {
    if (!this.oidc) return undefined;
    const [h, b, sig] = token.split(".");
    if (
      !h ||
      !b ||
      !sig ||
      !createVerify("RSA-SHA256")
        .update(`${h}.${b}`)
        .verify(this.oidc.publicKey, Buffer.from(sig, "base64url"))
    )
      return undefined;
    const claims = JSON.parse(Buffer.from(b, "base64url").toString()) as {
      sub: string;
      aud: string;
      exp: number;
    };
    if (
      claims.aud !== "https://vault.azure.net" ||
      claims.exp * 1000 < Date.now() ||
      this.#disabled.has(claims.sub)
    )
      return undefined;
    return claims.sub;
  }

  createKey(name: string): void {
    this.#keys.set(name, generateKeyPairSync("rsa", { modulusLength: 2048 }));
  }

  hasKey(name: string): boolean {
    return this.#keys.has(name);
  }

  disable(sub: string): void {
    this.#disabled.add(sub);
    for (const [token, who] of this.#tokens)
      if (who === sub) this.#tokens.delete(token);
  }

  async start(): Promise<this> {
    this.#server = createServer((req, res) => {
      let raw = "";
      req.on("data", (c) => (raw += c));
      req.on("end", () => {
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader("content-type", "application/json");
          res.end(JSON.stringify(body));
        };
        const url = new URL(req.url ?? "/", this.url);
        if (url.pathname.endsWith("/oauth2/v2.0/token")) {
          const form = new URLSearchParams(raw);
          let sub: string | undefined;
          if (form.get("client_secret") === this.secret)
            sub = `app:${form.get("client_id")}`;
          if (!sub || this.#disabled.has(sub))
            return send(401, { error: "invalid_client" });
          const token = `a-${randomBytes(8).toString("hex")}`;
          this.#tokens.set(token, sub);
          return send(200, {
            access_token: token,
            expires_in: 3600,
            token_type: "Bearer",
          });
        }
        // An app's token from this stand-in's own endpoint, or a token Entra issued to a person (delegated, from the OIDC stand-in).
        const bearer = String(req.headers.authorization ?? "").replace(
          /^Bearer /,
          "",
        );
        const who = this.#tokens.get(bearer) ?? this.#person(bearer);
        if (!who) return send(401, { error: { code: "Unauthorized" } });
        const m =
          /^\/keys\/([^/]+)(?:\/([^/]+))?(?:\/(wrapkey|unwrapkey))?$/.exec(
            url.pathname,
          );
        if (!m) return send(404, {});
        const [, name, part, op] = m;
        const version = op ? part : undefined;
        const action =
          op ?? (part === "wrapkey" || part === "unwrapkey" ? part : undefined);
        if (req.method === "DELETE" && !action) {
          this.#keys.delete(name);
          return send(200, {});
        }
        const key = this.#keys.get(name);
        if (!key) return send(404, { error: { code: "KeyNotFound" } });
        const body = JSON.parse(raw || "{}") as { value: string };
        this.log.push({ op: action ?? "", sub: who });
        const options = {
          oaepHash: "sha256",
          padding: constants.RSA_PKCS1_OAEP_PADDING,
        };
        if (action === "wrapkey")
          return send(200, {
            kid: `${this.url}/keys/${name}/v1`,
            value: publicEncrypt(
              { key: key.publicKey, ...options },
              Buffer.from(body.value, "base64url"),
            ).toString("base64url"),
          });
        if (action === "unwrapkey" && version) {
          try {
            return send(200, {
              kid: `${this.url}/keys/${name}/${version}`,
              value: privateDecrypt(
                { key: key.privateKey, ...options },
                Buffer.from(body.value, "base64url"),
              ).toString("base64url"),
            });
          } catch {
            return send(400, { error: { code: "BadParameter" } });
          }
        }
        return send(400, {});
      });
    });
    await new Promise<void>((resolve) =>
      this.#server!.listen(0, "127.0.0.1", resolve),
    );
    this.url = `http://127.0.0.1:${(this.#server.address() as AddressInfo).port}`;
    return this;
  }

  async stop(): Promise<void> {
    await new Promise((resolve) => this.#server?.close(resolve));
  }
}

/** A company sign-in page for demos: pick who signs in. */
function signInPage(
  people: Array<{
    sub: string;
    email?: string;
    name?: string;
    groups?: string[];
  }>,
  query: URLSearchParams,
): string {
  const choice = (i: number) => {
    const q = new URLSearchParams(query);
    q.set("as", String(i));
    return `/authorize?${q.toString()}`;
  };
  return `<!doctype html><meta charset="utf-8"><title>Sign in · Acme</title>
<style>body{font:15px 'Segoe UI',system-ui,sans-serif;background:#f3f2f1;margin:0;display:grid;place-items:center;min-height:100vh}
.box{background:#fff;width:380px;padding:40px 44px;box-shadow:0 2px 6px #0003}h1{font-size:24px;font-weight:600;margin:16px 0 4px}p{color:#605e5c;margin:0 0 20px}
a{display:flex;gap:12px;align-items:center;padding:10px 12px;margin:0 -12px;text-decoration:none;color:#1b1b1b;border-radius:4px}a:hover{background:#f3f2f1}
.av{width:36px;height:36px;border-radius:50%;background:#0067b8;color:#fff;display:grid;place-items:center;font-weight:600}.e{color:#605e5c;font-size:13px}.logo{font-weight:700;color:#0067b8}</style>
<div class="box"><div class="logo">Acme · company sign-in (demo)</div><h1>Pick an account</h1><p>to continue to Weave</p>
${people
  .map(
    (p, i) =>
      `<a href="${choice(i)}"><span class="av">${(p.name ?? p.sub)
        .split(" ")
        .map((w) => w[0])
        .join("")
        .slice(
          0,
          2,
        )}</span><span><div>${p.name ?? p.sub}</div><div class="e">${p.email ?? ""}</div></span></a>`,
  )
  .join("")}
</div>`;
}

/** A mail server (SMTP, no TLS): takes every message and keeps it, decoded, for the test to read. */
export class SmtpStub {
  readonly messages: Array<{
    from: string;
    to: string[];
    data: string;
    text: string;
    user?: string;
  }> = [];
  port = 0;
  #server?: import("node:net").Server;

  async start(): Promise<this> {
    const { createServer: createTcp } = await import("node:net");
    this.#server = createTcp((socket) => {
      let buffer = "";
      let data: string[] | undefined;
      const message: { from: string; to: string[]; user?: string } = {
        from: "",
        to: [],
      };
      const say = (line: string) => socket.write(`${line}\r\n`);
      say("220 mail.acme.example ready");
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let at: number;
        while ((at = buffer.indexOf("\r\n")) >= 0) {
          const line = buffer.slice(0, at);
          buffer = buffer.slice(at + 2);
          if (data) {
            if (line !== ".") {
              data.push(line);
              continue;
            }
            const raw = data.join("\r\n");
            // The plain-text part, decoded: what a reader sees.
            const part =
              /Content-Type: text\/plain[^]*?\r\n\r\n([A-Za-z0-9+/=\r\n]+)/.exec(
                raw,
              )?.[1] ?? "";
            this.messages.push({
              ...message,
              to: [...message.to],
              data: raw,
              text: Buffer.from(part.replace(/\r\n/g, ""), "base64").toString(
                "utf8",
              ),
            });
            data = undefined;
            say("250 queued");
          } else if (/^EHLO/i.test(line))
            say("250-mail.acme.example\r\n250 AUTH PLAIN");
          else if (/^AUTH PLAIN /i.test(line)) {
            message.user = Buffer.from(line.slice(11), "base64")
              .toString("utf8")
              .split("\0")[1];
            say("235 ok");
          } else if (/^MAIL FROM:/i.test(line)) {
            message.from = /<(.*)>/.exec(line)?.[1] ?? "";
            message.to = [];
            say("250 ok");
          } else if (/^RCPT TO:/i.test(line)) {
            message.to.push(/<(.*)>/.exec(line)?.[1] ?? "");
            say("250 ok");
          } else if (/^DATA/i.test(line)) {
            data = [];
            say("354 go on");
          } else if (/^QUIT/i.test(line)) {
            say("221 bye");
            socket.end();
          } else say("502 not here");
        }
      });
      socket.on("error", () => {});
    });
    await new Promise<void>((resolve) =>
      this.#server!.listen(0, "127.0.0.1", resolve),
    );
    this.port = (this.#server.address() as AddressInfo).port;
    return this;
  }

  get url(): string {
    return `smtp://weave%40acme.example:mail-secret@127.0.0.1:${this.port}`;
  }

  stop(): Promise<void> {
    return new Promise((resolve) =>
      this.#server ? this.#server.close(() => resolve()) : resolve(),
    );
  }
}
