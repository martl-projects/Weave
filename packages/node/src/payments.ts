import type { WeaveNode } from './node.ts';
import { asEthSign, b64u, checksumAddress, contractWalletCheck, contractWalletLinks, contractWalletSaysYes, type Did, type Entry, erc20BalanceOf, erc20Transfer, type EventFields, execTransactionData, formatUnits, gift, grantUntil, type GumroadLink, type Inner, type Invite, isAddress, isDid, isTxHash, type Json, KIND_LABEL, KIND_MEMBERSHIP, KIND_MEMBERSHIP_HANDLED, KIND_MEMBERSHIP_LICENSE, KIND_MEMBERSHIP_PENDING, KIND_MEMBERSHIP_REQUEST, KIND_REMOVE, KIND_SAFE_PROPOSAL, KIND_SAFE_RETIRED, KIND_SAFE_SIGNATURE, KIND_SHOW, KIND_TICKET, KIND_TICKET_RECORD, KIND_TICKET_REQUEST, KIND_TIER, KIND_TREASURY, KIND_TREASURY_SPLIT, KIND_WALLET, KIND_WALLET_CHECKED, labelsOf, labelTarget, mayAct, membershipRequest, MULTI_SEND_CALL_ONLY, multiSendData, type OnchainPrice, openMembershipRequest, openTicket, openTicketRequest, parseGumroadLink, parseLabelTarget, parseOnchainPrice, parseSafeTx, parseShares, parseShowSplit, type PaymentCheck, payouts, randomBytes, type Recipient, rekey, retiredOf, SAFE_CALLS, safeAddress, safeBatch, safeDeployment, safeProposalsOf, safeSigner, safeTxTypedData, sealFor, type Show, showOpen, showSaltNonce, showsOf, type SpaceKeys, type SpaceKind, spaceScope, type SpaceState, type Split, SPLIT_PRESETS, splitAllocations, splitDeployedCall, splitDeployment, splitOf, splitRecipients, splitSalt, TEST_USDC, ticketFor, ticketRequest, type Tier, tiersOf, TRANSFER_TOPIC, treasuriesOf, TREASURY_CHAIN, treasurySaltNonce, treasuryThreshold, verifyWalletProof, walletHistoryOf, walletsOf, WEAVE_FOUNDATION_PROJECT, type WeaveRecord, walletMessage } from '@weave/core';
import { type StoredSpace } from './spacestore.ts';
import { ManagedKeys } from './managed.ts';
import { type GumroadSignIn, type LicenseCheck } from './gumroad.ts';
import { type GumroadInfo, type LabelInfo, type MembershipRequestInfo, type PaymentRequestInfo, type SafeProposalInfo, type ShowInfo, type ShowSettlement, type SplitContractInfo, type SplitInfo, type TicketInfo, type TierInfo, type TreasuryInfo, type WalletInfo } from './backend.ts';
import { join as joinPath } from 'node:path';
import { readSecretJson, writeSecretJson } from './vault.ts';
import { rmSync } from 'node:fs';
import { saveConfig } from './config.ts';

/*
 * Money (stages around v0.19): membership tiers (granted, paid through Gumroad
 * or on chain), linked wallets, project treasuries (Safes) and their splits,
 * Safe transactions signed together, paying from a wallet, and ticketed shows.
 * It sees the node's internals only through PaymentsCore.
 */

/** How an onchain payment is kept among the license records: its transaction hash after this prefix. */
const ONCHAIN_RECORD = 'tx:';

/** Automatic grants (free tiers) don't run out in practice. */
const FREE_TIER_MONTHS = 1200;

/** Contacts and free tiers an app ships with for newcomers (see weave.bundle.json). */
export interface Bundle {
  contacts?: string[];
  tiers?: Array<{ tier: string; creator: Did; note?: string }>;
}

/** What Payments needs of the node's internals, and nothing more (the node builds it in its constructor). */
export interface PaymentsCore {
  createSpace(kind: SpaceKind, name: string, extra?: Record<string, Json>): Promise<StoredSpace>;
  readonly encryptionKeyOf: (person: Did) => Did;
  entryPoint(): Invite['entry'];
  sealForSelf(inner: Inner): EventFields;
  selfBodies(kind: string): Array<Record<string, unknown>>;
  tryOpen<T>(open: (me: Recipient) => T | undefined): T | undefined;
  state(space: StoredSpace): SpaceState;
  readonly managed: ManagedKeys;
  keysForNewcomers(space: StoredSpace): SpaceKeys;
  direct(peer: Did): StoredSpace;
  readonly spaces: Map<string, StoredSpace>;
  eventsOf(person: Did): WeaveRecord[];
  upTo(person: Did): Record<string, number>;
  anchor(person: Did, space: StoredSpace): Record<string, { c: number; s: number; n: number }>;
  saveSpace(space: StoredSpace): void;
  space(ref: string, kind?: SpaceKind): StoredSpace;
  entries(space: StoredSpace): Entry[];
  readonly seenAt: (entry: { id: string }) => string;
  maintainerState(project: StoredSpace): SpaceState;
  project(ref: string): StoredSpace;
}

export class Payments {
  private readonly node: WeaveNode;
  private readonly core: PaymentsCore;

  constructor(node: WeaveNode, core: PaymentsCore) {
    this.node = node;
    this.core = core;
  }

  // ---------------------------------------------------------------- memberships

  /** Answers to ticket requests for our shows, so each is read once per run (request id → answer). */
  ticketChecks = new Map<string, { show: string; holder: Did; tx: string; ok: boolean; reason?: string } | 'checking'>();
  /** The chain's answers for paid requests, so each transaction is read once per run (request id → answer). */
  paymentChecks = new Map<string, PaymentCheck | 'checking'>();
  /** A Gumroad connection waiting for the person in the browser, or why the last one didn't work. */
  gumroadLogin?: { signIn?: GumroadSignIn; error?: string };
  /** Gumroad's answers for requests, so each key is checked once per run (request id → answer). */
  licenseChecks = new Map<string, LicenseCheck | 'checking'>();

  async createTier(input: { name: string; price?: number; currency?: string; description?: string; benefits?: string[]; auto?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): Promise<TierInfo> {
    const group = await this.core.createSpace('group', input.name, { tier: true });
    const position = this.tierOffers(this.node.identity.author).length;
    this.publishTier({ id: group.id, creator: this.node.identity.author, name: group.name, price: 0, currency: 'EUR', description: '', benefits: [], position, open: true, auto: false, time: '' }, input);
    return this.tierInfo(this.tierOffer(group.id, this.node.identity.author));
  }

  async setTier(input: { tier: string; name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): Promise<TierInfo> {
    const before = this.tierOffer(input.tier, this.node.identity.author);
    if (before.creator !== this.node.identity.author) throw new Error('only its creator can change a tier');
    this.publishTier(before, input);
    return input.hidden ? { ...this.tierInfo(before), open: false } : this.tierInfo(this.tierOffer(before.id, this.node.identity.author));
  }

  get gumroadFile(): string {
    return joinPath(this.node.home.dir, 'gumroad.json');
  }

  /** The Gumroad connection on this device (kept in the home, never in a log). */
  gumroadAuth(): { token: string; account: string } | undefined {
    const saved = readSecretJson<{ token?: string; account?: string }>(this.node.home, this.gumroadFile);
    return saved?.token ? { token: saved.token, account: saved.account ?? 'your Gumroad account' } : undefined;
  }

  async gumroad(): Promise<GumroadInfo> {
    const auth = this.gumroadAuth();
    const login = this.gumroadLogin;
    return {
      available: !!this.node.gumroadSetup.clientId,
      ...(auth ? { account: auth.account } : {}),
      ...(login?.signIn ? { pending: { url: login.signIn.url } } : {}),
      ...(login?.error ? { error: login.error } : {}),
    };
  }

  async connectGumroad(): Promise<GumroadInfo> {
    this.gumroadLogin?.signIn?.cancel();
    const signIn = await this.node.gumroadSetup.signIn(this.node.gumroadSetup.clientId);
    const login = { signIn };
    this.gumroadLogin = login;
    // Wait for the person to allow Weave in the browser, in the background; gumroad() tells how it went.
    void signIn.token
      .then(async (token) => {
        const account = await this.node.gumroadSetup.account(token);
        writeSecretJson(this.node.home, this.gumroadFile, { token, account, connected: new Date(this.node.clock()).toISOString() });
        if (this.gumroadLogin === login) this.gumroadLogin = undefined;
      })
      .catch((error: Error) => {
        if (this.gumroadLogin === login) this.gumroadLogin = error.message === 'cancelled' ? undefined : { error: error.message };
      });
    return this.gumroad();
  }

  async disconnectGumroad(): Promise<GumroadInfo> {
    this.gumroadLogin?.signIn?.cancel();
    this.gumroadLogin = undefined;
    rmSync(this.gumroadFile, { force: true });
    return this.gumroad();
  }

  async sellTierOnGumroad(input: { tier: string; token?: string }): Promise<{ tier: TierInfo; published: boolean; warning?: string }> {
    const t = this.tierOffer(input.tier, this.node.identity.author);
    if (t.creator !== this.node.identity.author) throw new Error('only its creator can sell a tier');
    const token = input.token?.trim() || this.gumroadAuth()?.token;
    if (!token) throw new Error('connect Gumroad first (weave gumroad connect), or give an access token');
    const made = await this.node.makeGumroadMembership(token, { name: t.name, price: t.price, currency: t.currency, description: t.description || undefined });
    const tier = await this.setTier({ tier: t.id, gumroad: made.link, auto: false });
    return { tier, published: made.published, ...(made.warning ? { warning: made.warning } : {}) };
  }

  async tiers(who?: string): Promise<TierInfo[]> {
    return this.tierOffers(who ? this.node.resolve(who) : this.node.identity.author).map((t) => this.tierInfo(t));
  }

  async requestMembership(input: { tier: string; creator?: string; note?: string; license?: string; payment?: string }): Promise<void> {
    const tier = this.tierOffer(input.tier, input.creator ? this.node.resolve(input.creator) : undefined);
    if (tier.creator === this.node.identity.author) throw new Error("that's your own tier");
    if (!tier.open) throw new Error(`${tier.name} isn't taking new members right now`);
    const license = input.license?.trim();
    if (license && !tier.gumroad) throw new Error(`${tier.name} isn't sold through Gumroad`);
    if (license && !/^[A-Za-z0-9-]{8,100}$/.test(license)) throw new Error('a Gumroad license key looks like XXXXXXXX-XXXXXXXX-XXXXXXXX-XXXXXXXX');
    const payment = input.payment?.trim().toLowerCase();
    if (payment && !tier.onchain) throw new Error(`${tier.name} isn't paid on chain`);
    if (payment && !isTxHash(payment)) throw new Error("a payment is the transaction's hash: 0x and 64 hex digits");
    if (payment && !this.wallets().get(this.node.identity.author)?.verified) throw new Error('link the wallet you paid from first (weave wallet link): that is how the creator knows the payment is yours');
    await this.node.join(tier.creator); // the creator's node listens on their identity topic
    this.node.replica.write(
      this.node.identity,
      membershipRequest(this.core.encryptionKeyOf(tier.creator), { tier: tier.id, note: input.note?.trim().slice(0, 500) ?? '', entry: this.core.entryPoint(), ...(license ? { license } : {}), ...(payment ? { payment } : {}) }),
    );
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_MEMBERSHIP_PENDING, body: { creator: tier.creator, tier: tier.id } }));
  }

  async membershipRequests(): Promise<MembershipRequestInfo[]> {
    const handled = new Set(this.core.selfBodies(KIND_MEMBERSHIP_HANDLED).map((b) => b.request));
    const mine = new Map(this.tierOffers(this.node.identity.author).map((t) => [t.id, t]));
    const out: MembershipRequestInfo[] = [];
    for (const event of this.node.replica.events((e) => e.kind === KIND_MEMBERSHIP_REQUEST && e.author !== this.node.identity.author)) {
      const id = event.id;
      const request = handled.has(id) ? undefined : this.core.tryOpen((me) => openMembershipRequest(event, me));
      const tier = request && mine.get(request.tier);
      if (!tier) continue;
      const check = this.licenseChecks.get(id);
      const answer = check && check !== 'checking' ? { ok: check.ok, ...(check.reason ? { reason: check.reason } : {}), ...(check.email ? { email: check.email } : {}) } : {};
      const license = request.license ? { license: { key: request.license, ...answer } } : {};
      const paid = this.paymentChecks.get(id);
      const paidAnswer = paid && paid !== 'checking' ? { ok: paid.ok, ...(paid.reason ? { reason: paid.reason } : {}), ...(paid.months ? { months: paid.months } : {}) } : {};
      const payment = request.payment ? { payment: { tx: request.payment, ...paidAnswer } } : {};
      out.push({ id, tier: { id: tier.id, name: tier.name }, did: event.author, name: this.node.nameOf(event.author), note: request.note, time: event.time, ...license, ...payment });
    }
    return out.sort((a, b) => a.time.localeCompare(b.time));
  }

  async grantMembership(input: { tier: string; who: string; months: number }): Promise<TierInfo> {
    const months = Math.round(Number(input.months));
    if (!(months >= 1 && (months <= 36 || months === FREE_TIER_MONTHS))) throw new Error('grant 1 to 36 months');
    const group = this.tierGroup(input.tier);
    const member = this.node.resolve(input.who);
    if (member === this.node.identity.author) throw new Error("you're in your own tier already");
    const state = this.core.state(group);
    const current = state.members.get(member);
    const until = grantUntil(new Date(), months, current?.until);
    this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_MEMBERSHIP, body: { member, until } }));
    // New (or returning) members get the tier's keys, posted where their node will look for them.
    if (!current) {
      this.node.replica.write(this.node.identity, gift(this.core.keysForNewcomers(group), [member], spaceScope(this.core.direct(member)), this.core.entryPoint(), this.core.encryptionKeyOf));
    }
    await this.answerRequests(group.id, member);
    return this.tierInfo(this.tierOffer(group.id, this.node.identity.author));
  }

  async declineMembership(input: { tier: string; who: string }): Promise<void> {
    const group = this.tierGroup(input.tier);
    await this.answerRequests(group.id, this.node.resolve(input.who));
  }

  async memberships(): Promise<TierInfo[]> {
    const out: TierInfo[] = [];
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'group' || space.founder === this.node.identity.author || !this.core.state(space).tier) continue;
      const offer = this.tierOffers(space.founder).find((t) => t.id === space.id);
      out.push(this.tierInfo(offer ?? { id: space.id, creator: space.founder, name: space.name, price: 0, currency: 'EUR', description: '', benefits: [], position: 0, open: false, auto: false, time: '' }));
    }
    return out;
  }

  /**
   * Ask to join a tier as soon as its creator's node has been reached: their
   * tier offer and encryption key must arrive first. Used for the app's bundle,
   * which names a free tier of the person who ships it.
   */
  queueMembershipRequest(input: { tier: string; creator: Did; note?: string }): void {
    if (this.node.config.pendingMemberships.some((p) => p.tier === input.tier)) return;
    this.node.config = { ...this.node.config, pendingMemberships: [...this.node.config.pendingMemberships, input] };
    saveConfig(this.node.home, this.node.config);
  }

  /**
   * What an app ships with for newcomers: contacts to add (and follow) and free
   * tiers to ask to join, typically those of the person who ships the app.
   * Nothing in it is secret.
   */
  async applyBundle(bundle: Bundle): Promise<void> {
    for (const link of bundle.contacts ?? []) await this.node.addContact(link);
    for (const tier of bundle.tiers ?? []) this.queueMembershipRequest(tier);
    await this.sendQueuedRequests();
  }

  async sendQueuedRequests(): Promise<number> {
    let sent = 0;
    for (const pending of this.node.config.pendingMemberships) {
      const creator = pending.creator as Did;
      const offered = this.tierOffers(creator).some((t) => t.id === pending.tier);
      const keysKnown = !!this.node.replica.authority.keys(creator).next || this.core.eventsOf(creator).length > 0;
      if (!offered || !keysKnown) continue;
      try {
        if (!(await this.tiers(creator)).find((t) => t.id === pending.tier)?.requested) await this.requestMembership({ tier: pending.tier, note: pending.note });
        sent++;
      } catch {
        // closed tier or similar: drop it, the creator decides by hand
      }
      this.node.config = { ...this.node.config, pendingMemberships: this.node.config.pendingMemberships.filter((p) => p.tier !== pending.tier) };
      saveConfig(this.node.home, this.node.config);
    }
    return sent;
  }

  /** Let in everyone asking to join our tiers that admit automatically. */
  async grantAutomatic(): Promise<number> {
    const auto = new Set(this.tierOffers(this.node.identity.author).filter((t) => t.auto && t.open).map((t) => t.id));
    if (!auto.size) return 0;
    let granted = 0;
    for (const request of await this.membershipRequests()) {
      if (!auto.has(request.tier.id)) continue;
      await this.grantMembership({ tier: request.tier.id, who: request.did, months: FREE_TIER_MONTHS });
      granted++;
    }
    return granted;
  }

  /**
   * Let in supporters who bought a tier on Gumroad: their license key is
   * checked once with Gumroad; a paid-up purchase gets a month, and the key is
   * kept (sealed to us) for renewing. A key already used by someone else, or
   * one Gumroad doesn't accept, waits in the Inbox with the reason.
   */
  async grantPaid(): Promise<number> {
    let granted = await this.grantPaidOnchain();
    const sold = new Map(this.tierOffers(this.node.identity.author).filter((t) => t.gumroad && t.open).map((t) => [t.id, t]));
    if (!sold.size) return granted;
    for (const request of await this.membershipRequests()) {
      const tier = sold.get(request.tier.id);
      const key = request.license?.key;
      if (!tier?.gumroad || !key || this.licenseChecks.has(request.id)) continue;
      if (key.startsWith(ONCHAIN_RECORD)) continue;
      const holder = this.licenses().find((l) => l.tier === tier.id && l.license === key && l.member !== request.did);
      if (holder) {
        this.licenseChecks.set(request.id, { ok: false, reason: `that license key already let ${this.node.nameOf(holder.member) ?? 'someone else'} in` });
        continue;
      }
      this.licenseChecks.set(request.id, 'checking');
      let check: LicenseCheck;
      try {
        check = await this.node.checkLicense(tier.gumroad, key);
      } catch (error) {
        this.licenseChecks.delete(request.id); // offline or Gumroad down: try again later
        continue;
      }
      this.licenseChecks.set(request.id, check);
      if (!check.ok) continue;
      this.recordLicense(tier.id, request.did, key, check);
      await this.grantMembership({ tier: tier.id, who: request.did, months: 1 });
      granted++;
    }
    return granted;
  }

  /**
   * Renew paid memberships: in the last days of a month, check the key with
   * Gumroad again (each key at most every few hours); still paid up, another
   * month. Otherwise the grant simply runs out and the tier key rotates.
   */
  async renewPaid(): Promise<number> {
    const sold = new Map(this.tierOffers(this.node.identity.author).filter((t) => t.gumroad).map((t) => [t.id, t]));
    if (!sold.size) return 0;
    const now = this.node.clock();
    const soon = new Date(now + 4 * 86400_000).toISOString();
    let renewed = 0;
    for (const record of this.licenses()) {
      const tier = sold.get(record.tier);
      const group = this.core.spaces.get(record.tier);
      if (!tier?.gumroad || !group || record.license.startsWith(ONCHAIN_RECORD) || now - Date.parse(record.checked) < 6 * 3600_000) continue;
      const until = this.core.state(group).members.get(record.member)?.until;
      if (!until || until > soon || until <= new Date(now).toISOString()) continue;
      let check: LicenseCheck;
      try {
        check = await this.node.checkLicense(tier.gumroad, record.license);
      } catch {
        continue; // offline or Gumroad down: the next round tries again
      }
      this.recordLicense(record.tier, record.member, record.license, check);
      if (!check.ok) continue;
      this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(group), { kind: KIND_MEMBERSHIP, body: { member: record.member, until: grantUntil(new Date(now), 1, until) } }));
      renewed++;
    }
    return renewed;
  }

  /**
   * Let in supporters who paid a tier on chain: the transaction is read once
   * from the chain; it has to pay the tier's address from the supporter's own
   * linked wallet, and counts once. A month per month's price paid (at most 36).
   * Paying again later is a new request with a new transaction.
   */
  async grantPaidOnchain(): Promise<number> {
    const sold = new Map(this.tierOffers(this.node.identity.author).filter((t) => t.onchain && t.open).map((t) => [t.id, t]));
    if (!sold.size) return 0;
    let granted = 0;
    for (const request of await this.membershipRequests()) {
      const tier = sold.get(request.tier.id);
      const tx = request.payment?.tx;
      if (!tier?.onchain || !tx || this.paymentChecks.has(request.id)) continue;
      const used = this.licenses().find((l) => l.license === ONCHAIN_RECORD + tx);
      if (used) {
        this.paymentChecks.set(request.id, { ok: false, reason: `that transaction already let ${this.node.nameOf(used.member) ?? 'someone'} in` });
        continue;
      }
      this.paymentChecks.set(request.id, 'checking');
      let check: PaymentCheck;
      try {
        check = await this.node.checkPayment(tier.onchain, tx);
      } catch {
        this.paymentChecks.delete(request.id); // offline, or the chain's node down: try again later
        continue;
      }
      // From a wallet they linked, now or before (they may have moved on since paying).
      if (check.ok && this.walletHistory().get(check.from?.toLowerCase() ?? '') !== request.did) {
        check = { ...check, ok: false, reason: `paid from ${check.from}, which isn't ${request.name ?? 'their'}'s linked wallet` };
      }
      if (!check.ok && /pending/.test(check.reason ?? '')) {
        this.paymentChecks.delete(request.id); // not mined yet: read it again next round
        continue;
      }
      this.paymentChecks.set(request.id, check);
      if (!check.ok || !check.months) continue;
      this.recordLicense(tier.id, request.did, ONCHAIN_RECORD + tx, { ok: true });
      await this.grantMembership({ tier: tier.id, who: request.did, months: check.months });
      granted++;
    }
    return granted;
  }

  recordLicense(tier: string, member: Did, license: string, check: LicenseCheck): void {
    const body = { tier, member, license, ok: check.ok, ...(check.reason ? { reason: check.reason } : {}), checked: new Date(this.node.clock()).toISOString() };
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_MEMBERSHIP_LICENSE, body }));
  }

  /** The license keys (and transactions, ONCHAIN_RECORD + hash) behind our paid memberships, the latest record per tier and member and key. */
  licenses(): Array<{ tier: string; member: Did; license: string; ok: boolean; checked: string }> {
    const latest = new Map<string, { tier: string; member: Did; license: string; ok: boolean; checked: string }>();
    for (const b of this.core.selfBodies(KIND_MEMBERSHIP_LICENSE)) {
      if (typeof b.tier !== 'string' || !isDid(b.member) || typeof b.license !== 'string') continue;
      // Every transaction is kept: each one counts once, however often its payer pays.
      latest.set(b.license.startsWith(ONCHAIN_RECORD) ? b.license : `${b.tier} ${b.member}`, { tier: b.tier, member: b.member, license: b.license, ok: b.ok === true, checked: typeof b.checked === 'string' ? b.checked : '' });
    }
    return [...latest.values()];
  }

  /** Remove members whose grants ran out from the tiers we offer, with one key rotation per tier. */
  async expireMemberships(): Promise<number> {
    let removed = 0;
    const now = new Date().toISOString();
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'group' || space.founder !== this.node.identity.author) continue;
      const state = this.core.state(space);
      if (!state.tier) continue;
      const expired = [...state.members.values()].filter((m) => m.until && m.until <= now).map((m) => m.did);
      if (!expired.length) continue;
      for (const member of expired) this.node.replica.write(this.node.identity, sealFor(this.core.managed.cipher(space), { kind: KIND_REMOVE, body: { member, upTo: this.core.upTo(member), at: this.core.anchor(member, space) } }));
      const remaining = [...state.members.keys()].filter((did) => !expired.includes(did));
      const { fields, epoch, key } = rekey(space, remaining, this.core.encryptionKeyOf);
      space.keys[String(epoch)] = key;
      this.core.saveSpace(space);
      this.node.replica.write(this.node.identity, fields);
      this.core.managed.afterRekey(space, epoch, key);
      removed += expired.length;
    }
    return removed;
  }

  publishTier(before: Tier, patch: { name?: string; price?: number; currency?: string; description?: string; benefits?: string[]; position?: number; open?: boolean; auto?: boolean; hidden?: boolean; gumroad?: GumroadLink | null; onchain?: OnchainPrice | null }): void {
    const price = patch.price ?? before.price;
    if (!Number.isInteger(price) || price < 0) throw new Error('the price is a whole number of cents, 0 for free');
    const currency = (patch.currency ?? before.currency).toUpperCase();
    if (!/^[A-Z]{3}$/.test(currency)) throw new Error('the currency is a three-letter code like EUR');
    const name = (patch.name ?? before.name).trim();
    if (!name || name.length > 40) throw new Error('tier names are 1 to 40 characters');
    const body: Record<string, Json> = {
      tier: before.id,
      name,
      price,
      currency,
      description: (patch.description ?? before.description).slice(0, 2000),
      benefits: (patch.benefits ?? before.benefits).map((b) => b.trim()).filter(Boolean).slice(0, 10),
      position: patch.position ?? before.position,
      open: patch.open ?? before.open,
      auto: patch.auto ?? before.auto,
    };
    if (patch.hidden) body.hidden = true;
    // Gumroad: a new link, null to remove it, or keep the one before.
    if (patch.gumroad) {
      const link = parseGumroadLink(patch.gumroad);
      if (!link) throw new Error('the Gumroad link needs the product id and its page, https://…gumroad.com/l/…');
      body.gumroad = link as unknown as Json;
    } else if (patch.gumroad === undefined && before.gumroad) body.gumroad = before.gumroad as unknown as Json;
    // On chain: a new price, null to remove it, or keep the one before.
    if (patch.onchain) {
      const onchain = parseOnchainPrice(patch.onchain);
      if (!onchain) throw new Error('an onchain price names the chain, the token (0x…), its decimals, the address paid to (0x…) and a whole amount per month');
      body.onchain = onchain as unknown as Json;
    } else if (patch.onchain === undefined && before.onchain) body.onchain = before.onchain as unknown as Json;
    this.node.replica.write(this.node.identity, { kind: KIND_TIER, body });
  }

  /** The tiers a creator offers, from their public events. */
  tierOffers(creator: Did): Tier[] {
    return tiersOf(this.core.eventsOf(creator));
  }

  /** A tier anyone offers, by id or name (yours first). */
  /**
   * A tier by id or name, of `creator` if given. Anyone can publish a tier under
   * someone else's id: then the id alone doesn't say whose. It's the tier whose
   * group this node holds with that founder, or else the creator has to be named
   * (the app always does: you join a tier from its creator's hub).
   */
  tierOffer(ref: string, creator?: Did): Tier {
    const all = tiersOf(this.node.replica.events((e) => e.kind === KIND_TIER)).filter((t) => !creator || t.creator === creator);
    let match = all.filter((t) => t.id === ref);
    if (!match.length) match = all.filter((t) => t.creator === this.node.identity.author && t.name.toLowerCase() === ref.toLowerCase());
    if (!match.length) match = all.filter((t) => t.name.toLowerCase() === ref.toLowerCase());
    if (match.length > 1) {
      const founded = match.filter((t) => this.core.spaces.get(t.id)?.founder === t.creator);
      if (founded.length === 1) return founded[0];
    }
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several people offer a tier "${ref}": name its creator (or join from their hub)` : `no tier "${ref}" is known`);
  }

  /** One of your own tiers' groups. */
  tierGroup(ref: string): StoredSpace {
    const tier = this.tierOffer(ref, this.node.identity.author);
    const group = this.core.spaces.get(tier.id);
    if (tier.creator !== this.node.identity.author || !group) throw new Error(`only ${this.node.nameOf(tier.creator) ?? 'its creator'} can let people into ${tier.name}`);
    return group;
  }

  tierInfo(tier: Tier): TierInfo {
    const group = this.core.spaces.get(tier.id);
    const state = group && this.core.state(group);
    const mine = tier.creator === this.node.identity.author;
    const me = state?.members.get(this.node.identity.author);
    const now = new Date().toISOString();
    const requested =
      !mine && !me && this.core.selfBodies(KIND_MEMBERSHIP_PENDING).some((b) => b.tier === tier.id && b.creator === tier.creator);
    return {
      id: tier.id,
      creator: { did: tier.creator, name: this.node.nameOf(tier.creator) },
      name: tier.name,
      price: tier.price,
      currency: tier.currency,
      description: tier.description,
      benefits: tier.benefits,
      position: tier.position,
      open: tier.open,
      auto: tier.auto,
      ...(tier.gumroad ? { gumroad: tier.gumroad } : {}),
      ...(tier.onchain ? { onchain: tier.onchain } : {}),
      mine,
      ...(mine && state ? { members: [...state.members.values()].filter((m) => m.did !== tier.creator && (!m.until || m.until > now)).length } : {}),
      ...(!mine && me?.until ? { membership: { until: me.until, active: me.until > now } } : {}),
      ...(requested ? { requested: true } : {}),
    };
  }

  /** Mark someone's open requests for a tier as answered. */
  async answerRequests(tier: string, member: Did): Promise<void> {
    for (const request of await this.membershipRequests()) {
      if (request.tier.id === tier && request.did === member) {
        this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_MEMBERSHIP_HANDLED, body: { request: request.id } }));
      }
    }
  }

  // ---------------------------------------------------------------- treasuries

  async walletMessage(address: string): Promise<string> {
    if (!isAddress(address)) throw new Error('a wallet address is 0x and 40 hex digits');
    return walletMessage(this.node.identity.author, address);
  }

  async linkWallet(input: { address: string; proof?: string }): Promise<WalletInfo | undefined> {
    if (input.address === '') {
      this.node.replica.write(this.node.identity, { kind: KIND_WALLET, body: { address: '' } });
      return undefined;
    }
    if (!isAddress(input.address)) throw new Error('a wallet address is 0x and 40 hex digits');
    const address = checksumAddress(input.address);
    if (!input.proof) throw new Error(`sign this with the wallet (personal_sign), then pass the signature as proof:\n${walletMessage(this.node.identity.author, address)}`);
    // A wallet with a key signs itself; a smart wallet's contract says whether the signature is its own (EIP-1271), on chain.
    let contract = false;
    if (!verifyWalletProof(this.node.identity.author, address, input.proof)) {
      const answer = await this.node.callChain(TREASURY_CHAIN.id, contractWalletCheck(this.node.identity.author, address, input.proof)).catch(() => '');
      if (!contractWalletSaysYes(answer)) throw new Error(`that signature isn't from ${address} (nor does it confirm it as a smart wallet on ${TREASURY_CHAIN.name}) over:\n${walletMessage(this.node.identity.author, address)}`);
      contract = true;
      this.recordContractCheck(this.node.identity.author, address, input.proof, true);
    }
    const before = this.wallets().get(this.node.identity.author);
    this.node.replica.write(this.node.identity, { kind: KIND_WALLET, body: { chain: `eip155:${TREASURY_CHAIN.id}`, address, proof: input.proof, ...(contract ? { contract: true } : {}) } });
    if (before?.verified && before.address !== address) await this.movedWallet(before.address, address);
    return this.wallet();
  }

  /**
   * After a new wallet: the old one is retired (people paying it are warned),
   * our tiers paid there now ask for the new one, and the treasuries we
   * maintain that were announced get their new address, the old one retired.
   */
  async movedWallet(old: string, now: string): Promise<void> {
    this.node.replica.write(this.node.identity, { kind: KIND_SAFE_RETIRED, body: { safe: old, successor: now, kind: 'wallet', owners: [], threshold: 1 } });
    for (const tier of this.tierOffers(this.node.identity.author)) {
      if (tier.onchain?.to.toLowerCase() === old.toLowerCase()) await this.setTier({ tier: tier.id, onchain: { ...tier.onchain, to: now } });
    }
    const announced = this.treasuries();
    for (const space of this.core.spaces.values()) {
      if ((space.kind !== 'project' && space.kind !== 'community') || !this.core.state(space).maintainers.has(this.node.identity.author) || !announced.has(space.id)) continue;
      await this.announceTreasury(space.id).catch(() => undefined);
    }
  }

  async wallet(who?: string): Promise<WalletInfo | undefined> {
    const owner = who ? this.node.resolve(who) : this.node.identity.author;
    const wallet = this.wallets().get(owner);
    if (!wallet) return undefined;
    return { owner: { did: owner, name: this.node.nameOf(owner) }, address: wallet.address, verified: wallet.verified, ...(wallet.contract ? { contract: true as const } : {}), time: wallet.time, mine: owner === this.node.identity.author };
  }

  async treasury(ref: string): Promise<TreasuryInfo> {
    const space = this.core.space(ref);
    if (space.kind !== 'project' && space.kind !== 'community') throw new Error(`${space.name} is a ${space.kind}: only projects and communities have a treasury`);
    const state = this.core.state(space);
    const wallets = this.wallets();
    const person = (did: Did) => ({ did, name: this.node.nameOf(did) });
    const owners: TreasuryInfo['owners'] = [];
    const missing: TreasuryInfo['missing'] = [];
    for (const did of state.maintainers) {
      const wallet = wallets.get(did);
      if (wallet?.verified) owners.push({ person: person(did), address: wallet.address });
      else missing.push(person(did));
    }
    owners.sort((a, b) => a.address.toLowerCase().localeCompare(b.address.toLowerCase()));
    const threshold = treasuryThreshold(owners.length);
    const ownerAddresses = owners.map((o) => o.address);
    const address = owners.length ? safeAddress(ownerAddresses, threshold, treasurySaltNonce(space.id)) : undefined;
    const announced = this.treasuries();
    const { current, pending } = space.kind === 'project' ? splitOf(this.core.entries(space), state.maintainers, new Date(this.node.clock()), this.core.seenAt) : {};
    const splitInfo = (split: Split): SplitInfo => ({ ...split, makers: split.makers.map((m) => ({ person: person(m.did), share: m.share })), by: person(split.by) });
    // A space this node holds pays its treasury as computed here from its maintainers' wallets, never as someone announced it (7iriYk4C).
    const paid = new Map(announced);
    for (const id of [current?.community, WEAVE_FOUNDATION_PROJECT]) {
      const held = id ? this.core.spaces.get(id) : undefined;
      if (!id || !held) continue;
      const own = this.treasuryAddressOf(held);
      if (own) paid.set(id, { space: id, kind: held.kind === 'community' ? 'community' : 'project', address: own, owners: [], threshold: 0, by: this.node.identity.author, time: '', consistent: true });
      else paid.delete(id);
    }
    const recipients = current
      ? splitRecipients(current, { project: space.id, maintainers: [...state.maintainers], wallets, ...(address ? { treasury: address } : {}), treasuries: paid, ...(WEAVE_FOUNDATION_PROJECT ? { foundation: WEAVE_FOUNDATION_PROJECT } : {}) })
      : undefined;
    const allocations = recipients && splitAllocations(recipients);
    const recipientName = (r: { kind: string; id: string }) => (r.kind === 'person' ? this.node.nameOf(r.id as Did) : r.kind === 'foundation' ? 'Weave Foundation' : this.core.spaces.get(r.id)?.name);
    return {
      project: { id: space.id, name: space.name },
      kind: space.kind,
      chain: { id: TREASURY_CHAIN.id, name: TREASURY_CHAIN.name, explorer: TREASURY_CHAIN.explorer },
      ...(address ? { address } : {}),
      threshold,
      owners,
      missing,
      ...(current ? { split: splitInfo(current) } : {}),
      ...(pending ? { pending: splitInfo(pending) } : {}),
      presets: SPLIT_PRESETS,
      ...(recipients ? { recipients: recipients.map((r) => ({ ...r, name: recipientName(r) })) } : {}),
      ...(allocations ? { allocations } : {}),
      ...(address ? { deploy: safeDeployment(ownerAddresses, threshold, treasurySaltNonce(space.id)) } : {}),
      ...(address && allocations ? { splitDeploy: splitDeployment(allocations, address, splitSalt(space.id)) } : {}),
      announced: !!address && announced.get(space.id)?.address === address,
      retired: [...this.retired().values()].filter((r) => r.kind === 'treasury' && r.space === space.id).map((r) => ({ address: r.address, successor: r.successor, time: r.time })),
      maintainer: state.maintainers.has(this.node.identity.author),
    };
  }

  async splitContract(ref: string): Promise<SplitContractInfo> {
    const t = await this.treasury(ref);
    if (t.kind !== 'project') throw new Error(`${t.project.name} is a community: splits are for projects`);
    if (!t.split) throw new Error(`${t.project.name} has no split yet (weave split <preset>)`);
    if (!t.address || !t.allocations) throw new Error(`${t.project.name} has no treasury yet: a maintainer has to link a wallet first`);
    const salt = splitSalt(t.project.id);
    // The factory says where the split is and whether it exists: one read-only call answers both.
    const answer = await this.node.callChain(t.chain.id, splitDeployedCall(t.allocations, t.address, salt));
    const address = checksumAddress('0x' + answer.slice(26, 66));
    return { chain: t.chain, address, deployed: BigInt('0x' + answer.slice(66, 130)) === 1n, deploy: splitDeployment(t.allocations, t.address, salt), allocations: t.allocations };
  }

  async announceTreasury(ref: string): Promise<TreasuryInfo> {
    const space = this.core.space(ref);
    this.core.maintainerState(space);
    const treasury = await this.treasury(space.id);
    if (!treasury.address) throw new Error(`${space.name} has no treasury yet: its ${space.kind === 'community' ? 'moderators' : 'maintainers'} need to link a wallet first`);
    if (!treasury.announced) {
      // Its owners changed wallets: the treasury announced before is retired, and says where money goes now.
      const before = this.treasuries().get(space.id);
      if (before && before.address !== treasury.address) {
        this.node.replica.write(this.node.identity, { kind: KIND_SAFE_RETIRED, body: { safe: before.address, successor: treasury.address, kind: 'treasury', space: space.id, owners: before.owners, threshold: before.threshold } });
      }
      this.node.replica.write(this.node.identity, { kind: KIND_TREASURY, body: { space: space.id, kind: treasury.kind, address: treasury.address, owners: treasury.owners.map((o) => o.address), threshold: treasury.threshold } });
    }
    return this.treasury(space.id);
  }

  async sweepRetired(ref: string): Promise<Array<{ safe: string; balance: string; proposal?: SafeProposalInfo; deploy: { to: string; data: string } }>> {
    const space = this.core.space(ref);
    const current = (await this.treasury(space.id)).address;
    const out: Array<{ safe: string; balance: string; proposal?: SafeProposalInfo; deploy: { to: string; data: string } }> = [];
    for (const retired of this.retired().values()) {
      if (retired.kind !== 'treasury' || retired.space !== space.id) continue;
      const to = retired.successor || current;
      if (!to) continue;
      const balance = BigInt(await this.node.callChain(TEST_USDC.chain, { to: TEST_USDC.token, data: erc20BalanceOf(retired.address) }));
      // An old Safe that was never put on chain has to be deployed first, with its old owners, before it can send anything.
      const deploy = safeDeployment(retired.owners, retired.threshold, treasurySaltNonce(space.id));
      if (!balance) {
        out.push({ safe: retired.address, balance: '0', deploy });
        continue;
      }
      const open = this.allSafeProposals().find((p) => p.safe === retired.address && p.title.startsWith('Move what is left'));
      const proposal = open ? this.safeProposalInfo(open.id) : await this.proposeSafeTx({ safe: retired.address, tx: { to: TEST_USDC.token, data: erc20Transfer(to, balance) }, title: `Move what is left (${formatUnits(balance, TEST_USDC.decimals)} USDC) to ${to}` });
      out.push({ safe: retired.address, balance: balance.toString(), proposal, deploy });
    }
    return out;
  }

  retired() {
    const history = this.walletHistory();
    return retiredOf(this.node.replica.events((e) => e.kind === KIND_SAFE_RETIRED), (r) => (r.kind === 'wallet' ? history.get(r.address.toLowerCase()) === r.by : !!r.space && this.manages(r.space, r.by)));
  }

  /** Whether someone manages a space we know: outside it, we can't tell, and say no. */
  manages(spaceId: string, did: Did): boolean {
    const space = this.core.spaces.get(spaceId);
    return !!space && mayAct(this.core.state(space), did, 'manage').ok;
  }

  async label(input: { target: string; label: 'endorse' | 'block' | ''; reason?: string }): Promise<LabelInfo | undefined> {
    const target = isAddress(input.target) ? labelTarget(input.target) : parseLabelTarget(input.target);
    if (!target) throw new Error("a label's target is an address (0x…) or eip155:<chain id>:<address>");
    if (input.label && input.label !== 'endorse' && input.label !== 'block') throw new Error('a label is endorse or block ("" withdraws yours)');
    const reason = input.reason?.trim().slice(0, 500) ?? '';
    if (input.label === 'block' && !reason) throw new Error('say why you block it: people following your labels see the reason');
    this.node.replica.write(this.node.identity, { kind: KIND_LABEL, body: { target, label: input.label, ...(reason ? { reason } : {}) } });
    return (await this.labels({ target, by: [this.node.identity.author] }))[0];
  }

  async labels(input: { target?: string; by?: string[] } = {}): Promise<LabelInfo[]> {
    const target = input.target ? (isAddress(input.target) ? labelTarget(input.target) : parseLabelTarget(input.target)) : undefined;
    const by = input.by ? new Set(input.by.map((who) => this.node.resolve(who))) : undefined;
    // Retired addresses are labels too, from their owners: whoever pays them is warned and told where to pay instead.
    const retired = [...this.retired().values()].map((r) => ({ target: labelTarget(r.address), label: 'retired' as const, reason: r.successor ? `retired: pay ${r.successor} instead` : 'retired', by: r.by, time: r.time }));
    return [...labelsOf(this.node.replica.events((e) => e.kind === KIND_LABEL)), ...retired]
      .filter((l) => (!target || l.target === target) && (!by || by.has(l.by)))
      .map((l) => ({ ...l, by: { did: l.by, name: this.node.nameOf(l.by) }, mine: l.by === this.node.identity.author }));
  }

  async setSplit(input: { project: string; preset?: string; shares?: { makers: number; treasury?: number; community?: number; foundation?: number }; makers?: Array<{ who: string; share: number }>; community?: string }): Promise<TreasuryInfo> {
    const project = this.core.project(input.project);
    this.core.maintainerState(project);
    const preset = input.shares ? 'custom' : (input.preset ?? 'standard');
    const shares = input.shares ? parseShares(input.shares) : SPLIT_PRESETS[preset];
    if (!shares) throw new Error(input.shares ? 'shares are whole basis points (10000 = 100%) that add up to 10000' : `no preset "${preset}": ${Object.keys(SPLIT_PRESETS).join(', ')}`);
    const makers = (input.makers ?? []).map((m) => ({ did: this.node.resolve(m.who), share: m.share }));
    if (makers.length && (!makers.every((m) => Number.isInteger(m.share) && m.share > 0) || makers.reduce((sum, m) => sum + m.share, 0) !== 10000)) throw new Error("the makers' shares are whole basis points of their part, adding up to 10000");
    let community: string | undefined;
    if (input.community) {
      const space = this.core.space(input.community);
      if (space.kind !== 'community') throw new Error(`${space.name} is not a community`);
      community = space.id;
    }
    const body: Record<string, Json> = { preset, shares: { ...shares } };
    if (makers.length) body.makers = makers;
    if (community) body.community = community;
    await this.node.publish({ kind: KIND_TREASURY_SPLIT, body, space: project.id });
    // A split names the treasury it pays: announce it, so others can see where the money goes.
    if ((await this.treasury(project.id)).address) return this.announceTreasury(project.id);
    return this.treasury(project.id);
  }

  wallets() {
    return walletsOf(this.node.replica.events((e) => e.kind === KIND_WALLET), this.contractChecked);
  }

  /** What the chain said about smart wallets' signatures (owner, address and proof → ok), from our sealed records. */
  contractChecks?: Map<string, boolean>;
  contractChecked = (owner: Did, address: string, proof: string): boolean | undefined => {
    if (!this.contractChecks) {
      this.contractChecks = new Map();
      for (const b of this.core.selfBodies(KIND_WALLET_CHECKED)) this.contractChecks.set(`${b.owner} ${String(b.address).toLowerCase()} ${b.proof}`, b.ok === true);
    }
    return this.contractChecks.get(`${owner} ${address.toLowerCase()} ${proof}`);
  };

  recordContractCheck(owner: Did, address: string, proof: string, ok: boolean): void {
    this.contractChecked(owner, address, proof); // loads what's recorded
    this.contractChecks!.set(`${owner} ${address.toLowerCase()} ${proof}`, ok);
    this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_WALLET_CHECKED, body: { owner, address, proof, ok } }));
  }

  /** Ask the chain about smart wallets others linked that we haven't asked about yet. */
  async checkContractWallets(): Promise<number> {
    let checked = 0;
    for (const link of contractWalletLinks(this.node.replica.events((e) => e.kind === KIND_WALLET))) {
      if (this.contractChecked(link.owner, link.address, link.proof) !== undefined) continue;
      let answer: string;
      try {
        answer = await this.node.callChain(TREASURY_CHAIN.id, contractWalletCheck(link.owner, link.address, link.proof));
      } catch {
        continue; // offline: ask again next round
      }
      this.recordContractCheck(link.owner, link.address, link.proof, contractWalletSaysYes(answer));
      checked++;
    }
    return checked;
  }

  walletHistory() {
    return walletHistoryOf(this.node.replica.events((e) => e.kind === KIND_WALLET), this.contractChecked);
  }

  treasuries() {
    return treasuriesOf(this.node.replica.events((e) => e.kind === KIND_TREASURY), (space, author) => this.manages(space, author));
  }

  // ---------------------------------------------------------------- signing a Safe's transactions together

  async proposeSafeTx(input: { safe: string; tx: { to: string; value?: string; data: string; operation?: 0 | 1 }; title: string }): Promise<SafeProposalInfo> {
    const safe = this.knownSafe(input.safe);
    if (!safe.owners.some((o) => o.did === this.node.identity.author)) throw new Error(`only the owners of ${safe.label} propose its transactions`);
    // The Safe's next nonce from the chain; a Safe not deployed yet starts at 0.
    const answer = await this.node.callChain(TREASURY_CHAIN.id, { to: safe.address, data: SAFE_CALLS.nonce });
    const nonce = answer && answer !== '0x' ? Number(BigInt(answer)) : 0;
    const tx = parseSafeTx({ to: input.tx.to, value: input.tx.value ?? '0', data: input.tx.data, operation: input.tx.operation ?? 0, nonce });
    if (!tx) throw new Error('a Safe transaction has a target address, data (0x…) and an operation (0 call, 1 delegatecall)');
    if (tx.operation === 1 && tx.to.toLowerCase() !== MULTI_SEND_CALL_ONLY.toLowerCase()) throw new Error('Weave only proposes delegatecalls to MultiSendCallOnly');
    const id = b64u.encode(randomBytes(12));
    this.node.replica.write(this.node.identity, { kind: KIND_SAFE_PROPOSAL, body: { proposal: id, chain: TREASURY_CHAIN.id, safe: safe.address, ...tx, title: input.title.trim().slice(0, 200) } as unknown as Json });
    return this.safeProposalInfo(id);
  }

  async signSafeTx(input: { proposal: string; signature: string }): Promise<SafeProposalInfo> {
    const proposal = this.safeProposal(input.proposal);
    const safe = this.knownSafe(proposal.safe);
    // A wallet signed the typed data or the hash as a message; the signature alone doesn't say which: take the reading that gives an owner.
    const isOwner = (s: { owner: string } | undefined) => !!s && safe.owners.some((o) => o.address.toLowerCase() === s.owner.toLowerCase());
    const signed = [safeSigner(proposal.hash, input.signature.trim()), safeSigner(proposal.hash, asEthSign(input.signature.trim()))].find(isOwner);
    if (!signed) throw new Error(`that isn't a signature of one of ${safe.label}'s owners over ${proposal.hash} (sign the typed data, or the hash as a message)`);
    this.node.replica.write(this.node.identity, { kind: KIND_SAFE_SIGNATURE, body: { proposal: proposal.id, hash: proposal.hash, signature: signed.signature } });
    return this.safeProposalInfo(proposal.id);
  }

  async safeProposals(safe?: string): Promise<SafeProposalInfo[]> {
    const address = safe ? this.knownSafe(safe).address : undefined;
    return this.allSafeProposals()
      .filter((p) => !address || p.safe === address)
      .map((p) => this.safeProposalInfo(p.id));
  }

  /** The Safes this node knows the owners of: the treasuries of its projects and communities, and the shows' Safes. */
  knownSafes(): Array<{ address: string; label: string; owners: Array<{ did: Did; address: string }>; threshold: number }> {
    const wallets = this.wallets();
    const history = this.walletHistory();
    const out: Array<{ address: string; label: string; owners: Array<{ did: Did; address: string }>; threshold: number }> = [];
    const ownersOf = (dids: Iterable<Did>) => [...dids].flatMap((did) => (wallets.get(did)?.verified ? [{ did, address: wallets.get(did)!.address }] : []));
    // Recorded owners: the wallets a Safe was made for, whoever linked them, even if they moved on since.
    const recorded = (addresses: string[]) => addresses.flatMap((address) => (history.get(address.toLowerCase()) ? [{ did: history.get(address.toLowerCase())!, address }] : []));
    for (const space of this.core.spaces.values()) {
      if (space.kind !== 'project' && space.kind !== 'community') continue;
      const owners = ownersOf(this.core.state(space).maintainers);
      const address = this.treasuryAddressOf(space);
      if (address) out.push({ address, label: `${space.name}'s treasury`, owners, threshold: treasuryThreshold(owners.length) });
    }
    for (const show of this.allShows()) {
      if (show.owners) out.push({ address: show.price.to, label: `the Safe of ${show.name}`, owners: recorded(show.owners), threshold: show.threshold ?? treasuryThreshold(show.owners.length) });
      else {
        // Shows from before owners were recorded: their hosts' wallets now.
        const owners = ownersOf(show.hosts);
        if (owners.length === show.hosts.length) out.push({ address: show.price.to, label: `the Safe of ${show.name}`, owners, threshold: treasuryThreshold(owners.length) });
      }
    }
    for (const retired of this.retired().values()) {
      if (retired.kind !== 'treasury' || out.some((s) => s.address === retired.address)) continue;
      const space = retired.space ? this.core.spaces.get(retired.space) : undefined;
      out.push({ address: retired.address, label: `${space?.name ?? 'a'} retired treasury`, owners: recorded(retired.owners), threshold: retired.threshold });
    }
    return out;
  }

  knownSafe(ref: string): { address: string; label: string; owners: Array<{ did: Did; address: string }>; threshold: number } {
    const found = this.knownSafes().find((s) => s.address.toLowerCase() === ref.toLowerCase());
    if (!found) throw new Error(`Weave doesn't know whose Safe ${ref} is: only treasuries and shows' Safes it knows the owners of`);
    return found;
  }

  allSafeProposals() {
    return safeProposalsOf(this.node.replica.events((e) => e.kind === KIND_SAFE_PROPOSAL || e.kind === KIND_SAFE_SIGNATURE));
  }

  safeProposal(ref: string) {
    const match = this.allSafeProposals().filter((p) => p.id === ref || (ref.length >= 6 && p.id.startsWith(ref)));
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several proposals start with "${ref}"` : `no proposal "${ref}" is known`);
  }

  safeProposalInfo(id: string): SafeProposalInfo {
    const proposal = this.safeProposal(id);
    const safe = this.knownSafes().find((s) => s.address === proposal.safe);
    const owners = safe?.owners ?? [];
    // Only signatures of today's owners count.
    const signatures = proposal.signatures.flatMap((s) => {
      const owner = owners.find((o) => o.address.toLowerCase() === s.owner.toLowerCase());
      return owner ? [{ ...s, person: { did: owner.did, name: this.node.nameOf(owner.did) } }] : [];
    });
    const threshold = safe?.threshold ?? 1;
    const ready = signatures.length >= threshold;
    return {
      id: proposal.id,
      title: proposal.title,
      safe: { address: proposal.safe, label: safe?.label ?? proposal.safe, threshold },
      chain: proposal.chain,
      tx: proposal.tx,
      hash: proposal.hash,
      typedData: safeTxTypedData(proposal.chain, proposal.safe, proposal.tx),
      by: { did: proposal.by, name: this.node.nameOf(proposal.by) },
      time: proposal.time,
      signed: signatures.map((s) => ({ person: s.person, owner: s.owner })),
      waiting: owners.filter((o) => !signatures.some((s) => s.owner.toLowerCase() === o.address.toLowerCase())).map((o) => ({ did: o.did, name: this.node.nameOf(o.did) })),
      ...(ready ? { exec: { to: proposal.safe, data: execTransactionData(proposal.tx, signatures.slice(0, threshold)) } } : {}),
      mine: owners.some((o) => o.did === this.node.identity.author),
      signedByMe: signatures.some((s) => s.person.did === this.node.identity.author),
    };
  }

  // ---------------------------------------------------------------- paying from a wallet, without copying anything

  async paymentRequest(input: { tier?: string; creator?: string; show?: string }): Promise<PaymentRequestInfo> {
    const { price, what } = this.payable(input);
    const wallet = this.wallets().get(this.node.identity.author);
    if (!wallet?.verified) throw new Error('link your wallet first (weave wallet link): Weave looks for your payment from it');
    const since = Number(BigInt(await this.node.chainRpc<string>(price.chain, 'eth_blockNumber', [])));
    return {
      what,
      chain: price.chain,
      token: price.token,
      symbol: price.symbol,
      decimals: price.decimals,
      to: price.to,
      amount: String(price.amount),
      from: wallet.address,
      // EIP-681: phone wallets open this as "send <amount> of the token to <to>", from a QR code.
      uri: `ethereum:${price.token}@${price.chain}/transfer?address=${price.to}&uint256=${price.amount}`,
      // The same as a transaction for a wallet in the browser (eth_sendTransaction).
      tx: { from: wallet.address, to: price.token, data: erc20Transfer(price.to, BigInt(price.amount)), chainId: '0x' + price.chain.toString(16) },
      since,
    };
  }

  async findPayment(input: { tier?: string; creator?: string; show?: string; since: number }): Promise<{ found?: string; checkedTo: number }> {
    const { price } = this.payable(input);
    // From any wallet we ever linked (we may have moved on), to the address asked for.
    const mine = [...this.walletHistory()].filter(([, did]) => did === this.node.identity.author).map(([address]) => '0x' + address.slice(2).padStart(64, '0'));
    if (!mine.length) throw new Error('link your wallet first (weave wallet link)');
    const latest = Number(BigInt(await this.node.chainRpc<string>(price.chain, 'eth_blockNumber', [])));
    let from = Math.max(0, input.since);
    // Public nodes answer at most a couple of hundred blocks per question: look in steps, a few per call.
    for (let steps = 0; from <= latest && steps < 25; steps++) {
      const to = Math.min(latest, from + 199);
      const logs = await this.node.chainRpc<Array<{ transactionHash: string; data: string }>>(price.chain, 'eth_getLogs', [
        { address: price.token, topics: [TRANSFER_TOPIC, mine, '0x' + price.to.slice(2).toLowerCase().padStart(64, '0')], fromBlock: '0x' + from.toString(16), toBlock: '0x' + to.toString(16) },
      ]);
      const paid = logs.find((l) => BigInt(l.data) >= BigInt(price.amount));
      if (paid) {
        // Found: send it on, as if its hash had been pasted.
        if (input.tier) await this.requestMembership({ tier: input.tier, ...(input.creator ? { creator: input.creator } : {}), payment: paid.transactionHash });
        else await this.buyTicket({ show: input.show!, ...(input.creator ? { host: input.creator } : {}), payment: paid.transactionHash });
        return { found: paid.transactionHash, checkedTo: to };
      }
      from = to + 1;
    }
    return { checkedTo: from - 1 };
  }

  /** What a tier or show asks to be paid, and where. */
  payable(input: { tier?: string; creator?: string; show?: string }): { price: OnchainPrice; what: string } {
    if (input.tier) {
      const tier = this.tierOffer(input.tier, input.creator ? this.node.resolve(input.creator) : undefined);
      if (!tier.onchain) throw new Error(`${tier.name} isn't paid on chain`);
      return { price: tier.onchain, what: `a month of ${tier.name}` };
    }
    if (input.show) {
      const show = this.showRef(input.show, input.creator ? this.node.resolve(input.creator) : undefined);
      return { price: show.price, what: `a ticket to ${show.name}` };
    }
    throw new Error('pay for what? a tier or a show');
  }

  // ---------------------------------------------------------------- ticketed events

  async createShow(input: { name: string; project?: string; room?: string; starts: string; ends: string; price: number; capacity?: number; hosts?: string[]; split?: Array<{ to: string; share: number }> }): Promise<ShowInfo> {
    const id = b64u.encode(randomBytes(16));
    const project = input.project ? this.core.project(input.project) : undefined;
    const hosts = [...new Set([this.node.identity.author, ...(input.hosts ?? []).map((who) => this.node.resolve(who))])];
    const wallets = this.wallets();
    const without = hosts.filter((did) => !wallets.get(did)?.verified);
    if (without.length) throw new Error(`every host needs a linked wallet: the show's Safe is theirs (missing: ${without.map((did) => this.node.nameOf(did) ?? did).join(', ')})`);
    const owners = hosts.map((did) => wallets.get(did)!.address);
    const safe = safeAddress(owners, treasuryThreshold(owners.length), showSaltNonce(id));
    if (!Number.isSafeInteger(input.price) || input.price < 1) throw new Error("a ticket's price is a whole number of the token's smallest unit (1 USDC = 1000000)");
    // Without a split, everything goes to the project's treasury, or else to the host.
    const split = (input.split?.length ? input.split : [{ to: project ? 'project' : this.node.identity.author, share: 10000 }]).map((part) => ({ to: this.showRecipient(part.to, project), share: part.share }));
    if (!parseShowSplit(split)) throw new Error('a split names people or addresses with whole basis points adding up to 10000');
    const body: Record<string, Json> = {
      show: id,
      name: input.name.trim().slice(0, 80),
      starts: new Date(input.starts).toISOString(),
      ends: new Date(input.ends).toISOString(),
      price: { chain: TEST_USDC.chain, token: TEST_USDC.token, symbol: TEST_USDC.symbol, decimals: TEST_USDC.decimals, to: safe, amount: input.price },
      hosts,
      // The wallets the Safe is made for: its owners from now on, whatever wallets the hosts link later.
      owners,
      threshold: treasuryThreshold(owners.length),
      split,
    };
    if (!body.name || Number.isNaN(Date.parse(input.starts)) || Number.isNaN(Date.parse(input.ends)) || input.ends <= input.starts) throw new Error('a show has a name, and a start before its end');
    if (project) body.project = project.id;
    if (input.room) body.room = input.room.slice(0, 100);
    if (input.capacity) body.capacity = input.capacity;
    this.node.replica.write(this.node.identity, { kind: KIND_SHOW, body });
    return this.showInfo(this.showRef(id));
  }

  async cancelShow(ref: string): Promise<ShowInfo> {
    const show = this.showRef(ref);
    if (show.host !== this.node.identity.author) throw new Error(`only ${this.node.nameOf(show.host) ?? 'its host'} can call ${show.name} off`);
    const { id, host: _host, time: _time, cancelled: _cancelled, ...rest } = show;
    this.node.replica.write(this.node.identity, { kind: KIND_SHOW, body: { show: id, ...rest, cancelled: true } as unknown as Json });
    return this.showInfo(this.showRef(id));
  }

  async shows(project?: string): Promise<ShowInfo[]> {
    const id = project ? this.core.project(project).id : undefined;
    return this.allShows()
      .filter((s) => !id || s.project === id)
      .map((s) => this.showInfo(s));
  }

  async buyTicket(input: { show: string; host?: string; payment: string }): Promise<void> {
    const show = this.showRef(input.show, input.host ? this.node.resolve(input.host) : undefined);
    if (show.cancelled) throw new Error(`${show.name} is called off`);
    if (Date.parse(show.ends) < this.node.clock()) throw new Error(`${show.name} is over`);
    const payment = input.payment.trim().toLowerCase();
    if (!isTxHash(payment)) throw new Error("a payment is the transaction's hash: 0x and 64 hex digits");
    if (!this.wallets().get(this.node.identity.author)?.verified) throw new Error('link the wallet you paid from first (weave wallet link): that is how the host knows the payment is yours');
    await this.node.join(show.host);
    this.node.replica.write(this.node.identity, ticketRequest(this.core.encryptionKeyOf(show.host), { show: show.id, payment, entry: this.core.entryPoint() }));
  }

  async tickets(ref: string): Promise<TicketInfo[]> {
    const show = this.showRef(ref);
    const person = (did: Did) => ({ did, name: this.node.nameOf(did) });
    if (show.host === this.node.identity.author) {
      const out: TicketInfo[] = this.ticketRecords(show.id).map((r) => ({ holder: person(r.holder), tx: r.tx, from: r.from, value: r.value, ok: true }));
      for (const [request, answer] of this.ticketChecks) {
        if (answer === 'checking' || answer.show !== show.id || answer.ok) continue;
        out.push({ holder: person(answer.holder), tx: answer.tx, ok: false, ...(answer.reason ? { reason: answer.reason } : {}), request });
      }
      return out;
    }
    return this.myTickets()
      .filter((t) => t.show === show.id)
      .map((t) => ({ holder: person(this.node.identity.author), tx: t.tx, ok: true }));
  }

  async settleShow(input: { show: string; action: 'payout' | 'refund' }): Promise<ShowSettlement> {
    const show = this.showRef(input.show);
    if (!show.hosts.includes(this.node.identity.author)) throw new Error(`only the hosts of ${show.name} can settle it`);
    const info = this.showInfo(show);
    const balance = BigInt(await this.node.callChain(show.price.chain, { to: show.price.token, data: erc20BalanceOf(info.safe.address) }));
    let calls: Array<{ to: string; data: string }>;
    if (input.action === 'refund') {
      if (show.host !== this.node.identity.author) throw new Error(`${this.node.nameOf(show.host) ?? 'its host'} keeps who paid: ask them for the refund`);
      calls = this.ticketRecords(show.id).map((r) => ({ to: show.price.token, data: erc20Transfer(r.from, BigInt(r.value)) }));
    } else {
      if (show.cancelled) throw new Error(`${show.name} is called off: pay everyone back instead (refund)`);
      if (Date.parse(show.ends) > this.node.clock()) throw new Error(`${show.name} isn't over yet: pay out after it (${show.ends})`);
      const missing = info.split.filter((p) => !p.address);
      if (missing.length) throw new Error(`no address yet for ${missing.map((p) => p.name ?? p.to).join(', ')}: they need a linked wallet or treasury`);
      calls = payouts(balance, info.split.map((p) => ({ address: p.address!, share: p.share }))).map((p) => ({ to: show.price.token, data: erc20Transfer(p.address, p.amount) }));
    }
    if (!calls.length) throw new Error(input.action === 'refund' ? `nobody has a ticket to ${show.name}: there is nothing to pay back` : `the Safe of ${show.name} holds nothing yet`);
    const total = calls.reduce((sum, c) => sum + BigInt('0x' + c.data.slice(74)), 0n);
    if (total > balance) throw new Error(`the Safe holds ${formatUnits(balance, show.price.decimals)} ${show.price.symbol}, the ${input.action} needs ${formatUnits(total, show.price.decimals)}`);
    const name = `${show.name}: ${input.action === 'refund' ? 'pay everyone back' : 'pay out by the split'}`;
    const multiSend = { to: MULTI_SEND_CALL_ONLY, data: multiSendData(calls), operation: 1 as const };
    const proposal = await this.proposeSafeTx({ safe: info.safe.address, tx: multiSend, title: name });
    return {
      proposal,
      safe: info.safe.address,
      balance: balance.toString(),
      total: total.toString(),
      calls,
      multiSend,
      batch: safeBatch({ chain: show.price.chain, safe: info.safe.address, name, description: `${calls.length} transfer${calls.length === 1 ? '' : 's'} of ${show.price.symbol}, prepared by Weave`, calls }),
    };
  }

  /** Who a split part names: 'project' (its treasury), a person, or an address as it is. */
  showRecipient(to: string, project?: StoredSpace): string {
    if (to === 'project') {
      if (!project) throw new Error("'project' in a split needs the show to belong to a project");
      return `project:${project.id}`;
    }
    return isAddress(to) ? to : this.node.resolve(to);
  }

  /** Let in everyone who paid for a ticket to one of our shows: read once on chain, from their own wallet, each transaction once. */
  async grantTickets(): Promise<number> {
    const mine = new Map(this.allShows().filter((s) => s.host === this.node.identity.author).map((s) => [s.id, s]));
    if (!mine.size) return 0;
    const used = new Set(this.core.selfBodies(KIND_TICKET_RECORD).map((b) => b.tx));
    let granted = 0;
    for (const event of this.node.replica.events((e) => e.kind === KIND_TICKET_REQUEST && e.author !== this.node.identity.author)) {
      if (this.ticketChecks.has(event.id)) continue;
      const request = this.core.tryOpen((me) => openTicketRequest(event, me));
      const show = request && mine.get(request.show);
      if (!request || !show) continue;
      const answer = (ok: boolean, reason?: string) => this.ticketChecks.set(event.id, { show: show.id, holder: event.author, tx: request.payment, ok, ...(reason ? { reason } : {}) });
      if (used.has(request.payment)) {
        const first = this.ticketRecords(show.id).find((r) => r.tx === request.payment);
        if (first?.holder !== event.author) answer(false, `that transaction already got ${this.node.nameOf(first?.holder as Did) ?? 'someone'} in`);
        else answer(true);
        continue;
      }
      if (show.cancelled) {
        answer(false, `${show.name} is called off`);
        continue;
      }
      if (show.capacity && this.ticketRecords(show.id).length >= show.capacity) {
        answer(false, `all ${show.capacity} tickets are gone`);
        continue;
      }
      this.ticketChecks.set(event.id, 'checking');
      let check: PaymentCheck;
      try {
        check = await this.node.checkPayment(show.price, request.payment);
      } catch {
        this.ticketChecks.delete(event.id); // offline: try again next round
        continue;
      }
      if (!check.ok && /pending/.test(check.reason ?? '')) {
        this.ticketChecks.delete(event.id);
        continue;
      }
      if (check.ok && this.walletHistory().get(check.from?.toLowerCase() ?? '') !== event.author) check = { ok: false, reason: `paid from ${check.from}, which isn't ${this.node.nameOf(event.author) ?? 'their'}'s linked wallet` };
      if (!check.ok) {
        answer(false, check.reason);
        continue;
      }
      // One ticket per price paid; what's paid on top stays in the Safe and is paid back on a refund.
      this.node.replica.write(this.node.identity, this.core.sealForSelf({ kind: KIND_TICKET_RECORD, body: { show: show.id, holder: event.author, tx: request.payment, from: check.from!, value: check.value! } }));
      this.node.replica.write(this.node.identity, ticketFor(this.core.encryptionKeyOf(event.author), { show: show.id, tx: request.payment }));
      used.add(request.payment);
      answer(true);
      granted++;
    }
    return granted;
  }

  /** The tickets sold for one of our shows, as we recorded them. */
  ticketRecords(show: string): Array<{ holder: Did; tx: string; from: string; value: string }> {
    return this.core.selfBodies(KIND_TICKET_RECORD)
      .filter((b) => b.show === show && isDid(b.holder) && typeof b.tx === 'string' && typeof b.from === 'string' && typeof b.value === 'string')
      .map((b) => ({ holder: b.holder as Did, tx: b.tx as string, from: b.from as string, value: b.value as string }));
  }

  /** Tickets we hold, from what hosts boxed to us. */
  myTickets(): Array<{ show: string; tx: string; host: Did }> {
    const out: Array<{ show: string; tx: string; host: Did }> = [];
    for (const event of this.node.replica.events((e) => e.kind === KIND_TICKET && e.author !== this.node.identity.author)) {
      const ticket = this.core.tryOpen((me) => openTicket(event, me));
      if (ticket) out.push({ ...ticket, host: event.author });
    }
    return out;
  }

  /** A project's or community's treasury address from its maintainers' linked wallets, as treasury() computes it. */
  treasuryAddressOf(space: StoredSpace): string | undefined {
    const wallets = this.wallets();
    const owners = [...this.core.state(space).maintainers].map((did) => wallets.get(did)).filter((w) => w?.verified).map((w) => w!.address);
    return owners.length ? safeAddress(owners, treasuryThreshold(owners.length), treasurySaltNonce(space.id)) : undefined;
  }

  allShows(): Show[] {
    return showsOf(this.node.replica.events((e) => e.kind === KIND_SHOW));
  }

  /** A show by id, or by name (ours first). */
  /** A show by id or name, of `host` if given. Anyone can publish a show under another's id: then ours (as a host) is meant, or the host has to be named. */
  showRef(ref: string, host?: Did): Show {
    const all = this.allShows().filter((s) => !host || s.host === host);
    let match = all.filter((s) => s.id === ref);
    if (!match.length) match = all.filter((s) => s.name.toLowerCase() === ref.toLowerCase());
    if (match.length > 1) {
      const ours = match.filter((s) => s.hosts.includes(this.node.identity.author));
      if (ours.length === 1) return ours[0];
    }
    if (match.length === 1) return match[0];
    throw new Error(match.length ? `several shows "${ref}": name its host` : `no show "${ref}" is known`);
  }

  showInfo(show: Show): ShowInfo {
    const wallets = this.wallets();
    const person = (did: Did) => ({ did, name: this.node.nameOf(did) });
    const owners = show.owners ?? show.hosts.map((did) => wallets.get(did)).filter((w) => w?.verified).map((w) => w!.address);
    const threshold = show.threshold ?? treasuryThreshold(owners.length || 1);
    const treasuries = this.treasuries();
    const split = show.split.map((part) => {
      if (part.to.startsWith('project:')) {
        const id = part.to.slice('project:'.length);
        const space = this.core.spaces.get(id);
        const announced = treasuries.get(id);
        const address = space ? this.treasuryAddressOf(space) : announced?.consistent ? announced.address : undefined;
        return { to: part.to, name: space?.name ?? 'the project', share: part.share, ...(address ? { address } : {}) };
      }
      if (isDid(part.to)) {
        const wallet = wallets.get(part.to);
        return { to: part.to, name: this.node.nameOf(part.to), share: part.share, ...(wallet?.verified ? { address: wallet.address } : {}) };
      }
      return { to: part.to, share: part.share, address: part.to };
    });
    const mine = show.host === this.node.identity.author;
    const ticket = this.myTickets().find((t) => t.show === show.id && t.host === show.host);
    return {
      id: show.id,
      name: show.name,
      host: person(show.host),
      ...(show.project ? { project: { id: show.project, name: this.core.spaces.get(show.project)?.name } } : {}),
      ...(show.room ? { room: show.room } : {}),
      starts: show.starts,
      ends: show.ends,
      price: show.price,
      ...(show.capacity ? { capacity: show.capacity } : {}),
      ...(mine ? { sold: this.ticketRecords(show.id).length } : {}),
      hosts: show.hosts.map(person),
      split,
      safe: { address: show.price.to, threshold, ...(owners.length === show.hosts.length ? { deploy: safeDeployment(owners, threshold, showSaltNonce(show.id)) } : {}) },
      cancelled: show.cancelled,
      open: showOpen(show, new Date(this.node.clock())),
      mine,
      ...(ticket ? { ticket: { tx: ticket.tx } } : {}),
    };
  }
}
