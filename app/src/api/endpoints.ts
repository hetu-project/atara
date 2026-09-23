import { ApiError, BASE, PROFILE_CHANGED, api, assert, getIdentity, readAuthToken, withConfirmation } from './client'
import { shared } from './share'
import type {
  Account, Allowance, ApiErrorBody, Assessment, BankAccount, CatalogAsset, ChainInfo, PreparedOffer, ConditionCatalog, Contact, DepositStatus, EligiblePeer, KybResult, KycSession, KycStatus, MakerApp, Market, MatchResult, Message, Offer, Order, Payee, RailGroup, StrandedLock, Task, Thread, ThreadSummary, User, Wallet, Withdrawal,
} from './types'

// -- Accounts --

/**
 * Sign-up and sign-in are the same endpoint: the account is looked up by
 * `privy_id`, so the same person always lands on the same account whether or
 * not this particular login came with a wallet.
 */
export const connect = (body: {
  method: 'passkey' | 'wallet' | 'google' | 'email' | 'twitter'
  /** The identity. Everything else on this object can change; this cannot. */
  privy_id?: string
  /** Where money goes. Absent while Privy is still provisioning the wallet —
      the account is created either way and refuses payments until it lands. */
  address?: string
  email?: string
  name?: string
}) => api.post<{
  user: User
  address: string
  /** The header name echoed by the backend, reminding the frontend to carry the identity on later requests. */
  header: string
  created?: boolean
}>('/auth/connect', body)

export const me = (as?: string) => api.get<User>('/me', { as })

/** Change the display name. The address is the account's unique key, so a rename touches no existing relationship. */
export const rename = async (displayName: string, as?: string) => {
  const u = await api.post<User>('/me', { display_name: displayName }, { as })
  // Places that display this name elsewhere refetch for themselves -- see PROFILE_CHANGED.
  dispatchEvent(new CustomEvent(PROFILE_CHANGED))
  return u
}

/* Deduped, not cached: balances change, and a stale one here is a number
   somebody is about to act on. The window is only "while a request is already
   in flight", which is exactly long enough to collapse the burst of identical
   calls a screenful of order cards fires in one tick. */
export const wallet = (as?: string) =>
  shared(`wallet:${as ?? ''}`, 0, () => api.get<Wallet>('/wallet', { as }))

// -- Catalog --

export const assets = () =>
  api.get<{ assets: CatalogAsset[] }>('/catalog/assets').then(r => r.assets)

/** Settlement fiat, grouped by corridor. The catalog only sends what this version supports -- the range is declared by the backend. */
/** On-chain contract addresses. Under mock it returns an empty set, from which the frontend knows this version sends no transactions. */
/* Which chain the backend is on, and where the contracts live. It cannot
   change while the process is up, so this one is worth holding — but for a
   bounded time rather than the life of the tab: a backend restarted onto a
   different chain should not be papered over by a cache nobody can clear. */
export const chainInfo = () =>
  shared('chain', 5 * 60_000, () => api.get<ChainInfo>('/catalog/chain'))

/**
 * Fiat payout rails. **Must be asked of the backend, never hardcoded in the frontend.**
 *
 * The hardcoded version listed SGD / AED / EUR while the backend only settled CNY / HKD / USD.
 * A merchant configured with only SGD still passed review, then never matched an order -- with no error at all,
 * just no business. With the catalog owned by the backend, this whole class of problem cannot recur.
 */
export const rails = () =>
  api.get<{ groups: RailGroup[] }>('/catalog/rails').then(r => r.groups ?? [])

export const fiats = () =>
  api.get<{ corridors: { group: string; assets: CatalogAsset[] }[] }>('/catalog/fiats')
    .then(r => r.corridors)

// -- Pool --

/**
 * Browse the pool.
 *
 * **side is "what I want to do", not the listing's own direction.** The backend's Service.Offers already inverts
 * it (intent=buy -> query listings with side=sell), and the frontend must not invert it again.
 * This is not visible from the field name; it was found by testing -- it was once inverted here by mistake.
 */
export const offers = (intent: 'buy' | 'sell', asset?: string, fiat?: string) => {
  const q = new URLSearchParams({ side: intent })
  if (asset) q.set('asset', asset)
  if (fiat) q.set('fiat', fiat)
  return api.get<{ offers: Offer[] }>(`/offers?${q}`).then(r => r.offers)
}

export const offer = (id: string) => api.get<Offer>(`/offers/${id}`)

/** Counterparty risk consensus. Both the votes and the verdict come from the backend -- a second copy invented in the frontend would leave the two sides disagreeing. */
export const assessment = (offerId: string) =>
  api.get<Assessment>(`/offers/${offerId}/assessment`)

// -- Matching --

/** Match first, assess second: assessing before a counterparty exists is meaningless. */
export const match = (body: {
  intent: 'buy' | 'sell'
  amount: string
  amount_kind: 'coin' | 'fiat'
  asset: string
  fiat: string
  counterparty_id?: string
}) => api.post<MatchResult>('/orders/match', body)

export const eligibleCounterparties = (p: {
  side: 'buy' | 'sell'
  asset: string
  fiat: string
  amount: string
  amount_kind: 'coin' | 'fiat'
}) =>
  api.get<{ counterparties: EligiblePeer[] }>(
    `/orders/eligible-counterparties?${new URLSearchParams(p)}`,
  ).then(r => r.counterparties)

// -- Tickets --

export const orders = (as?: string) =>
  api.get<{ orders: Order[] }>('/orders', { as }).then(r => r.orders ?? [])

export const order = (id: string, as?: string) => api.get<Order>(`/orders/${id}`, { as })

export const tasks = (as?: string) =>
  api.get<{ tasks: Task[] }>('/tasks', { as }).then(r => r.tasks)

/**
 * Take an order. **No confirmation token needed** -- taking an order only creates a ticket; nothing has been
 * committed and no money has moved.
 * But available volume is reserved inside the transaction, and losing the race returns ABOVE_AVAILABLE_QTY.
 *
 * No `card_id`: taking an offer does not draw on an allowance. The backend
 * used to accept one here and write it onto the order unchecked, which made
 * the cancellation refund credit a stranger's card. No caller ever sent it.
 */
export const take = (offerId: string, body: {
  amount: string
  amount_kind: 'coin' | 'fiat'
  network: string
}) => api.post<Order>(`/offers/${offerId}/take`, body)

/**
 * The commitment point. The token tier forks by direction, and that forking rule is encapsulated here --
 * getting the tier wrong returns SIGNATURE_REQUIRED, and callers have no reason to remember this rule.
 *
 * - taker buys coins -> commit (the counterparty's coins were locked long ago; I put up nothing)
 * - taker sells coins + embedded wallet -> signature (the real on-chain transfer has to be signed)
 * - taker sells coins + external wallet -> commit (the platform holds no private key for that wallet and can only wait for the chain sweep)
 */
export const accept = (o: Order, via?: 'wallet' | 'external', as?: string) => {
  const sellSide = o.otc?.side === 'sell'
  const grade = sellSide && via !== 'external' ? 'signature' : 'commit'
  return withConfirmation('accept', [o.id], grade,
    token => api.post<Order>(`/orders/${o.id}/accept`, via ? { via } : {}, {
      confirmation: token, as,
    }), as)
}

/** Deposit (only while the ticket still owes funding). What is signed is the on-chain transfer itself, so the signature tier is required. */
export const fund = (o: Order, via: 'wallet' | 'external', as?: string) =>
  withConfirmation('fund', [o.id, o.amount.asset, o.amount.amount], 'signature',
    token => api.post<Order>(`/orders/${o.id}/fund`, { via }, { confirmation: token, as }), as)

/** Submit the fiat receipt -> s3v. No on-chain money moves, so no token is needed. */
/* Submit them all at once. One transfer often produces more than one page -- the payment screen, the bank's
   receipt, and a statement line when the reference is unreadable. Submitted in several goes, the order would be
   advanced several times when it should advance exactly once. */
export const receipt = (orderId: string, fileRefs: string[], as?: string) =>
  api.post<Order>(`/orders/${orderId}/receipt`, { file_refs: fileRefs }, { as })

/**
 * Verify the counterparty's receipt -> s4, or ok=false to move to disputed.
 *
 * Only the **party receiving fiat** can verify. An uploader verifying their own gets NOT_YOUR_CALL --
 * self-verification collapses back into "wait for the other side to click confirm", which is exactly what the
 * protocol exists to replace.
 */
export const verifyReceipt = (orderId: string, ok: boolean, reason = '', as?: string) =>
  ok
    /* Clearing releases escrow, so it is signature grade — the same passkey
       step as funding. Rejecting only freezes money and needs nothing extra. */
    ? withConfirmation('verify', [orderId], 'signature',
        tok => api.post<Order>(`/orders/${orderId}/verify-receipt`, { ok, reason }, { as, confirmation: tok }), as)
    : api.post<Order>(`/orders/${orderId}/verify-receipt`, { ok, reason }, { as })

/**
 * Open a dispute case.
 *
 * Both the category and the account are sent to the backend and stored in this order's event stream -- it only
 * counts once received. The account is required: the case goes to a human to read, and an empty one cannot be read.
 */
export const dispute = (
  orderId: string,
  body: { kind: string; details: string; file_ref?: string },
  as?: string,
) => api.post<Order>(`/orders/${orderId}/dispute`, body, { as })

export const cancel = (orderId: string, as?: string) =>
  api.post<Order>(`/orders/${orderId}/cancel`, {}, { as })

// -- Uploads --

/**
 * Upload a document in exchange for a file_ref.
 *
 * A multipart form whose field name must be file. It cannot go through api.post -- that layer sets
 * Content-Type: application/json, which loses multipart's boundary.
 */
export async function upload(file: File, as?: string): Promise<string> {
  const fd = new FormData()
  fd.append('file', file)
  // Use the same BASE: hardcoding '/api/v1' would miss this one endpoint on a cross-origin deployment
  /* The bearer token has to go on by hand here: request() is what normally
     attaches it, and this call deliberately does not go through it. */
  const headers: Record<string, string> = { 'X-Atara-User': as ?? getIdentity() }
  const token = await readAuthToken()
  if (token) headers.Authorization = 'Bearer ' + token
  const res = await fetch(BASE + '/uploads', {
    method: 'POST',
    // Do not set Content-Type by hand -- the boundary is generated by the browser
    headers,
    body: fd,
  })
  const body = await res.json().catch(() => null) as
    | { file_ref: string; filename: string; size_bytes: number; url: string }
    | { error: { code: string; message: string } }
    | null
  if (!res.ok || !body || 'error' in body) {
    throw new ApiError(res.status, body && 'error' in body ? body.error : {
      code: 'UPLOAD_FAILED', message: `Upload failed (${res.status})`,
    })
  }
  return body.file_ref
}

// -- Spending authority (allowances) --

export const allowances = (as?: string) =>
  api.get<{ allowances: Allowance[] }>('/allowances', { as }).then(r => r.allowances ?? [])

export interface AllowanceReq {
  spender: string
  kind: 'person' | 'agent'
  per_payment: string
  window_cap: string
  cycle: 'weekly' | 'monthly'
  /** '30 days' | '90 days' | '' = no expiry */
  expires: string
  recipients: string
  /** Which token on which chain this authorisation covers. Omitted means USDT on whichever chain the backend is connected to. */
  asset?: string
  network?: string
}

/**
 * Issue or modify an allowance. **The signature tier is required** -- granting spending authority is itself an
 * authorisation, not a statement of intent.
 */
export const saveAllowance = async (req: AllowanceReq, id?: string, as?: string) => {
  const a = await withConfirmation('allowance',
    [req.spender, req.per_payment, req.window_cap], 'signature',
    token => api.post<Allowance>(id ? `/allowances/${id}` : '/allowances', req, {
      confirmation: token, as,
    }), as)
  // The "N allowances" line at the bottom left shows this number too -- see PROFILE_CHANGED.
  dispatchEvent(new CustomEvent(PROFILE_CHANGED))
  return a
}

export const revokeAllowance = async (id: string, as?: string) => {
  const a = await api.del<Allowance>(`/allowances/${id}`, { as })
  dispatchEvent(new CustomEvent(PROFILE_CHANGED))
  return a
}

// -- Payees and withdrawals --

// -- Fiat receiving accounts --

export const bankAccounts = (as?: string) =>
  api.get<{ accounts: BankAccount[] }>('/bank-accounts', { as }).then(r => r.accounts ?? [])

/** What is submitted is the **full** account number: the backend masks it after validation and persists the mask, never the full number. */
export const saveBankAccount = (
  body: {
    holder: string; bank: string; account_no: string; currency: string; region: string
    /** ISO alpha-2 of where the bank is; picks the account-number format rules. */
    country?: string
  },
  id?: string, as?: string,
) => api.post<BankAccount>(id ? `/bank-accounts/${id}` : '/bank-accounts', body, { as })

export const deleteBankAccount = (id: string, as?: string) =>
  api.del<{ status: string }>(`/bank-accounts/${id}`, { as })

export const payees = (as?: string) =>
  api.get<{ payees: Payee[] }>('/payees', { as }).then(r => r.payees ?? [])

export const addPayee = (body: { label: string; chain: string; address: string }, as?: string) =>
  api.post<Payee>('/payees', body, { as })

export const deletePayee = (id: string, as?: string) =>
  api.del<{ status: string }>(`/payees/${id}`, { as })

export const withdrawals = (as?: string) =>
  api.get<{ withdrawals: Withdrawal[] }>('/withdrawals', { as }).then(r => r.withdrawals ?? [])

export interface WithdrawReq {
  /** A registered payee. Left empty when paying a stranger's address directly, in which case to_address / to_chain are used instead. */
  payee_id?: string
  to_address?: string
  to_chain?: string
  asset: string
  amount: string
  purpose?: string
  doc_upload_id?: string
}

/**
 * Transfer. The on-chain transaction is signed by your own wallet and the protocol only records the intent --
 * but "moving money always needs confirmation" still applies, so the signature tier is required. Digital assets only; fiat does not enter the books.
 */
export const createWithdrawal = (req: WithdrawReq, as?: string) =>
  /* The digest binds the destination address, not a payee id -- paying a stranger's address directly has no id at all. */
  withConfirmation('withdraw', [req.to_address ?? '', req.asset, req.amount], 'signature',
    token => api.post<Withdrawal>('/withdrawals', req, { confirmation: token, as }), as)

/** Write back the transfer you signed yourself. Without this step a withdrawal stays on submitted forever. */
export const broadcastWithdrawal = (id: string, txHash: string, as?: string) =>
  api.post<Withdrawal>(`/withdrawals/${id}/broadcast`, { tx_hash: txHash }, { as })

/** Rejected in the wallet: close out the record of a transaction that was never signed, rather than leaving it on submitted forever. */
export const abandonWithdrawal = (id: string, as?: string) =>
  api.post<Withdrawal>(`/withdrawals/${id}/abandon`, {}, { as })

// -- Discover and maker onboarding --

export const markets = () =>
  api.get<{ markets: Market[] }>('/discover/markets').then(r => r.markets)

/**
 * Appeal: tell us the pre-review got it wrong.
 *
 * The model is not rerun -- asking the same question of the same documents mostly gives the same answer, which
 * only makes people feel fobbed off. An appeal is new information, and reading it and deciding whether to accept
 * it is exactly the kind of judgement that was never handed to a model in the first place.
 */
export const appealMakerApp = (note: string, as?: string) =>
  api.post<MakerApp>('/maker/application/appeal', { note }, { as })


/* Autosave partway through. A different thing from submitting: this only writes the draft column, touches
   nothing already submitted, and triggers no review. Without ATARA_PII_KEY configured the backend returns
   DRAFT_UNAVAILABLE -- half-filled identity documents are not persisted in the clear. */
/* Verify a corporate registration document. Its own endpoint: it is billed per call (10 credits) and takes seven
   or eight seconds, whereas submitting is instantaneous. Bundled together, clicking Next would inexplicably hang,
   and resubmitting after changing one unrelated field would be charged again. */
export const verifyBusiness = (fileRef: string, as?: string) =>
  api.post<KybResult>('/maker/kyb', { file_ref: fileRef }, { as })

export const saveMakerDraft = (
  body: { phase: 'kyc' | 'listing'; step: number; form: Record<string, unknown> }, as?: string,
) => api.post<{ status: string }>('/maker/draft', body, { as })
export const makerApp = (as?: string) => api.get<MakerApp>('/maker/application', { as })

// -- Identity verification (ID Analyzer / DocuPass) --
//
// The browser side only ever touches reference. The API key stays on the backend -- ID Analyzer's own
// documentation states this as a hard rule: an application must never call POST /docupass or
// GET /docupass/{reference} directly.
// The onFinish fired when the hosted flow completes is only a UI signal that "the user clicked through", not a
// conclusion; conclusions are always fetched from kycStatus, which the backend settles from a webhook or an active pull.

/** Open a verification session. Each link is single-use -- v3 has dropped reusable links. */
export const startKyc = (as?: string) => api.post<KycSession>('/kyc/session', {}, { as })

/**
 * Query the current status.
 *
 * By default the backend also pulls from upstream while it is at it: local development and the built-in fixtures
 * never receive a webhook at all, so waiting only on the callback leaves the status on pending forever. Places
 * that do not care about freshness, such as list pages, pass refresh=false to save an upstream round trip.
 */
export const kycStatus = (as?: string, refresh = true) =>
  api.get<KycStatus>('/kyc/status' + (refresh ? '' : '?refresh=0'), { as })

export const submitMakerApp = (phase: 'kyc' | 'listing', form: unknown, as?: string) =>
  api.post<MakerApp>('/maker/application', { phase, form }, { as })

/** The review queue. Requires the reviewer role, otherwise 403 ROLE_REQUIRED. */
export const pendingMakerApps = (as?: string) =>
  api.get<{ applications: MakerApp[] }>('/admin/maker/applications', { as })
    .then(r => r.applications ?? [])

/** Human review. A review is not agent consensus, so it sits behind the role gate and the system never releases automatically. */
export const reviewMakerApp = (
  userId: string,
  body: { stage: 'kyc' | 'listing'; decision: 'approve' | 'reject'; reason?: string },
  as?: string,
) => api.post<MakerApp>(`/admin/maker/applications/${userId}/review`, body, { as })

/** Listings. A sell listing really does lock coins on chain, so it needs the signature tier; a buy listing is only a commitment and the commit tier suffices. */
export const createOffer = (req: {
  side: 'buy' | 'sell'
  asset: string
  fiat: string
  unit_price: string
  qty: string
  min_lot: string
  network: string
  networks?: string[]
  /* On a real chain, a sell listing's coins are locked by the maker's own wallet and the backend only verifies:
     the id and that transaction are supplied by the caller. The backend deduplicates retries by offer_id -- the
     same id sent twice yields only one listing, so resending with the same id after a failed create is safe, and
     is the only way that does not lock a second set of coins. */
  offer_id?: string
  lock_tx?: string
}, as?: string, confirmation?: string) =>
  /* A caller that already holds a token passes it in. The sell flow does:
     it has to sign *before* the wallet locks coins on chain, so by the time
     it gets here the confirmation is minutes old and must not be re-issued. */
  confirmation
    ? api.post<Offer>('/offers', req, { confirmation, as })
    : withConfirmation('offer', [req.asset, req.qty],
        req.side === 'sell' ? 'signature' : 'commit',
        token => api.post<Offer>('/offers', req, { confirmation: token, as }), as)

/** The confirmation a sell listing needs, obtainable ahead of the lock. Same
    scope and parts as createOffer, or the backend will not accept it. */
export const confirmOffer = (asset: string, qty: string, as?: string) =>
  assert('offer', [asset, qty], 'signature', as)

/** First step of posting a sell listing: request an id and get the parameters needed to lock the coins. */
/** Whether one external deposit has arrived. Only the deposit's owner can query it. */
export const depositStatus = (offerID: string, as?: string) =>
  api.get<DepositStatus>(`/offers/${offerID}/deposit`, { as })

export const prepareOffer = (req: {
  side: 'buy' | 'sell'; asset: string; fiat: string; qty: string
  unit_price: string; min_lot: string; network: string
}, as?: string) => api.post<PreparedOffer>('/offers/prepare', req, { as })

/** The unlock parameters needed before delisting. */
export const prepareDelist = (id: string, as?: string) =>
  api.post<PreparedOffer>(`/offers/${id}/prepare-delist`, {}, { as })

/* The ones where coins were locked but the listing never went up.

   The frontend also keeps its own copy in localStorage (see MakerOffer's StrandedLock), which is faster and
   carries the on-chain transaction hash; this one is authoritative, and on another device, or after site data has
   been cleared, it is all that remains. */
export const strandedLocks = (as?: string) =>
  api.get<{ locks: StrandedLock[] }>('/offers/stranded', { as }).then(r => r.locks ?? [])

export const myOffers = (as?: string) =>
  api.get<{ offers: Offer[] }>('/offers/mine', { as }).then(r => r.offers ?? [])

export const delistOffer = (id: string, as?: string) =>
  api.del<{ status: string }>(`/offers/${id}`, { as })

/** Find someone to add as a contact. Fuzzy on names, exact on addresses -- the rule lives in one place on the backend and the frontend does not reimplement it. */
export const searchAccounts = (q: string, as?: string) =>
  api.get<{ accounts: Account[] }>(
    `/accounts/search?q=${encodeURIComponent(q)}`, { as }).then(r => r.accounts ?? [])

/**
 * Contact requests sent to me that I have not yet accepted.
 *
 * What comes back is not a Contact: a request is not yet a relationship, with no settlement history, no net
 * balance and no "how long we have known each other". Declared in Contact's shape, those fields would be
 * undefined at runtime while the type insists they are always there.
 */
export interface ContactRequest {
  id: string
  address: string
  name: string
  kind: string
  label: string
  nickname?: string
  status: string
}
export const contactRequests = (as?: string) =>
  api.get<{ requests: ContactRequest[] }>('/contact-requests', { as })
    .then(r => r.requests ?? [])

export const acceptContact = (id: string, as?: string) =>
  api.post<{ status: string }>(`/contact-requests/${id}/accept`, {}, { as })

// -- Contacts and conversations --

export const contacts = (as?: string) =>
  api.get<{ contacts: Contact[]; relationships: string[] }>('/contacts', { as })

/** One field takes either a name or an address -- there is no such thing as an ATR ID here. The field is named query, not q. */
export const addContact = (
  body: { query: string; label?: string; nickname?: string },
  as?: string,
) => api.post<Contact>('/contacts', body, { as })

/**
 * The sidebar feed: one poll, two things on it.
 *
 * `pending_contacts` is how many people are waiting for me to accept them.
 * It rides along with the thread list rather than getting an endpoint of its
 * own because the sidebar already polls this one every three seconds, and a
 * second timer for a single integer is not worth the traffic.
 */
export const threads = (as?: string) =>
  api.get<{ threads: ThreadSummary[]; pending_contacts?: number }>('/threads', { as })
    .then(r => ({ list: r.threads ?? [], pending: r.pending_contacts ?? 0 }))

export const thread = (peer: string, as?: string) =>
  api.get<Thread>(`/threads/${encodeURIComponent(peer)}`, { as })

export const postChat = (peer: string, body: string, as?: string) =>
  api.post<Message>(`/threads/${encodeURIComponent(peer)}/messages`, { body }, { as })

// -- Conditional payments --

export const conditionCatalog = () => api.get<ConditionCatalog>('/catalog/conditions')

/** Parse natural language into condition atoms. Unused by the V1 frontend; the endpoint is still there. */
export const parseIntent = (text: string, as?: string) =>
  api.post<unknown>('/orders/parse', { text }, { as })

/* There used to be a fileURL(ref) here, with the frontend assembling /uploads/<ref> itself. It was removed: that
   route now requires a signed link, and only the backend can sign one -- it is issued after the "are you a party
   to this order" check. So ref is only a filename, and whether it can be opened is decided by receipt_url. */

// -- Speech dictation --

/**
 * Exchange for an authenticated iFlytek WSS URL.
 *
 * The signature is short-lived (about five minutes on iFlytek's side), so **do not cache it** -- fetch a fresh one
 * every time recording starts.
 * The secret lives only on the backend; what comes back here is just a signed address.
 */
export const iflytekToken = (as?: string) =>
  api.get<{ url: string; app_id: string }>('/voice/iflytek-token', { as })

// -- Atara AI desk --

/* Streaming has its own module: it does not go through api.post (which reads the whole JSON body before
   returning) but parses SSE itself. It is re-exported here so callers still know only one entry point, endpoints. */
export { deskSend, deskInfo, DeskError, DESK_ID } from './desk'
export type { DeskInfo, DeskHandlers } from './desk'

/** The backend's per-file limit (`maxUpload = 16 << 20`). */
export const MAX_UPLOAD = 16 * 1024 * 1024

export interface Uploaded {
  file_ref: string
  filename: string
  size_bytes: number
  url: string
}

/**
 * Upload with progress.
 *
 * XHR rather than fetch: fetch cannot report upload progress (browser support for `duplex: 'half'` request streams
 * is still inconsistent). Uploading a photo of a few MB takes several seconds, and without progress the UI is dead
 * for those seconds.
 *
 * Returns a cancellable handle -- changing your mind halfway through is common, and an upload that cannot be
 * cancelled holds a connection open and writes a ref back into the form that is no longer wanted.
 */
export function uploadProgress(
  file: File,
  onProgress: (pct: number) => void,
  as?: string,
): { done: Promise<Uploaded>; abort: () => void } {
  const xhr = new XMLHttpRequest()
  let abandoned = false
  let bail: (() => void) | null = null
  const done = new Promise<Uploaded>((resolve, reject) => {
    bail = () => reject(new ApiError(0, { code: 'UPLOAD_ABORTED', message: 'Upload cancelled' }))
    xhr.upload.onprogress = e => {
      /* Do not compute it when lengthComputable is false: e.total is 0 then, the result is Infinity, and the
         progress bar shoots to the end and sticks -- worse than having no progress at all. */
      if (e.lengthComputable && e.total > 0) onProgress(Math.round((e.loaded / e.total) * 100))
    }
    xhr.onload = () => {
      let body: unknown = null
      try { body = JSON.parse(xhr.responseText) } catch { /* not JSON */ }
      if (xhr.status >= 200 && xhr.status < 300 && body && 'file_ref' in (body as object)) {
        onProgress(100)
        resolve(body as Uploaded)
        return
      }
      const err = body && typeof body === 'object' && 'error' in body
        ? (body as { error: ApiErrorBody }).error
        : { code: 'UPLOAD_FAILED', message: `Upload failed (${xhr.status})` }
      reject(new ApiError(xhr.status, err))
    }
    /* A dropped network and a cancellation must be told apart: the former should prompt a retry, the latter was
       the user's own doing, and saying "upload failed" only makes them think something went wrong. */
    xhr.onerror = () => reject(new ApiError(0, {
      code: 'UPLOAD_NETWORK', message: 'Lost the connection while uploading',
    }))
    xhr.onabort = () => reject(new ApiError(0, { code: 'UPLOAD_ABORTED', message: 'Upload cancelled' }))
  })

  const fd = new FormData()
  fd.append('file', file)

  /* Reading the token is async, so the request leaves on a later tick while the
     handle we return exists right now. That gap is real: a user who changes
     their mind can abort before anything is in flight, and xhr.abort() on a
     request that was never opened does nothing at all — so abort rejects the
     promise itself and tells the sender not to bother. */
  void (async () => {
    const token = await readAuthToken()
    if (abandoned) return
    xhr.open('POST', BASE + '/uploads')
    xhr.setRequestHeader('X-Atara-User', as ?? getIdentity())
    if (token) xhr.setRequestHeader('Authorization', 'Bearer ' + token)
    // Do not set Content-Type -- the boundary is generated by the browser
    xhr.send(fd)
  })()

  return {
    done,
    abort: () => {
      if (abandoned) return
      abandoned = true
      xhr.abort() // Fires onabort once sent; a no-op before that, hence bail.
      bail?.()    // Settling twice is harmless — the first one wins.
    },
  }
}
