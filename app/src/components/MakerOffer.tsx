import { useEffect, useRef, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { LIVE_CHANGED } from '../api/events'
import { useToast } from './Toast'
import ConfirmSheet from './ConfirmSheet'
import CopyButton from './CopyButton'
import Qr from './Qr'
import { IInfo } from './icons'
import { assertPasskey } from './SessionLock'
import { isWalletTxError, useWalletTx } from '../hooks/useWalletTx'
import { FX_IDX } from './kycforms'
import type { Listing } from './MakerListing'
import { ApiError } from '../api/client'
import type { DepositStatus, Offer, PreparedOffer, StrandedLock as ApiStrandedLock } from '../api/types'
import type { TxStep } from '../hooks/useWalletTx'

/**
 * 一条挂单：一笔量、一个价。
 *
 * 跟身份核验、交易条款同一种载体——一张挂在 Atara AI 对话里的卡片。好处不只
 * 是一致：挂完之后这张卡留在对话里，就是这笔挂单的记录。
 *
 * 可选项不是写死的，是交易条款圈出来的那一份再和目录取交集。参照那边
 * 也做交集（`d.nets.filter(n => NETS_OF[coin].includes(n))`），只是它那份
 * 目录是静态数组，我们这份来自后端——后端只结算 USDT / USDC，条款里勾了
 * BTC 也挂不出来，这里就不该把它摆出来让人点完再被接口打回。
 */

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const num = (v: string) => Number(String(v).replace(/[,，\s]/g, ''))

/** 要发给后端的那份挂单。确认框拿着它，确认之后原样发出去。 */
type OfferBody = {
  side: 'sell' | 'buy'; asset: string; fiat: string
  unit_price: string; qty: string; min_lot: string
  network: string; networks: string[]
}

/*
一笔已经锁进合约、却还没建成挂单的币。

卖单在真链上是三步：要号 → 钱包锁币 → 建挂单。中间那一步是一笔链上交易，
撤不回来；第三步还会失败（网络断了、响应丢了、令牌刚好过期）。失败时这两个
号只活在 send() 的局部变量里，跟着这次点击一起没了——币在合约里，界面上只有
一句「Could not post」，再点一次就是重新要号、重新锁一份，而第一份永远留在
那儿，连下架都够不着（下架要先按 id 查到挂单行）。

所以锁一成功就先把号写下来，写在 localStorage 而不是 state：这一步的失败面
包含「把页面关了」。建单成功再抹掉。

写不进去（隐私模式、关了站点数据）不该让挂单流程挂掉——那时退回原来的行为，
本次会话里 state 仍然记得，重试照样能用。
*/
type StrandedLock = Recoverable & { at: number }

const lockKey = (uid: string) => `atara.locked-not-listed.${uid}`

function readStranded(uid: string): StrandedLock | null {
  if (!uid) return null
  try {
    const raw = localStorage.getItem(lockKey(uid))
    if (!raw) return null
    const v = JSON.parse(raw) as StrandedLock
    return v && v.offer_id && v.body ? v : null
  } catch { return null }
}
function writeStranded(uid: string, v: StrandedLock) {
  if (!uid) return
  try { localStorage.setItem(lockKey(uid), JSON.stringify(v)) } catch { /* 见上 */ }
}
function clearStranded(uid: string) {
  if (!uid) return
  try { localStorage.removeItem(lockKey(uid)) } catch { /* 见上 */ }
}

/* 这笔锁仓能不能拿来挂这一单。

   比的是锁本身覆盖的东西——哪条链上的哪个币、多少量。价和起订量不在其中：
   它们不影响链上锁了什么，改了价再用同一笔锁仓挂出来是对的。 */
const sameLock = (r: Recoverable, b: OfferBody) =>
  r.body.asset === b.asset && r.body.qty === b.qty && r.body.network === b.network

/*
一笔能被挂出去的残留锁仓，两个来源合成的同一种东西。

服务端那一份（/offers/stranded）是权威的：它从 deposits 行加链上锁仓算出来，
换台设备、清过站点数据之后仍然找得到——这正是 localStorage 那一份做不到的。
本地那一份胜在快，而且带着锁币那笔交易的哈希，服务端没存过它。

所以两边都要，按号合并，本地的盖在上面（多带一个哈希，没坏处）。
*/
type Recoverable = {
  offer_id: string
  lock_tx: string
  body: OfferBody
}

const fromServer = (l: ApiStrandedLock): Recoverable => ({
  offer_id: l.offer_id,
  lock_tx: '', // 服务端没存这个；重发用不到它，它只进链上流水
  body: {
    side: 'sell', asset: l.form.asset, fiat: l.form.fiat,
    unit_price: l.form.unit_price, qty: l.form.qty, min_lot: l.form.min_lot,
    network: l.form.network, networks: l.form.networks ?? [l.form.network],
  },
})

/* 合并两边，本地那一份优先。done 是这一次会话里已经挂出去的那些——服务端列表
   要等下一次取回来才不含它们，中间这段时间不该还在屏幕上催。 */
function mergeRecoverable(
  local: Recoverable | null, server: ApiStrandedLock[] | null, done: string[],
): Recoverable[] {
  const by = new Map<string, Recoverable>()
  for (const l of server ?? []) by.set(l.offer_id, fromServer(l))
  if (local) by.set(local.offer_id, local)
  return [...by.values()].filter(r => !done.includes(r.offer_id))
}

/* Expiry as "when · how long is left".

   Both: the absolute time is what a withdrawal queue is checked against, the
   relative one is the answer wanted at a glance. Relative alone goes stale while
   the card sits open; absolute alone makes the reader do the subtraction.

   The day is part of "when". A bare "17:10" shown at 19:00 reads as today and
   is wrong by a day, so anything not today gets "Tomorrow" or a date. Minutes
   drop once an hour or more is left; the listing is not that precise, and
   "22h 9m" is two numbers where one does the job. */
function expiresText(unix?: number): string {
  if (!unix) return '—'
  const at = new Date(unix * 1000)
  const left = unix * 1000 - Date.now()
  if (left <= 0) return 'expired'
  const now = new Date()
  const next = new Date(now); next.setDate(now.getDate() + 1)
  const day = at.toDateString() === now.toDateString() ? ''
    : at.toDateString() === next.toDateString() ? 'Tomorrow '
    : at.toLocaleDateString([], { month: 'short', day: 'numeric' }) + ' '
  const clock = at.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  const h = Math.floor(left / 3_600_000)
  /* Floor, not round: rounding turns 59m 40s into "60m". */
  const m = Math.floor((left % 3_600_000) / 60_000)
  return `${day}${clock} · ${h > 0 ? `${h}h` : `${m}m`} left`
}

/** 0x34Bd…E1D7 — enough to recognise an account, not enough to mistype it. */
const shortAddr = (a?: string) => (a ?? '').replace(/^(.{6}).+(.{4})$/, '$1…$2')

/* When the contract was last read. A clock next to "Check now" answers "is the
   poll still running" more honestly than a pulsing dot: the dot animates whether
   or not anything is happening. */
function checkedText(at: number): string {
  if (!at) return ''
  return `Checked ${new Date(at).toLocaleTimeString([], {
    hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
}

/* 点完「我转好了」之后那一句，连同它的语气。

   语气按**含义**定，不是一律标红。「还没到」绝大多数时候只是钱还没转出去、或者
   交易还没落块——把它涂红，人会以为操作失败了，而什么都没失败。真正该跳出来的
   是「收到了但不够」：那一条要他再动一次手，不说清楚他会一直等一件不会发生的事。

   说的是链上此刻的事实，不是一句好听的话。少转的原因通常很具体（填了挂单量、
   忘了手续费、交易所扣了提币费），把差额说出来，他立刻知道该补多少。 */
/* alert: nothing has arrived and the person has to act — the one state in
   this list where waiting is not the right move, so it is the one in red. */
type Wait = { tone: 'idle' | 'alert' | 'warn' | 'ok'; text: string }

function waitLine(d: DepositStatus | null): Wait {
  if (!d) return { tone: 'idle', text: 'Checking the contract…' }
  if (d.status === 'swept') {
    /* 分开说。币进托管是链上那一步，挂单上架是它之后的一步，而后者失败过——
       凭前者宣布后者，人会去 Listings 里找一笔并不存在的挂单，然后以为是
       界面坏了。这时候真正出事的是后端，而这句话把它盖住了。 */
    return d.listed
      ? { tone: 'ok', text: 'The coins are in escrow and your listing is up.' }
      : { tone: 'warn', text: 'The coins are in escrow. Posting the listing is taking '
          + 'longer than usual — nothing is lost, the coins are locked under this listing.' }
  }
  if (d.status === 'expired') {
    return { tone: 'warn', text: 'The price expired before the coins arrived. '
      + 'Anything sent there is still yours to take back.' }
  }
  const got = Number(d.received)
  const need = Number(d.need)
  if (!got) return { tone: 'alert', text: 'Nothing has arrived yet. Watching the contract.' }
  if (got < need) {
    return { tone: 'warn',
      text: `Received ${d.received} of ${d.need} — send the rest and it will go up by itself.` }
  }
  return { tone: 'ok', text: 'The transfer landed. Posting the listing…' }
}

export default function MakerOffer({
  terms, identity, onPosted, onEditTerms,
}: {
  terms: Listing | undefined
  identity: string
  onPosted: (o: Offer, sym: string) => void
  /** Reopen the trading terms. Every choice on this form is bounded by them. */
  onEditTerms?: () => void
}) {
  /* Which fiat the terms settle in comes from the accounts they picked. */
  const { data: accts } = useApi(() => ep.bankAccounts(identity), [identity])
  const { data: cat } = useApi(() => ep.assets(), [])
  const { data: fiatCorridors } = useApi(() => ep.fiats(), [])
  const { data: w } = useApi(() => ep.wallet(identity), [identity])
  /* 接了链就走真交易：币由做市方自己的钱包锁进托管合约。
     没接链（mock）时没有任何一条链是 deployed，走原来那条后端记账的路。 */
  const { data: chains } = useApi(() => ep.chainInfo(), [])

  const [side, setSide] = useState('')
  const [coin, setCoin] = useState('')
  const [net, setNet] = useState('')
  const [fiat, setFiat] = useState('')
  const [px, setPx] = useState('')
  const [qty, setQty] = useState('')
  const [min, setMin] = useState('')
  /* 出错的行，外加它这一次为什么错。一行可能有两种错法（没填 / 填过头），
     只挂一句固定文案的话，空着不填会被告知「不能超过挂单总额」——
     那句话在说另一件事，人会盯着那个数字反复改。参照就是这么写的，
     照抄过来的第一天就有人被它挡住。 */
  const [bad, setBad] = useState<{ id: string; msg?: string }>({ id: '' })
  const [err, setErr] = useState('')
  const [busy, setBusy] = useState(false)
  /* 待确认的那一单。非空就是确认框开着——它装的就是要发出去的那份 body，
     确认之后原样发，中间不再重算一遍（重算意味着人确认的和发出去的可能不是
     同一个东西）。 */
  const [confirm, setConfirm] = useState<OfferBody | null>(null)

  /* 条款圈的范围 ∩ 目录发的范围。条款没填过就退回目录全集——
     这条路走不到，但空数组会把整张卡渲染成一片空白，那比多写一行糟。 */
  const codes = (cat ?? []).map(a => a.code)
  const sides = terms?.dir.length ? terms.dir : ['Sell crypto', 'Buy crypto']
  const coins = (terms?.coins ?? codes).filter(c => codes.includes(c))
  const curSide = sides.includes(side) ? side : (sides[0] ?? 'Sell crypto')
  const curCoin = coins.includes(coin) ? coin : (coins[0] ?? '')
  const catNets = cat?.find(a => a.code === curCoin)?.networks ?? []
  const nets = (terms?.nets ?? catNets).filter(n => catNets.includes(n))
  const curNet = nets.includes(net) ? net : (nets[0] ?? '')
  /* 选中的网络就是要发交易的那条链。以前这里跟链是断开的：挂单写着 ETH，
     币却锁在后端连的那条链上，前端只好去问「你连的是哪条」——四条链因此
     只能有一条。现在网络自己说清楚是哪条链。 */
  const chain = (chains?.chains ?? []).find(c => c.code === curNet) ?? null
  /* 传地址：Privy 手里往往不止一个钱包（开了托管钱包之后每人都多一个空的），
     按下标取会拿到空钱包，余额查出来是 0。 */
  const tx = useWalletTx(chain, w?.address)
  const onChain = chains?.impl === 'evm'
  /* 钱包类型决定确认那一下签在哪儿：外部钱包弹它自己的窗口，Atara 钱包走
     passkey。用户可以在确认框里改——有人两边都有，挂单时想用哪边是他的事。 */
  const { toast } = useToast()
  const { data: me } = useApi(() => ep.me(identity), [identity])
  const [via, setVia] = useState<'atara' | 'ext' | null>(null)
  /* Whether this account has a passkey to assert. Read here rather than asked
     of the sheet: the sheet only labels the button, the approval happens in
     send(). */
  const { user: privyUser } = usePrivy()
  const hasPasskey = (privyUser?.linkedAccounts ?? []).some(a => a.type === 'passkey')

  /*
    How the coins get into escrow. Two routes, as in console.html (bindFundVia).

    The Atara wallet signs `lockListing` itself, so the coins leave a wallet this
    browser can reach. The external route asks for nothing: we show an address,
    the maker sends from wherever the coins actually are — an exchange, a cold
    wallet, a multisig — and the backend watches the chain for the arrival.

    That second route exists because the first one cannot serve a desk whose
    inventory is not in a hot wallet. Requiring a signature would mean moving the
    treasury to sign for one listing.
  */
  /* 外部入金的地址和该转的数，来自 /offers/prepare。
     只取一次：每调一次就发一个新挂单号、落一行新的待入金，来回切换那两个
     chip 会留下一串没人会用的记录。 */
  const [dep, setDep] = useState<PreparedOffer | null>(null)
  const [depErr, setDepErr] = useState('')
  const [sent, setSent] = useState(false)
  /* 点完「我转好了」之后的真实进度。

     没有它，那颗按钮就是句空话：点不点、转没转，屏幕上看到的都一样。而这一步
     的不确定性恰恰最高——金额填错、链选错、交易所扣了提币费，都会让钱到不了或
     者不够，而人会一直等一件永远不会发生的事。 */
  const [got, setGot] = useState<DepositStatus | null>(null)
  /* Sheet dismissed while a deposit is still on its way.

     Closing used to wipe `dep` and `sent` together with the sheet. The coins were
     already sent, the backend was still watching the address, but nothing on
     screen could show that any more: the poll below stopped with the sheet, so
     the "listed" toast never fired either. Now closing only hides the sheet;
     the deposit state stays, the poll keeps running, and a strip on the form
     leads back here. */
  const [hidden, setHidden] = useState(false)
  /* 已经锁了币、还没挂出去的那些。

     两个来源：localStorage 那一份是这台浏览器自己记的，快，且带着锁币交易的
     哈希；服务端那一份从 deposits 行加链上锁仓算出来，换台设备、清过站点数据
     之后只剩它。合并使用，见 mergeRecoverable。 */
  const uid = me?.id ?? ''
  const [stranded, setStranded] = useState<StrandedLock | null>(null)
  useEffect(() => { setStranded(readStranded(uid)) }, [uid])
  const { data: serverStranded, reload: reloadStranded } =
    useApi(() => ep.strandedLocks(identity), [identity])
  /* 后端每半分钟去链上认一次那些无主的锁仓（见 ConfirmListingLocks），认出来
     就发一条事件。那一下浏览器没有任何理由知道，所以在这儿听着——否则这张卡
     要一直停在「还没确认」，而后端早就确认完了。

     挂单建出来时也会走这条：那时列表回空，提示自己消失。 */
  useEffect(() => {
    addEventListener(LIVE_CHANGED, reloadStranded)
    return () => removeEventListener(LIVE_CHANGED, reloadStranded)
  }, [reloadStranded])
  /* 这一次会话里已经挂出去的号。服务端列表要等下一次取回来才不含它们。 */
  const [done, setDone] = useState<string[]>([])
  const recoverable = mergeRecoverable(stranded, serverStranded, done)
  const sell = curSide === 'Sell crypto'
  const pending = sent && !!dep
  /* 放在取地址那段之前：下面那个 effect 读它，而 effect 必须排在组件里所有
     提前返回的上面（见那里的注释）。 */
  const walletKind = via ?? (me?.wallet_kind === 'ext' ? 'ext' : 'atara')
  /* The external-deposit route: a sell listing funded from a wallet we never
     touch. Most of the sheet below branches on it. */
  const ext = sell && walletKind === 'ext'

  /* 这一段必须待在组件里所有提前返回的**上面**。

     下面有一处「条款和本版支持的币对不上就整块返回 Nothing listable」——
     它一生效，后面的 hook 就不会被调用，而 React 只要发现这一次比上一次少跑了
     hook 就会当场抛 "Rendered fewer hooks than expected"，整个控制台起不来。
     这个错误是 eslint-plugin-react-hooks 抓出来的，肉眼和正则都没找到。 */
  /* 要一个入金地址。

     这一步就把挂单号发出去了，并且在后端落一行「等这笔钱」——所以只做一次。
     反复切换那两个 chip 会留下一串永远等不到钱的记录，而每一行都会被 watcher
     每隔几秒读一次链。 */
  /* 面板一露出来就去取，而不是等谁点那个 chip。

     外部钱包登录的账户 walletKind 默认就是 'ext'（见上面那行 via ?? …），
     所以弹窗一开面板就在那儿了，而点击从来没发生过——它会永远停在
     「Getting an address…」，要切到 Atara 再切回来才动。绑在「可见」上，
     两条进入路径就都覆盖了。 */
  useEffect(() => {
    if (confirm && sell && walletKind === 'ext') void askAddress()
    // askAddress 自己有幂等判断，不进依赖，否则每次渲染都会重新跑一遍
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirm, sell, walletKind])

  /* Poll only once the person has said the coins are sent.

     Nobody on chain notifies us, so we have to ask; each ask is one RPC, and most
     of the time there is no deposit in flight at all. Every 3 seconds follows the
     pace of blocks landing, not the pace of a UI trying to look responsive.

     The poll does not stop when the sheet is hidden: the deposit is still on its
     way, and this loop is the only thing that turns its arrival into a receipt. */
  const [checking, setChecking] = useState(false)
  const [checkedAt, setCheckedAt] = useState(0)
  /* 手动再查一次。轮询那条路自己会跑，这颗按钮是给「它还在动吗」这个疑问的——
     等待的时候，一个按得动的按钮比一个转圈的图标让人踏实。 */
  const recheck = async () => {
    if (!dep?.offer_id || checking) return
    setChecking(true)
    try {
      setGot(await ep.depositStatus(dep.offer_id, identity))
      setCheckedAt(Date.now())
    } catch { /* 读不到就保持上一次的样子 */ } finally { setChecking(false) }
  }

  useEffect(() => {
    if (!sent || !dep?.offer_id) return
    let alive = true
    const look = async () => {
      try {
        const d = await ep.depositStatus(dep.offer_id, identity)
        if (!alive) return
        setGot(d)
        setCheckedAt(Date.now())
        if (!d.listed) return
        /* 挂单出来了，就走和签名那条路一模一样的收尾：一句 toast，然后把
           卡片换成回执。

           挂单成了就是成了，不该因为币是转进来的就长得不一样。原来是在卡片
           里把中间那行灰字换成一句「你的挂单上去了」——而大标题还是「33 USDT」、
           底下还在喊「POSTING LOCKS FUNDS INTO ESCROW」，整张卡片看起来仍然停在
           「你即将要做」。没人会把那一行认成成功。 */
        alive = false
        const o = await ep.offer(dep.offer_id)
        toast(`Listed · ${Number(o.qty).toLocaleString()} ${o.asset} locked in escrow`,
          { kind: 'ok' })
        resetSheet()
        onPosted(o, sym)
      } catch { /* 读不到就保持上一次的样子，别把已经显示的进度抹掉 */ }
    }
    void look()
    const t = setInterval(() => void look(), 3000)
    return () => { alive = false; clearInterval(t) }
  }, [sent, dep?.offer_id, identity])

  const askAddress = async () => {
    if (dep || !confirm) return
    setDepErr('')
    try {
      const p = await ep.prepareOffer(confirm, identity)
      if (!p.deposit_addr) {
        setDepErr('This server has no deposit address configured yet.')
        return
      }
      setDep(p)
    } catch (e) {
      setDepErr(e instanceof Error ? e.message : 'Could not get a deposit address')
    }
  }

  /* 能结算哪些法币，由配置里选过的收款账户决定——你没有那个国家的收款
     账户，就不该对外说你收那种钱。这句话以前只是个愿望：渠道是从银行目录
     里挑的名字，跟账户簿毫无关系。现在渠道就是账户，它才真的成立。 */
  const tradableFiat = (fiatCorridors ?? []).flatMap(c => c.assets.map(a => a.code))
  const fromRails = [...new Set((accts ?? [])
    .filter(a => (terms?.rails ?? []).includes(a.id)).map(a => a.currency))]
  const fiats = (fromRails.length ? fromRails : tradableFiat).filter(f => tradableFiat.includes(f))
  const curFiat = fiats.includes(fiat) ? fiat : (fiats[0] ?? '')

  const sym = FIAT_SYM[curFiat] ?? ''
  const avail = num(w?.assets.find(a => a.asset === curCoin)?.on_chain ?? '0')

  /* 参考价。这一版只结算美元稳定币，所以「币的美元价」恒为 1，
     指数就是法币指数本身——真接上行情源时这里换成报价。 */
  const idx = FX_IDX[curFiat] ?? 1
  const spread = terms?.pricing === 'Float' ? (parseFloat(String(terms.spread)) || 0) : 0
  const quote = +(idx * (1 + spread / 100)).toFixed(2)

  /* 预填要真的写进 state。渲染时写 value={px || quote} 看着一样，但那样
     框子就清不掉了：删空 → px 变成 ''  → 立刻又渲染回建议价，下一个键
     反而接在 7.34 后面变成 7.345。
     换了币或法币，计价基准变了，旧价作废按新指数重填——参照也是这么做的。
     最小成交额只填一次：条款里那行「Per-trade limits (CNY)」问的就是这个数，
     让人再抄一遍没道理，而空着的后果就是提交时被一句报错挡住。 */
  const basis = `${curCoin}|${curFiat}`
  const seeded = useRef('')
  useEffect(() => {
    if (!curCoin || !curFiat || seeded.current === basis) return
    const first = !seeded.current
    seeded.current = basis
    setPx(String(quote))
    if (first && terms?.lo) setMin(String(num(terms.lo)))
  }, [basis, quote, curCoin, curFiat, terms])

  if (cat && (!coins.length || !fiats.length)) {
    return (
      <div className="deal mine xopen">
        <div className="row1"><span className="st">Listing</span><span>Nothing listable</span></div>
        <div className="open"><div className="openin"><div className="pad">
          <p className="sellm-lead">
            {!coins.length
              ? `Your terms cover ${terms?.coins.join(' · ') || 'no assets'}, and this version settles ${codes.join(' and ')}.`
              : `Your payment rails settle in ${fromRails.join(' · ') || 'no currency'}, and this version settles ${tradableFiat.join(', ')}.`}
            {' '}Add one of those to your trading terms and you can post.
          </p>
        </div></div></div>
      </div>
    )
  }

  const post = () => {
    const p = num(px), q = num(qty), m = num(min)
    setErr('')
    if (!(p > 0)) { setBad({ id: 'of-px' }); return }
    if (!(q > 0)) { setBad({ id: 'of-qty', msg: 'Enter a quantity' }); return }
    if (sell && q > avail) {
      setBad({ id: 'of-qty', msg: `More than you hold — ${avail.toLocaleString()} ${curCoin}` })
      return
    }
    if (!(m > 0)) {
      setBad({ id: 'of-min', msg: 'Enter the smallest trade you will accept' })
      return
    }
    if (m > q * p) {
      setBad({
        id: 'of-min',
        msg: `Must be below the listing total — ${sym}${(q * p).toLocaleString()}`,
      })
      return
    }
    setBad({ id: '' })
    /* A deposit is already in flight: bring that sheet back instead of opening a
       new one. A new body would reuse the old address (askAddress is idempotent
       on `dep`), so the amount on screen and the amount the watcher expects
       could disagree. One pending deposit at a time. */
    if (pending) { setHidden(false); return }
    /* 校验过了先停一下让人看清楚：这一下之后币就进合约了，不可撤销。
       参照在这里也插了一道（requireVerify），而且卖单和买单的措辞不同——
       卖单锁的是钱，买单只是一句承诺。 */
    setConfirm({
      side: (sell ? 'sell' : 'buy') as 'sell' | 'buy', asset: curCoin, fiat: curFiat,
      unit_price: String(p), qty: String(q), min_lot: String(m),
      network: curNet, networks: [curNet],
    })
  }

  /* Full reset: the sheet is over, whatever it was showing.

     Drop this address. The next sheet is another listing (amount or price may
     have changed) and the address is derived from those fields — keeping the
     old one would send coins somewhere that no longer matches. */
  const resetSheet = () => {
    setConfirm(null)
    setHidden(false)
    setDep(null)
    setSent(false)
    setGot(null)
    setDepErr('')
  }

  /* What ✕, the backdrop and the Close button do.

     While a deposit is in flight, closing only hides the sheet — the coins are
     out there and the watcher is still counting them. The one exception is an
     expired price: nothing more will happen to that deposit from here, so
     closing it really is the end. */
  const closeSheet = () => {
    if (pending && got?.status !== 'expired') { setHidden(true); return }
    resetSheet()
  }

  const send = async (body: OfferBody) => {
    setBusy(true)
    /* 卖单在真链上是三步，顺序不能换：
         ① 要号——lockListing 的 offerId 是合约主键，不先有号就没法锁
         ② 钱包签 approve + lockListing，币真的进合约
         ③ 拿着号来建挂单，后端去链上核对锁了什么
       买单不锁币（法币腿走银行），一步就够。

       ② 之后 ③ 之前失败过，就不能从 ① 重来：那会是第二个号、第二笔锁币。
       所以②一成功先把号写下来（见 StrandedLock），③失败时它留在那儿，重试
       从③接着走。extra 声明在 try 外面，好让 catch 也读得到——出错时「币进
       没进合约」决定了那句话该怎么说。 */
    let extra: { offer_id?: string; lock_tx?: string } = {}
    try {
      /* A buy listing locks nothing, so there is no transaction — but posting
         it is a public commitment to pay, and it is approved the way every
         other commitment here is: an external wallet signs a message that
         states the listing, the Atara wallet asserts its passkey. Neither is
         checked server-side (see the note in useIdentity); it is the same tier
         as the confirmation token createOffer already carries, made visible.
         An Atara wallet with no passkey yet has nothing to assert and goes
         straight through. */
      if (!sell) {
        if (walletKind === 'ext') {
          await tx.signMessage(
            `Atara listing — buy ${body.qty} ${body.asset} at ${sym}${body.unit_price} per ${body.asset}, ` +
            `min lot ${sym}${body.min_lot}, settled in ${body.fiat}, on ${body.network}.`)
        } else if (hasPasskey) {
          await assertPasskey()
        }
      }
      /* The passkey step comes first. It is the person's authorisation of
         this listing, and the coins move on chain in the very next step —
         asking for it afterwards (which createOffer used to do on its own)
         meant approving and locking first, then being asked "do you agree?",
         and a "no" left the coins locked with nothing to show for it. */
      let confirmation: string | undefined
      if (sell) confirmation = await ep.confirmOffer(body.asset, body.qty, identity)

      if (onChain && sell && chain?.deployed) {
        /* 这笔币已经锁过一次了（上一次建单没成），就拿着它的号去建单——
           重新 prepare 会拿到一个新号，钱包会再锁一份，而第一份没人认领。

           在合并后的那份里找，不是只看本地：上一次锁币发生在另一台设备上时，
           本地什么都不记得，而服务端记得。 */
        const held = recoverable.find(r => sameLock(r, body)) ?? null
        if (held) {
          extra = { offer_id: held.offer_id, lock_tx: held.lock_tx }
        } else {
          const prep = await ep.prepareOffer(body, identity)
          const hash = await tx.lockListing({
            escrow: prep.escrow, token: prep.token,
            offerKey: prep.offer_key, amountWei: prep.amount_wei,
          })
          extra = { offer_id: prep.offer_id, lock_tx: hash }
          /* 币进合约的那一刻就记下来，在建单之前。这两行之间是唯一一段
             「钱已经动了而没有任何地方记着」的窗口，把它压到最短。 */
          const mark: StrandedLock = {
            offer_id: prep.offer_id, lock_tx: hash, body, at: Date.now(),
          }
          writeStranded(uid, mark)
          setStranded(mark)
        }
      }
      let o: Offer
      try {
        o = await ep.createOffer({ ...body, ...extra }, identity, confirmation)
      } catch (e) {
        /* The token lives 120 s and the wallet may have taken longer than that
           over approve + lock. The coins are locked under extra.offer_id by
           now, so do not start over: sign once more and post the same listing.
           Any other failure is a real one and propagates. */
        const stale = e instanceof ApiError && /^(CONFIRMATION_|SIGNATURE_REQUIRED$)/.test(e.code)
        if (!stale || !sell) throw e
        const again = await ep.confirmOffer(body.asset, body.qty, identity)
        o = await ep.createOffer({ ...body, ...extra }, identity, again)
      }
      /* 挂单建出来了，这笔锁仓有人认领了，两边的痕迹都可以抹掉。 */
      clearStranded(uid)
      setStranded(null)
      if (extra.offer_id) setDone(d => [...d, extra.offer_id as string])
      reloadStranded()
      tx.setStep({ k: 'idle' })
      setConfirm(null)
      /* Say it landed, and say whether coins actually moved.

         Posting a sell listing ends with a wallet signature and then the card
         simply swaps to a receipt — the one thing the person was waiting to
         hear, that the lock went through on chain, was never said out loud.
         Off-chain postings get their own wording rather than a claim about
         escrow that did not happen. */
      toast(
        extra.lock_tx
          ? `Listed · ${Number(body.qty).toLocaleString()} ${body.asset} locked in escrow`
          : `Listed · ${Number(body.qty).toLocaleString()} ${body.asset}`,
        { kind: 'ok' })
      onPosted(o, sym)
    } catch (e) {
      // 钱包那一侧的错已经在交易进度那里显示过了，别再重复一遍。
      // 判断靠错误类型而不是 tx.step —— 闭包里那个 step 是这次点击开始时的旧值。
      if (!isWalletTxError(e)) {
        /* 币已经进合约了就要说出来。一句光秃秃的「Could not post」会让人以为
           这一下什么都没发生——而钱包里确实少了那笔钱，下一个动作多半是再点
           一次。下面那条提示会接着说该怎么办。 */
        const msg = e instanceof Error ? e.message : 'Could not post'
        setErr(extra.lock_tx ? `${msg} — your coins are locked in escrow, not lost.` : msg)
      }
    } finally { setBusy(false) }
  }

  /* 把已经锁好的那笔币重新挂出去。

     不再 prepare、不再锁币：号和交易都是现成的，缺的只是建单这一步。后端按
     offer_id 认同一笔重试，所以这颗按钮按几次都只会有一张挂单——上一次真的
     建成而只是响应丢了的话，它会把那一张原样还回来。 */
  const repost = async (rec: Recoverable) => {
    if (busy) return
    setBusy(true)
    setErr('')
    try {
      const confirmation = await ep.confirmOffer(rec.body.asset, rec.body.qty, identity)
      const o = await ep.createOffer(
        { ...rec.body, offer_id: rec.offer_id, lock_tx: rec.lock_tx }, identity, confirmation)
      if (stranded?.offer_id === rec.offer_id) {
        clearStranded(uid)
        setStranded(null)
      }
      setDone(d => [...d, rec.offer_id])
      reloadStranded()
      toast(`Listed · ${Number(o.qty).toLocaleString()} ${o.asset} locked in escrow`, { kind: 'ok' })
      onPosted(o, FIAT_SYM[rec.body.fiat] ?? '')
    } catch (e) {
      /* 这个号已经被一张挂单占着了。

         合约对同一个号是加仓（`_lockListing` 走 total += amount），所以这笔币
         就在那张挂单的锁仓里——要拿回去下架它，而不是在这儿一直重试。会走到
         这儿的是一份过期的本机记录：在另一台设备上，同一个号被改了价挂了出去，
         而这台浏览器还记着旧的那份。留着它只会是一条永远点不动的提示。 */
      if (e instanceof ApiError && e.code === 'OFFER_EXISTS') {
        if (stranded?.offer_id === rec.offer_id) {
          clearStranded(uid)
          setStranded(null)
        }
        setDone(d => [...d, rec.offer_id])
        reloadStranded()
        setErr('Those coins are already part of a listing you posted — '
          + 'delist it to take them out of escrow.')
      } else if (!isWalletTxError(e)) {
        setErr(e instanceof Error ? e.message : 'Could not post')
      }
    } finally { setBusy(false) }
  }

  const chips = (list: string[], sel: string, pick: (v: string) => void) => (
    <div className="sfchips">
      {list.map(x => (
        <button key={x} type="button" className={'sfchip' + (sel === x ? ' on' : '')}
          onClick={() => { setBad({ id: '' }); pick(x) }}>{x}</button>
      ))}
    </div>
  )
  const cls = (id: string) => 'sf' + (bad.id === id ? ' bad' : '')
  /** 这一行现在该说什么：出错了就说这一次错在哪，没出错就是它的常驻提示。 */
  const errMsg = (id: string, dflt: string) => (bad.id === id && bad.msg) || dflt

  return (
    <div className="deal mine xopen">
      <div className="row1"><span className="st">Listing</span><span>New offer</span></div>
      <div className="open"><div className="openin"><div className="pad">
        <p className="sellm-lead">
          One offer with an amount and a price — posting it locks these coins into the
          escrow contract.
        </p>

        <div className="sf"><span className="sfl">Side</span>
          {chips(sides, curSide, setSide)}</div>

        <div className="sf"><span className="sfl">Asset</span>
          {/* 换了计价基准旧价就作废，清掉让它按新指数重新预填 */}
          {chips(coins, curCoin, setCoin)}
          {sell && (
            <span className="ad num" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
              {avail.toLocaleString()} {curCoin} available — locks into escrow while listed
            </span>
          )}
        </div>

        <div className="sf"><span className="sfl">Network</span>
          {chips(nets, curNet, setNet)}
          {chain && (
            <span className="ad" style={{ fontSize: 11.5, color: 'var(--faint)' }}>
              {chain.name} · chain {chain.chain_id}
              {chain.testnet ? ' · testnet — these coins have no value' : ''}
              {onChain && sell && !chain.deployed
                ? ' · no escrow contract deployed here yet' : ''}
            </span>
          )}
        </div>

        <div className="sf"><span className="sfl">Settles in</span>
          {chips(fiats, curFiat, setFiat)}</div>

        <div className={cls('of-px')}>
          <span className="sfl">Your rate · {sym} per {curCoin}</span>
          <input type="text" inputMode="decimal" value={px}
            placeholder={String(quote)} onChange={e => { setBad({ id: '' }); setPx(e.target.value) }} />
          <span className="num" style={{ display: 'block', marginTop: 5, fontSize: 11.5, color: 'var(--faint)' }}>
            Index {idx.toLocaleString()}
            {terms?.pricing === 'Float'
              ? ` · your float ${spread >= 0 ? '+' : ''}${spread}% → ${quote.toLocaleString()}`
              : ` · your fixed rate ${(num(terms?.fixed ?? '') || 0).toLocaleString()}`}
          </span>
          <span className="err">Enter a rate</span>
        </div>

        <div className={cls('of-qty')}><span className="sfl">Size · {curCoin}</span>
          <input type="text" inputMode="decimal" value={qty} placeholder="Quantity"
            onChange={e => { setBad({ id: '' }); setQty(e.target.value) }} />
          <span className="err">{errMsg('of-qty', 'Enter a quantity')}</span></div>

        <div className={cls('of-min')}>
          <span className="sfl">Minimum per trade · {curFiat}</span>
          <input type="text" inputMode="numeric" value={min} placeholder="Min lot"
            onChange={e => { setBad({ id: '' }); setMin(e.target.value) }} />
          <span className="err">{errMsg('of-min', 'Must be below the listing total')}</span></div>

        {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
        <TxNote step={tx.step} explorer={chain?.explorer ?? ''} />

        {/* 币在合约里、挂单没建成的那些。

            它说的是一件已经发生的事实（币锁进去了），和一个还没做完的动作
            （挂出去），所以它不是错误提示，而是一条待办——错误提示会跟着下
            一次点击消失，这一条不会，它只在挂单真的建出来之后才消失。

            没有「知道了」那种按钮：关掉它并不会把币还回来，而这一条是这笔币
            在界面上唯一的入口。挂出去之后不想要，走下架，那时合约才会退币。

            **上架这一下必须由人来点。** 后端认得出这笔锁仓，也存得下当初那份
            表单，技术上完全可以自己把它挂出去——但他锁币时同意的是「按那个价
            挂那么多」，而那可能是两小时前的价。币在合约里跑不掉（合约认的
            maker 就是他，下架退回他自己的地址），所以这里没有替他做决定的
            必要。后端只负责让他知道。

            列表而不是单条：来源有两个（本机记的、服务端算的），而服务端那边
            完全可能有不止一笔——比如在另一台设备上断在半路的那些。 */}
        {recoverable.map(rec => (
          <div className="fstat warn" key={rec.offer_id}>
            <i />
            <span>
              <b className="num">{Number(rec.body.qty).toLocaleString()} {rec.body.asset}</b>
              {' '}is locked in escrow from an earlier attempt that did not finish
              posting. We checked the contract — the coins are there and they are
              yours. Nothing goes on the book until you say so: post it at the rate
              below, or post it and then delist to take the coins back out.
            </span>
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
              onClick={() => void repost(rec)}>
              {busy ? 'Posting…' : 'Post it'}
            </button>
          </div>
        ))}

        {/* The way back to a deposit whose sheet was dismissed. Same .fstat block
            as inside the sheet, same live line: the thing being waited for has
            not changed, only where it is shown. */}
        {pending && hidden && dep && (() => {
          const w = waitLine(got)
          return (
            <div className={'fstat ' + w.tone}>
              <i />
              <span>
                <b className="num">{dep.deposit_total} {curCoin}</b> on its way to escrow · {w.text}
                {checkedAt > 0 && <em className="fchk">{checkedText(checkedAt)}</em>}
              </span>
              <button type="button" className="btn btn-ghost btn-sm"
                onClick={() => setHidden(false)}>Show</button>
            </div>
          )
        })()}

        {/* Say what posting does on the route that is selected. The two-transaction
            line is true of the Atara wallet only; next to a pending external
            deposit it contradicted the strip right above it. */}
        {onChain && sell && chain?.deployed && (
          <p className="rnote">
            {walletKind === 'ext'
              ? <>Posting shows an escrow address on {chain.name}. Send from any
                  wallet; the coins lock the moment they arrive.</>
              : <>Posting sends two transactions from your own wallet on {chain.name}:
                  one to approve the escrow contract, one to lock the coins into it.</>}
          </p>
        )}
        {onChain && sell && chain && !chain.deployed && (
          <p className="rnote" style={{ color: 'var(--warn)' }}>
            No escrow contract is deployed on {chain.name} yet, so coins cannot be locked
            there. Pick another network, or deploy to this one first.
          </p>
        )}

        <div className="dfoot" style={{ marginTop: 14 }}>
          {/*
            The way back to the terms sits here, next to the action it blocks.

            Every field above is bounded by the trading terms — which assets,
            which networks, which rails. So the moment a maker discovers the
            terms are wrong is while standing on this form, reading a note
            saying the network they picked has no escrow contract. Putting the
            fix in a chat message further up means finding it by scrolling back
            through the conversation that led here.
          */}
          {onEditTerms && (
            <button className="btn btn-secondary btn-sm" type="button" disabled={busy}
              onClick={onEditTerms}>Change trading terms</button>
          )}
          {/* While a deposit is in flight this button reopens that sheet (see
              post()), so it must not promise a new listing. */}
          <button className="btn btn-primary" disabled={busy}
            onClick={() => post()}>{pending ? 'Back to deposit' : <>Review &amp; post</>}</button>
        </div>
      </div></div></div>

      {confirm && !hidden && (
        <ConfirmSheet
          title="Confirm listing"
          /* On the external route the headline is the number to send, fee
             included — that is what gets typed into a withdrawal form. The
             listing size moves down into the sentence. Showing the listing size
             big and the send amount small had people copying the wrong one. */
          /* A buy listing is money going out, so the headline is the fiat it
             commits — quantity × rate — and the coins go into the sentence.
             The sell headline stays in coins: that is what gets locked. */
          amount={ext && dep ? String(dep.deposit_total)
            : sell ? num(qty).toLocaleString()
            : `${sym}${(num(qty) * num(px)).toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
          unit={sell ? curCoin : curFiat}
          walletKind={walletKind}
          busy={busy}
          lead={ext ? <>
            Lists <b className="num">{num(qty).toLocaleString()} {curCoin}</b> at{' '}
            <b className="num">{sym}{num(px).toLocaleString()}</b>, min lot{' '}
            <b className="num">{sym}{num(min).toLocaleString()}</b>.
            {dep ? <> Includes the <b className="num">{dep.deposit_fee} {curCoin}</b> fee.</> : null}
          </> : sell ? <>
            List <b className="num">{num(qty).toLocaleString()} {curCoin}</b> for sale at{' '}
            <b className="num">{sym}{num(px).toLocaleString()}</b> · min lot{' '}
            <b className="num">{sym}{num(min).toLocaleString()}</b>.
            Funds stay locked until filled or unlisted.
          </> : <>
            Buy <b className="num">{num(qty).toLocaleString()} {curCoin}</b> at{' '}
            <b className="num">{sym}{num(px).toLocaleString()}</b> per {curCoin}, paying up to{' '}
            <b className="num">{sym}{(num(qty) * num(px)).toLocaleString(undefined, { maximumFractionDigits: 2 })}</b>
            {' '}· min lot <b className="num">{sym}{num(min).toLocaleString()}</b>.
          </>}
          extra={sell ? (
            <>
              {/* The route locks once they say the coins are sent — not before.

                  Switching to the Atara wallet after that would hide the address
                  block, turn the button back into "Confirm with passkey", and one
                  more click would sign a second listing while the external deposit
                  is still being watched. Same terms, two listings.

                  Locking earlier (on the address itself) was tried and felt broken:
                  the address is fetched the moment the panel shows, so someone who
                  only opened External wallet to look could never switch back, with
                  nothing on screen saying why. Before "I've sent it" nothing has
                  moved, so switching is free; the fetched address is kept, and
                  coming back shows the same one instead of minting another. */}
              <div className="fvia">
                <button type="button" className={'sfchip' + (walletKind !== 'ext' ? ' on' : '')}
                  disabled={sent} title={sent ? 'Locked while the deposit is being watched' : undefined}
                  onClick={() => setVia('atara')}>Atara wallet</button>
                <button type="button" className={'sfchip' + (walletKind === 'ext' ? ' on' : '')}
                  disabled={sent} title={sent ? 'Locked while the deposit is being watched' : undefined}
                  onClick={() => setVia('ext')}>External wallet</button>
              </div>
              {/* One line under the chips: what this route is, or, once sent,
                  why the chips stopped working. A greyed control with no
                  explanation reads as a bug. */}
              <div className="fviabody">
                {walletKind !== 'ext'
                  ? 'Signed from your Atara wallet — straight into the escrow contract, not to Atara.'
                  : sent
                    ? 'Route locked while this deposit is being watched.'
                    : depErr || (!dep
                      ? 'Getting an address…'
                      : 'Send from any wallet. We watch the contract and post the listing when the coins land.')}
              </div>

              {/* The external deposit, laid out like an exchange deposit page:
                  QR first and centred (scanning is the first action), the address
                  in a field with its own Copy, parameters as label-over-value cells,
                  then one neutral notice carrying the wrong-chain warning.

                  The block stays after "I've sent it". Collapsing it to a status
                  line looked broken, and that is exactly when people re-check the
                  address and the amount. Only the notice gives way to progress. */}
              {walletKind === 'ext' && dep && (
                <div className="fdep">
                  {/* The code encodes exactly the string in the field below (see Qr). */}
                  <div className="fqrc"><Qr text={dep.deposit_addr ?? ''} size={136} /></div>

                  <div className="ffield">
                    <span className="flab">Deposit address</span>
                    <div className="faddrf">
                      <span className="fadr">{dep.deposit_addr}</span>
                      {chain?.explorer && (
                        <a className="esxp" href={`${chain.explorer}/address/${dep.deposit_addr}`}
                          target="_blank" rel="noopener" title="View on explorer">↗</a>
                      )}
                      <CopyButton text={dep.deposit_addr ?? ''} label="Copy address"
                        done="Address copied" />
                    </div>
                  </div>

                  {/* The fee is added before the transfer so the listing locks the
                      round number they configured; deducting on arrival would turn
                      a 2,000 listing into 1,999.5. "included" says the headline
                      already has it.

                      Refunds: we never know who paid. An external deposit often
                      comes from an exchange's pooled address shared by thousands of
                      customers, and refunding there drops the coins into a hole.

                      Expiry: what expires is this configuration, not the address.
                      A price set at ¥7 is not the listing they would post tomorrow;
                      the address stays valid and whatever lands there stays theirs. */}
                  <div className="fdgrid">
                    <div className="fcell"><span>Network</span><b>{chain?.name ?? curNet}</b></div>
                    <div className="fcell"><span>Fee</span>
                      <b className="num">{dep.deposit_fee} {curCoin} · included</b></div>
                    <div className="fcell"><span>Refunds to your account</span>
                      <b className="num">{shortAddr(me?.address)}</b></div>
                    <div className="fcell"><span>Price holds until</span>
                      <b className="num">{expiresText(dep.deposit_expiry)}</b></div>
                  </div>

                  {sent ? (() => {
                    const w = waitLine(got)
                    return (
                      /* The only thing changing on the card. The clock under the
                         text answers "is the poll still running". */
                      <div className={'fstat ' + w.tone}>
                        <i />
                        <span>{w.text}
                          {checkedAt > 0 && <em className="fchk">{checkedText(checkedAt)}</em>}
                        </span>
                        <button type="button" className="btn btn-ghost btn-sm"
                          onClick={() => void recheck()}>
                          {checking ? 'Checking…' : 'Check now'}
                        </button>
                      </div>
                    )
                  })() : (
                    /* Read before sending. The wrong-chain line is the sentence
                       every exchange puts here; the other two must be known before
                       the transfer, not after. */
                    <div className="fnotice">
                      <IInfo />
                      <span>
                        Send only <b>{curCoin}</b> on <b>{chain?.name ?? curNet}</b> to this
                        address. Refunds go to your account, never back to the sender.
                        After the price expires, coins sent here are still yours to take back.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </>
          ) : null}
          /* 转完之后不再警告。那一句是对「你即将锁一笔钱」发的，而钱已经出去了——
             对一个做完的决定继续发警告，只会让人以为还有什么没完成。这时候
             屏幕上唯一要说的就是进度那一行。 */
          /* The external deposit carries its own notice above, and after the
             coins are sent a warning about "posting" would describe a decision
             already made. Every other route keeps the shared ⚠ line. */
          note={ext
            ? undefined
            : sell
            ? { why: 'Posting locks funds into escrow',
                how: 'They stay there until someone fills the listing, or you unlist.' }
            : { why: 'Posting a public listing',
                how: 'Nothing is locked — a buy listing is a commitment to pay, not an escrow.' }}
          /* 外部入金那一档不走 send()。

             send() 会去签一笔 lockListing——而这一档的全部意义就是不需要签名。
             这里点下去只是「我转好了」：钱到没到由 watcher 说了算，他点不点
             其实都一样，所以这一下不发任何请求，只把卡片切到等待态。

             挂单是钱到之后由后端建的，不是这里建的。 */
          onConfirm={() => {
            if (sell && walletKind === 'ext') {
              /* 转完之后唯一还剩的动作就是走开。挂单会自己上架，人留在这儿
                 也看不到更多东西——所以按钮变成关闭，而不是一颗按不动的灰键。 */
              if (sent) { closeSheet(); return }
              setSent(true)
              return
            }
            void send(confirm)
          }}
          /* 这一档任何时候都不能落回默认文案。默认是「Sign in your wallet」——
             而这条路的全部意义就是不需要签名，在它上面说这句话，等于告诉人
             他刚才做的事不算数。 */
          plain={sell && walletKind === 'ext'
            ? (sent ? 'Close' : "I've sent it")
            : undefined}
          /* Once the coins are sent there is nothing left to confirm. A primary
             blue Close reads as one more commitment; secondary says "you may go". */
          quiet={sent && sell && walletKind === 'ext'}
          /* On the listing sheet the passkey button reads "Approve". */
          okLabel="Approve"
          blocked={sell && walletKind === 'ext' && !dep}
          onClose={closeSheet} />
      )}
    </div>
  )
}

/**
 * 钱包那一侧走到哪一步了。
 *
 * 要签两次，中间还要等区块——不说清楚的话，第二次弹窗看着像失败重试，
 * 而等待期间界面一动不动，人会以为卡死了去点第二次。
 */
function TxNote({ step, explorer }: { step: TxStep; explorer: string }) {
  if (step.k === 'idle') return null
  if (step.k === 'error') {
    return <p className="dnote" style={{ color: 'var(--warn)' }}>{step.msg}</p>
  }
  const hash = 'hash' in step ? step.hash : ''
  return (
    <p className="dnote">
      {step.k === 'wallet' && <>{step.msg} …</>}
      {step.k === 'mining' && <>{step.msg} — waiting for the transaction to confirm</>}
      {step.k === 'done' && <>Confirmed on chain</>}
      {hash && explorer ? (
        <> · <a className="lnk" href={`${explorer}/tx/${hash}`} target="_blank"
          rel="noopener">view transaction</a></>
      ) : null}
    </p>
  )
}

/** 挂完那张卡：留在对话里就是这笔挂单的记录。 */
export function OfferPosted({ o, sym, onGo }: { o: Offer; sym: string; onGo: () => void }) {
  const sell = o.side === 'sell'
  return (
    <div className="deal done xopen">
      <div className="row1"><span className="st">Listing</span><span>Posted</span></div>
      <div className="open"><div className="openin"><div className="pad">
        <dl className="sfsum">
          <div><dt>Side</dt><dd>{sell ? 'Sell crypto' : 'Buy crypto'}</dd></div>
          <div><dt>Size</dt><dd className="num">{num(o.qty).toLocaleString()} {o.asset}</dd></div>
          <div><dt>Rate</dt><dd className="num">
            {sym}{num(o.unit_price).toLocaleString()} per {o.asset}</dd></div>
          <div><dt>Min lot</dt><dd className="num">{sym}{num(o.min_lot).toLocaleString()}</dd></div>
          {sell && <div><dt>Locked via</dt><dd>Escrow contract · {o.network}</dd></div>}
        </dl>
        <div className="dfoot" style={{ marginTop: 12 }}>
          <button className="btn btn-secondary btn-sm" onClick={onGo}>View in Discover →</button>
        </div>
      </div></div></div>
    </div>
  )
}
