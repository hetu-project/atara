// Types for the backend's JSON. Field names are aligned one by one against atara-pay's
// internal/api/dto.go and each handler -- not guessed. The contract itself was reverse-engineered from the
// hardcoded data in the old console.html, so this layer is written strongly typed: a mismatched field name is
// the single biggest risk in this integration, and catching it at compile time beats an undefined at runtime.

/** The unified error envelope. Integrators branch on code and must not match on message. */
export interface ApiErrorBody {
  code: string
  field?: string
  message: string
  remedy?: {
    action: string
    value?: string
    values?: string[]
    label: string
  }
}

/** Amounts are always decimal strings in major units, never a number -- float silently alters the last digits. */
export interface Amount {
  amount: string
  asset: string
  scale: number
}

export interface User {
  id: string
  address: string
  display_name: string
  email: string
  kind: 'person' | 'firm' | 'agent'
  wallet_kind: 'atara' | 'ext'
  login_method: string
  hue: number
  avatar_url: string
  role: 'user' | 'reviewer'
  created_at: string
}

export interface WalletAsset {
  asset: string
  /** The chain this balance is actually on, not "which chains this coin supports". */
  network: string
  on_chain: string
  in_escrow: string
  /** Empty for the gas coin — no quote, and it is kept out of the totals. */
  usd_value: string
  /** The chain's own coin. Pays gas; cannot be listed or sent as a token. */
  native?: boolean
}

export interface Wallet {
  address: string
  wallet_kind: 'atara' | 'ext'
  /** Always self -- the platform does not hold funds. */
  custody: string
  on_chain_usd: string
  in_escrow_usd: string
  /** True when the escrow figures could not be read off the chain. They come
      back as zero in that case, and zero is a number somebody might act on —
      so the page says it could not read rather than printing it. */
  escrow_unknown?: boolean
  total_usd: string
  assets: WalletAsset[]
  escrow_contract: { address: string; network: string }
  spending_contract: string
}

/**
 * How a score reads when there may not be one.
 *
 * null is "no settlement record", not a low score, so it must not print as
 * "score null" or quietly become 0. Every surface that shows the number goes
 * through here so the wording stays the same on all of them.
 */
export const scoreText = (s: number | null | undefined) =>
  s == null ? 'not rated yet' : `score ${s}`

/**
 * Which band a merchant score falls in: '' neutral, 'lo' concerning,
 * 'hi' priced as low risk, 'none' never scored.
 *
 * The lower line sits at 65, not at 70 where console.html had it. That
 * threshold was set against the prototype's hand-written 66–97 spread; a score
 * computed from the settlement record runs about 59–89, and its bottom stretch
 * is where thin-but-clean records live. At 70 a maker with four clean trades
 * and a maker with ten defaults in twenty trades were painted the same amber —
 * "shallow record" and "bad record" reading alike, which is the mistake the
 * unrated state was introduced to stop.
 *
 * 85 is not ours to move: PRD §9.1 6c prices at or above it as low risk.
 */
export const scoreBand = (s: number | null | undefined): '' | 'lo' | 'hi' | 'none' => {
  if (s == null) return 'none'
  if (s >= 85) return 'hi'
  if (s < 65) return 'lo'
  return ''
}

export interface Maker {
  name: string
  peer_code: string
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  deals: number
  disputes: number
  fill_rate: string
  median_release_secs: number
  /** Published even with qualification documents missing -- the gaps are public too, so buyers can price them themselves. */
  docs: Record<string, boolean>
}

export interface Offer {
  id: string
  side: 'buy' | 'sell'
  asset: string
  network: string
  networks: string[]
  fiat: string
  unit_price: string
  qty: string
  /** Coin unit. */
  remaining_qty: string
  /** Fiat unit. */
  fiat_ceiling: string
  /** Fiat unit -- not the same unit as remaining_qty, and the two must not be compared. */
  min_lot: string
  status: 'active' | 'filled' | 'delisted'
  /** Where the delisting came from: the maker themselves / an admin override / the reconciler finding it already closed on chain. Only set when delisted. */
  delist_reason?: 'maker' | 'admin' | 'chain' | ''
  maker: Maker
  created_at: string
}

/** The five phases of the frontend's OSTATE. The backend computes them from the current caller's perspective; render directly. */
export type Phase = 'pay' | 'verify' | 'wait' | 'lock' | 'rel'
/** Whose turn it is to act. */
export type Actor = 'you' | 'them' | 'auto'

export type OrderState =
  | 'match' | 's1' | 's3' | 's3v' | 's4' | 's5'
  | 'cancelled' | 'expired' | 'disputed'
  | 'fund' | 'locked' | 'awaiting_counterparty' | 'awaiting_me' | 'releasing' | 'released'

export type Terminal = '' | 'completed' | 'cancelled' | 'expired' | 'disputed'

export interface RailStop {
  key: string
  label: string
  state: 'done' | 'now' | 'next'
  /** The backend's label is waiting_on, not who. */
  waiting_on?: string
}

export interface Escrow {
  contract: string
  network: string
  explorer: string
  funding_via?: string
  tx_hash?: string
  confirmations: number
  required: number
  needs_funding: boolean
  /** Parameters a coin-selling taker needs when depositing from their own wallet; only set while awaiting funding. See the backend's app.FundingPlan. */
  order_key?: string
  token?: string
  amount_wei?: string
  beneficiary?: string
}

export interface OtcLeg {
  offer_id: string
  /** The taker's perspective: buy means the taker buys coins and pays fiat. Both parties see the same value. */
  side: 'buy' | 'sell'
  /** The direction of whoever is looking at this order. The maker's is the opposite of side -- every piece of
      "you pay / you receive" copy in the UI has to follow this, not side. */
  your_side?: 'buy' | 'sell'
  funding_via?: string
  unit_price: string
  fiat_code: string
  fiat_amount: string
  network: string
  receipt_ref?: string
  /** Link that opens the receipt: signed by the backend and time-limited. ref is only a filename and cannot be opened on its own. */
  receipt_url?: string
  /** Every page of this payment, in submission order. The two fields above point at the last page only, and are
      kept for older UIs that show just one -- whoever has to verify the payment must see all of them. */
  receipts?: ReceiptPage[]
}

/** One page of a payment proof. */
export interface ReceiptPage {
  ref: string
  url?: string
/** Whether it has been checked. A set submitted in two rounds does not end up looking wholesale unreviewed. */
  verified: boolean
}

export interface OrderEvent {
  seq: number
  from_state: string
  to_state: string
  actor: string
  reason: string
  payload?: Record<string, string>
  created_at: string
}

export interface Order {
  id: string
  ref: string
  kind: 'otc_take' | 'conditional_transfer'
  state: OrderState
  terminal?: Terminal
  /** null in terminal states, for conditional payments, and for queries by an outsider. */
  phase: Phase | null
  actor: Actor | null
  amount: Amount
  note?: string
  counterparty_name?: string
  counterparty_id?: string
  card_id?: string
  state_deadline?: string
  seconds_left: number
  /* Where the money should go. The backend only sends this section to the party who owes the payment, and only
     while it is still unpaid; anyone else gets undefined. Its absence means "payout details unavailable" --
     which may be the counterparty not having registered an account, or this backend having no encryption key configured. */
  payout?: Payout
  escrow?: Escrow
  rail: RailStop[]
  otc?: OtcLeg
  events?: OrderEvent[]
  /**
   * The risk score computed at the moment the order was placed (60-99), stored on the ticket and never recomputed.
   * Not recomputing is deliberate: the score is a judgement about the moment of ordering, and moving with later events it would stop being one.
   */
  /** Whether I initiated this order (in OTC terms, "I am the taker"). At the matching stage there is no phase or
      actor yet, and this is the only field distinguishing the two sides -- confirmation belongs to one of them only. */
  yours?: boolean
  /** Snapshot of the counterparty's trust score at the moment of ordering. Same source as the ring on Discover,
      so the same merchant necessarily shows the same number in both places. null = there was no record at the time. */
  trust_score: number | null
  /** The counterparty's scorecard and qualification documents. Sent with the ticket, so both numbers come from the same moment. */
  peer_profile?: PeerProfile
  /** This order's fee, fixed at the moment of ordering. */
  fee?: { amount: string; currency: string; bps: number }
  /** Snapshot of the pre-order risk assessment. Absent if it never ran. */
  assessment?: OrderAssessment
  /** Only in terminal states: what finally closed this order out. */
  evidence?: Evidence
  created_at: string
}

export interface PeerProfile {
  name: string
  peer_code?: string
  deals: number
  disputes: number
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  docs?: Record<string, boolean>
}

export interface OrderAssessment {
  score: number
  passed: number
  total: number
  threshold: number
  summary: string
  votes: { agent: string; verdict: 'pass' | 'flag'; note: string; score?: number }[]
  /** How many sources and how many records were read. Reported by the assessor; the frontend does not invent it. */
  sources: number
  records: number
  /** How many milliseconds this assessment really took. Under a second, no seconds figure is printed -- no inventing a nice-looking number. */
  took_ms?: number
}

export interface Evidence {
  outcome: 'completed' | 'cancelled' | 'expired' | 'disputed'
  receipt_ref?: string
  /** Same as OTC.receipt_url -- the last page, for older clients that read only one. */
  receipt_url?: string
  /** Every page. A settlement record has to hold what the release was actually based on at the time. */
  receipts?: ReceiptPage[]
  settled_at?: string
  /**
   * Present on orders that reached `disputed`, ruled on or not.
   *
   * `raised_by: 'system'` means nobody raised anything — a window closed with
   * neither side having spoken. `decided_at` is absent until a reviewer
   * actually rules, and the two are independent: an escalation sits here with
   * a `raised_at` and no decision at all.
   *
   * `raised_by` and `fault` are already resolved to the viewer's seat by the
   * backend — "you" or "them", not user ids — the same way `phase` is. Both
   * sides of one order are looking at different facts about it, and deriving
   * that in two places is how two screens come to disagree.
   *
   * `fault` empty means the reviewer was never asked (rulings made before the
   * console had the field). That is not the same as 'none': one says nobody was
   * responsible, the other says nobody answered.
   */
  arbitration?: {
    raised_at?: string
    raised_by?: 'you' | 'them' | 'system'
    claim?: string
    decided_at?: string
    decision?: 'release' | 'refund'
    fault?: 'you' | 'them' | 'none'
  }
  chain?: {
    kind: string; amount?: string; tx_hash?: string
    /** This transaction's address on a block explorer. Absent on the mock chain, in which case no link is given. */
    explorer?: string
    memo?: string; at: string
  }[]
}

export interface Task {
  id: string
  order_ref: string
  title: string
  state: 'you' | 'run' | 'done'
  at: string
}

/** The two tiers of confirmation token. A commitment token cannot pass as a signature token; the reverse is allowed. */
export type Grade = 'signature' | 'commit'

export interface Confirmation {
  confirmation: string
  expires_at: string
  grade: Grade
  header: string
}

export interface EligiblePeer {
  user_id: string
  display_name: string
  peer_code: string
  hue: number
  avatar_url: string
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  deals: number
  best_price: string
  available_qty: string
}

export interface MatchCandidate {
  offer_id: string
  name: string
  peer_id: string
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  deals: number
  unit_price: string
  fiat: string
  coin_amount: string
  fiat_amount: string
}

export interface MatchResult {
  scanned: number
  candidates: MatchCandidate[]
  violation?: ApiErrorBody
}

/** money.Asset. Note that USDRate is tagged json:"-" on the backend and is not emitted -- the frontend cannot get the rate. */
/** One chain, plus whether we have deployed on it. From GET /catalog/chain. */
export interface ChainRow {
  /** Network code. This is what listings and orders carry. */
  code: string
  name: string
  /** EIP-155 chain number. What a wallet uses to switch chains, not the name. */
  chain_id: number
  testnet: boolean
  explorer: string
  /** The coin gas is paid in on this chain. Needed when adding the chain to a wallet. */
  native: string
  /**
   * Whether an escrow contract exists. "Supports this chain" and "can host a sell listing on this chain" are not
   * the same thing -- with nothing deployed, coins cannot be locked, and the UI has to say so truthfully rather
   * than letting someone fill in a whole form only to be rejected at signing.
   */
  deployed: boolean
  escrow: string
  spending: string
  rpc_url: string
  tokens: Record<string, { address: string; decimals: number }>
  updated_at?: string
}

export interface ChainInfo {
  /** Under mock, no chain is deployed -- this version sends no transactions. */
  impl: 'mock' | 'evm'
  chains: ChainRow[]
}

/** The response from /offers/prepare: every parameter needed to go and lock coins. */
export interface PreparedOffer {
  offer_id: string
  /** The contract's bytes32. The hashing rule lives in one place on the backend; the frontend carries it through unchanged. */
  offer_key: string
  escrow: string
  token: string
  decimals: number
  /** Already converted to the token's decimals -- the frontend does not multiply by 10^n itself, where an error means being off by a factor of 10^12. */
  amount_wei: string
  chain_id: number
  network: string

  /* The external deposit tier. Empty means this server does not have the feature enabled (no factory configured).
     deposit_total is **the figure to ask the person to transfer** -- it equals the listing amount plus the fee
     and is slightly larger than amount_wei. Displaying amount_wei instead means they transfer less than they
     should, and it never gets swept. */
  deposit_addr?: string
  deposit_total?: string
  deposit_fee?: string
  /** Unix seconds. Past this point the configuration no longer lists automatically and the money can only be withdrawn. */
  deposit_expiry?: number
}

/*
A lock where coins are in the contract but no listing was ever created. See the backend's app.StrandedLock.

Posting a sell listing takes three steps -- request an id -> lock coins in the wallet -> create the listing --
and the middle one is irreversible while the third can still fail. After a failure that id lives only in the
browser's localStorage and is gone on another device; this server-side copy is what guarantees it can be found
again from any device.
*/
export interface StrandedLock {
  offer_id: string
  asset: string
  qty: string
  /** How much can still be listed from the contract right now. */
  available: string
  /** The listing as originally filled in, resent unchanged. Already carries offer_id. */
  form: {
    side: 'buy' | 'sell'
    asset: string
    fiat: string
    unit_price: string
    qty: string
    min_lot: string
    network: string
    networks?: string[]
    offer_id?: string
  }
  at: string
  /** The listing is delisted while the coins are still locked in the contract. The way out is unlocking, not reposting -- see the backend's StrandedLock.Delisted. */
  delisted?: boolean
}

/** The current state of one external deposit. See the backend's app.DepositStatus. */
export interface DepositStatus {
  status: 'waiting' | 'swept' | 'expired'
  address: string
  /** The listing amount. What has to be transferred is this plus the fee, not this on its own. */
  need: string
  /** What is really on chain right now. On partial receipt it sits between 0 and need. */
  received: string
  sweep_tx?: string
  /** Whether the listing really went live. A different thing from "swept into escrow" -- the sweep is on chain and
      creating the listing comes after it, and the latter has failed before. */
  listed: boolean
  expires_at: number
}

export interface CatalogAsset {
  code: string
  kind: 'crypto' | 'fiat'
  name: string
  symbol: string
  scale: number
  networks?: string[]
  corridor?: string
}

// -- Spending authority (allowances) --

/**
 * An allowance is spending authority signed onto the chain, not a platform allowance table -- the platform only
 * records what was issued on chain. Revocable, with a period window, a per-transaction cap, and an optional restricted payee.
 */
export interface Allowance {
  id: string
  spender: string
  kind: 'person' | 'agent'
  asset: string
  /** Which chain this authorisation is on. Empty is legacy data (when there was only one chain). */
  network: string
  per_payment: string
  window_cap: string
  used: string
  cycle: 'weekly' | 'monthly'
  expires_at: string | null
  recipients: string
  template?: string
  wallet_kind: 'atara' | 'ext'
  chain_tx?: string
  status: 'live' | 'revoked'
  note?: string
}

// -- Payees and withdrawals --

/**
 * Payout details for one order, sent to the party who owes the payment.
 *
 * Not the same thing as BankAccount: that one is "my own address book" and its number is always masked;
 * this one is "send the money here" and its number is complete -- a masked number cannot be transferred to.
 */
export interface Payout {
  holder: string
  bank: string
  account_no: string
  currency: string
  region: string
}

/** Fiat receiving account. account_no is always masked -- the full number is never persisted. */
export interface BankAccount {
  id: string
  holder: string
  bank: string
  account_no: string
  currency: string
  region: string
  created_at: string
  updated_at: string
}

export interface Payee {
  id: string
  label: string
  chain: string
  address: string
  created_at: string
}

export type WithdrawalState = 'draft' | 'submitted' | 'broadcast' | 'confirmed' | 'failed'

export interface Withdrawal {
  id: string
  payee_id: string
  asset: string
  amount: string
  purpose: string
  doc_upload_id?: string
  tx_hash?: string
  state: WithdrawalState
  created_at: string
  updated_at: string
  payee_label: string
  payee_chain: string
  payee_address: string
}

// -- Discover and maker onboarding --

export interface Market {
  key: string
  name: string
  live: boolean
  desc?: string
  /** A [dimension, description] pair. */
  map?: [string, string][]
}

/**
 * Maker application. Four status flags drive the three variants of the frontend's button:
 * approved -> "post a listing"; listing_done but unreviewed -> "under review"; otherwise -> "become a maker".
 */
/** The fields readable off an identity document that can be shown in the UI. The document number has already been masked by the backend. */
export interface KycIdentity {
  first_name?: string
  last_name?: string
  full_name?: string
  doc_type?: string
  /** Masked, leaving only the last four. The full number stays on the backend -- see the backend's kyc.maskDoc. */
  doc_number?: string
  dob?: string
  issued?: string
  expiry?: string
  sex?: string
  nationality?: string
  country?: string
}

/** One failed check. severity and decision are computed from ID Analyzer's configuration profile. */
export interface KycWarning {
  code: string
  description: string
  severity?: string
  confidence?: number
  decision?: string
}

/** Company details read off a registration document. Symmetric with KycIdentity. */
export interface KybBusiness {
  legal_name?: string
  reg_number?: string
  entity_type?: string
  /** YYYY-MM-DD */
  incorporated?: string
  /** Incorporated / Dissolved … */
  status?: string
  /** ISO2 */
  country?: string
  address?: string
  city?: string
  postcode?: string
  doc_type?: string
  official?: boolean
  directors?: string[]
}

/** The conclusion of one corporate verification. */
export interface KybResult {
  status: 'accept' | 'review' | 'reject'
  /** The document this conclusion corresponds to. If the one in hand matches it, there is no need to ask again. */
  file_ref?: string
  business: KybBusiness
  warnings?: { code: string; description: string; severity: string; decision: string }[]
  /** Nothing was actually verified this time (a local fixture was read). The UI has to say so. */
  simulated: boolean
}

/** One fiat payout rail. Served from the backend catalog and not hardcoded in the frontend -- see the note on useRails. */
export interface Rail { name: string; fiat: string }
export interface RailGroup { group: string; fiat: string; rails: Rail[] }

export interface KycStatus {
  /** none never opened - pending opened without a conclusion - accept/review/reject are conclusions */
  state: 'none' | 'pending' | 'accept' | 'review' | 'reject'
  reference?: string
  identity?: KycIdentity
  warnings?: KycWarning[]
  /** Our own annotations, kept apart from warnings -- those are the verification service's own words.
      There is currently only one: this document is already under another account, so the conclusion was downgraded to review. */
  note?: string
  kyc_ok: boolean
  concluded_at?: string
  /** Whether this machine has ID Analyzer configured. When it does not, say so truthfully rather than showing a button that does nothing. */
  configured: boolean
  /**
   * This step is simulated (the backend's ATARA_KYC=false).
   *
   * It has to be stated explicitly in the UI: whether a green "passed" tick is backed by real verification or by a
   * local switch is something the viewer has a right to know -- hidden, anyone could screenshot it and present it as "we verified this".
   */
  simulated?: boolean
}

/** What comes back from opening a verification session. The API key is not in it and never will be. */
export interface KycSession {
  reference: string
  url: string
  qr_code?: string
}

/** One pre-review objection. fields holds form field keys and is always non-empty -- opinions that point at no field have already been dropped by the backend. */
export interface ReviewIssue {
  fields: string[]
  says: string
  ask: string
  route?: 'revise' | 'escalate'
}

export interface MakerApp {
  user_id: string
  phase: 'kyc' | 'listing'
  kyc_done: boolean
  kyc_ok: boolean
  listing_done: boolean
  approved: boolean
  form: string
  /** The copy saved partway through, not yet submitted. Restored when the form reopens; the backend clears it after submission. */
  draft?: Record<string, unknown>
  /** The most recent corporate verification conclusion. Step 3 of the corporate path uses it to prefill and lock fields. */
  kyb?: KybResult
  /** Which section this draft belongs to. The two sections' fields are entirely different, and restoring the wrong one is worse than not restoring. */
  draft_phase?: 'kyc' | 'listing'
  /** Which step they had reached. Losing it means the content is remembered but eight pages still have to be clicked through from the start. */
  draft_step?: number
  reject_reason?: string
  /**
   * The most recent pre-review's per-item problems. Each points at a form field key -- the UI uses that to mark
   * the message on the offending item rather than leaving people to work back through the form from a summary.
   */
  review_issues?: ReviewIssue[]
  /** Who made the last call: 'rule' | 'ai' | 'human'. Shown as attribution. */
  review_source?: 'rule' | 'ai' | 'human'
  review_model?: string
  /** An appeal has already been filed. Non-empty means this one is awaiting a human, and the UI should not offer a second appeal button. */
  appeal_note?: string
  appealed_at?: string
  submitted_at?: string
  reviewed_at?: string
  reviewer_id?: string
  updated_at: string
  display_name?: string
}

// -- Contacts and conversations --

/** One row from /accounts/search. It is not a contact -- there is no relationship yet, only "this person exists". */
export interface Account {
  id: string
  address: string
  name: string
  kind: string
  deals: number
  /**
   * null when there is no settlement record yet.
   *
   * "Never scored" and "scored zero" are different facts: an unknown
   * counterparty is bounded by limits and escrow, a badly-rated one is
   * refused. They used to share the value 0, which left the UI guessing.
   */
  trust_score: number | null
  /** My current relationship with this person. Empty = none yet, pending = awaiting their nod, accepted = already a contact. */
  relation?: '' | 'pending' | 'accepted'
}

export interface Contact {
  id: string
  address: string
  name: string
  kind: string
  /** Supplier / Client / Colleague / Friend / My agent */
  label: string
  nickname?: string
  /** pending means still awaiting the other side's nod. A pending person cannot be named as a payee. */
  status?: 'pending' | 'accepted'
  deals: number
  fill_rate: string
  /** Net balance between us; positive = they owe me. */
  net: string
  since: string
}

export interface Message {
  id: string
  peer_id: string
  /* The backend sends 'them', not 'peer' (see store.PostBothTx: the copy row is written as them).
     This used to say 'peer', so anyone branching on it would never match while TS said nothing at all --
     the existing Thread.tsx got away with it by treating "not me" as the other side. */
  author: 'me' | 'them' | 'system'
  kind: 'chat' | 'system' | 'order' | 'assessment'
  body: string
  order_id?: string
  /** How long the AI thought before answering (milliseconds). Present only on its own answers. */
  thought_ms?: number
  payload?: Record<string, string>
  created_at: string
}

export interface Thread {
  /** The backend returns a full User, not a name string. */
  peer: User
  messages: Message[]
  orders: Order[]
  merchant?: Maker
}

// -- Conditional payments --

export interface ConditionAtom {
  atom_type: 'approve' | 'evidence' | 'data' | 'time'
  params: Record<string, string>
}

export interface ConditionParam {
  key: string
  control: 'pick' | 'text' | 'date'
  options?: string[]
  options_by?: Record<string, string[]>
  depends_on?: string
  placeholder?: string
}

export interface ConditionCatalog {
  max: number
  atoms: { type: string; label: string; params: ConditionParam[] }[]
  fallback: { default_days: number; note: string }
}

/** A conversation row in the left column. The summary returned by the backend's /threads. */
export interface ThreadSummary {
  /** How many the other side has said that I have not read. Only their messages count; system announcements do not. */
  unread?: number
  peer_id: string
  peer_name: string
  last: string
  last_at: string
  count: number
}

/** One agent's vote. verdict has only two values, pass / flag; note is the reason it gave. */
export interface AgentVote {
  agent: string
  verdict: 'pass' | 'flag'
  note: string
  /** The score this agent gave on its own. The backend computes it from the ticket id -- stable within an order, spread across different ones. */
  score?: number
}

/** Counterparty assessment. threshold is the release bar -- passed falling short of it means being held for human review. */
export interface Assessment {
  score: number
  passed: number
  total: number
  threshold: number
  votes: AgentVote[]
  summary: string
}
