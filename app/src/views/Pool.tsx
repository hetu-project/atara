import { useEffect, useState } from 'react'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import { useAssessment } from '../hooks/useAssessment'
import { ApiError } from '../api/client'
import { scoreBand } from '../api/types'
import { useApi } from '../hooks/useApi'
import { useToast } from '../components/Toast'
import { go } from '../hooks/useRoute'
import { useKycGate } from '../hooks/useKycGate'
import { useWalletTx } from '../hooks/useWalletTx'
import type { Offer } from '../api/types'
import { Failed, Pending } from '../components/Loading'
import ConfirmSheet from '../components/ConfirmSheet'

const FIAT_SYM: Record<string, string> = {
  CNY: '¥', HKD: 'HK$', SGD: 'S$', JPY: '¥', EUR: '€', USD: '$', AED: 'د.إ', GBP: '£',
}
const flag = (c: string) => {
  const cc = c === 'EUR' ? 'EU' : c.slice(0, 2)
  return String.fromCodePoint(...[...cc].map(ch => 0x1f1e6 + ch.charCodeAt(0) - 65))
}
const relText = (s: number) =>
  s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60 ? ` ${s % 60}s` : ''}`

/** 资质件六项。缺件也公开——让买家自己给缺口定价，而不是平台替他隐藏。 */
const DOCS: [string, string, string][] = [
  ['kyc', 'KYC', 'Identity verified by the platform'],
  ['pof', 'PoF', 'Proof of funds — will share on request'],
  ['stm', 'Stmts', 'Bank statements — will share on request'],
  ['poa', 'PoA', 'Corporate authorization / power of attorney'],
  ['sow', 'SoW', 'Source of wealth — verified for large sizes'],
  ['chain', 'Chain', 'On-chain address provenance screened'],
]

/**
 * Discover · 交易池。
 *
 * 「购买」看的是对方挂的卖单，「出售」看的是对方挂的买单——方向要反过来配。
 * 卡上那几样都不是装饰：信任分是选谁交易的第一判断，履约数据是分数的来源
 * （不能只给分不给依据），最小单决定这条单跟我有没有关系。
 */
export default function Pool({ identity, onNeedSignIn }: { identity: string; onNeedSignIn?: () => void }) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy')
  const [coin, setCoin] = useState('All')
  const [fiat, setFiat] = useState('')
  /* 法币筛选走弹窗。原来是点一下换下一个币种——币多起来要点七八下才轮到，
     而且中途根本不知道后面还有什么。 */
  const [picking, setPicking] = useState(false)

  /* 15s, like every other list that changes on its own. This one was the
     exception: whoever opened Discover saw the pool as it stood at that moment,
     and kept seeing it — listings posted since never appeared, listings taken
     since stayed clickable until the backend refused the order. The live
     stream cannot cover it: the offer event goes only to the listing's owner.
     It still helps for that owner, whose external-deposit listing goes up
     minutes after they closed the sheet. */
  const { data, error, reload } = useApi(() => ep.offers(side), [side], 15000)
  useEffect(() => {
    addEventListener(LIVE_CHANGED, reload)
    return () => removeEventListener(LIVE_CHANGED, reload)
  }, [reload])
  const { data: assets } = useApi(() => ep.assets(), [])
  const { data: fiatGroups } = useApi(() => ep.fiats(), [])
  const { data: mine } = useApi(() => ep.myOffers(identity), [identity])
  const mineIds = new Set((mine ?? []).map(o => o.id))

  const all = data ?? []
  /* 筛选项来自目录，不是从当前挂单反推——池子空的时候筛选条不该跟着消失，
     那会让人以为「这个币种没有了」，而不是「这个方向暂时没人挂单」。 */
  const coins = ['All', ...(assets ?? []).map(a => a.code)]
  const list = all
    .filter(o => coin === 'All' || o.asset === coin)
    .filter(o => !fiat || o.fiat === fiat)
    /* Your own listing first — you need to see it the moment you post it.
       The rest by score, with unrated makers last: that is an ordering
       preference, not a verdict. Ranking them as if they scored zero would
       bury a new maker under everyone who has ever traded, and a maker who
       never gets a first trade never gets a record either. */
    .sort((a, b) => (mineIds.has(b.id) ? 1 : 0) - (mineIds.has(a.id) ? 1 : 0)
      || (b.maker.trust_score ?? -1) - (a.maker.trust_score ?? -1))

  return (
    <div className="view on" id="v-market">
      <div className="vhead"><h2>Discover</h2></div>
      <div className="vbody" id="mkbody">
        {/* 这一版只有 OTC 一个纵向。一个选项的 tab 行不是导航，是噪音——
            所以这一行只留做市入口。要加纵向时再把 tab 加回来。 */}
        <div className="mkbar" style={{ justifyContent: 'flex-end' }}>
          <MakerCta />
        </div>
        <div className="mkbar">
          {/* 方向在最前，因为买家和卖家看的是两批完全不同的挂单 */}
          <div className="mkside" role="tablist" aria-label="Side">
            {(['buy', 'sell'] as const).map(s => (
              <button key={s} className={'mks' + (side === s ? ' on' : '')} role="tab"
                aria-selected={side === s} onClick={() => setSide(s)}>
                {s === 'buy' ? 'Buy' : 'Sell'}
              </button>
            ))}
          </div>
          <div className="mkfilter">
            {coins.map(c => (
              <button key={c} className={'mkf' + (coin === c ? ' on' : '')}
                onClick={() => setCoin(c)}>{c}</button>
            ))}
          </div>
          <button className="mkfiat" onClick={() => setPicking(true)}>
            {fiat ? `${flag(fiat)} ${fiat}` : 'Any currency'}
          </button>
        </div>

        {picking && (
          <FiatPicker groups={fiatGroups ?? []} on={fiat}
            /* 只列池子里真有人接的币种：列一个没人挂单的币，选完是空池，
               看的人会以为筛坏了。 */
            avail={new Set(all.map(o => o.fiat))}
            onPick={c => { setFiat(c); setPicking(false) }}
            onClose={() => setPicking(false)} />
        )}

        <div id="pool">
          {list.map(o => <OfferCard key={o.id} o={o} side={side} mine={mineIds.has(o.id)}
            identity={identity} onNeedSignIn={onNeedSignIn} />)}
          {!list.length && (data === null
            ? <div className="mkempty">
                {error ? <Failed error={error} onRetry={reload} /> : <Pending rows={3} />}
              </div>
            : <div className="mkempty">No offers match</div>)}
        </div>
      </div>
    </div>
  )
}

/**
 * 做市准入入口。按钮文案跟着申请状态走——
 * 「审核中」写成「Become a maker」会让人以为没提交成功，再点一次又提交一遍。
 */
function MakerCta() {
  /* 用门那一份，不自己再拉一遍：放行是后端隔几秒改的，只有门那份在轮询。
     自己拉的那份没人再问它，通过之后按钮会一直停在「Under review…」。 */
  const { app, ...kyc } = useKycGate()
  /* 被打回的那一段，球在用户手里。这一格原来会落进「审核中」——打回之后
     `*_done` 不再清零，不单独认它的话，等着他去改的东西会显示成
     「我们还在审」，而那正是这次要消灭的那种误导。 */
  const revise = !!app?.reject_reason && !app?.approved
  const label = app?.approved ? 'Post a listing →'
    : revise ? 'Changes requested →'
      : (app?.listing_done || (app?.kyc_done && !app.kyc_ok)) ? 'Under review…'
        : 'Become a maker →'
  const busy = label === 'Under review…'
  return (
    <button className="lnk" style={{ opacity: busy ? 0.6 : 1 }}
      onClick={() => kyc.openMaker(app?.approved ? 'offer' : undefined)}>{label}</button>
  )
}

function OfferCard({
  o, side, mine, identity, onNeedSignIn,
}: {
  o: Offer; side: 'buy' | 'sell'; mine: boolean; identity: string
  onNeedSignIn?: () => void
}) {
  const m = o.maker
  const { start } = useAssessment()
  const kyc = useKycGate()
  const sym = FIAT_SYM[o.fiat] ?? ''
  const px = Number(o.unit_price)
  const qty = Number(o.remaining_qty)
  const ceiling = Math.round(Number(o.fiat_ceiling))
  const docsOn = Object.values(m.docs ?? {}).filter(Boolean).length
  /* Whether there is settlement history to show on the trust line.
     Not a gate on the score ring any more — that one always draws, see below.
     With no trades there is nothing to put in "N trades · X% completion", so
     the line says so instead of printing zeroes. */
  const scored = m.deals > 0
  /* null means no settlement record at all — a different state from a low
     score, and rendered as one. */
  const rated = m.trust_score

  /* Unlisting sends a transaction on the chain the listing lives on — not the
     one the backend happens to be connected to — so it needs the chain's
     deployment and this account's address.

     Only on your own cards. These used to be fetched by every card on the page:
     a screen of six listings opened with six identical /catalog/chain and six
     identical /wallet, and five of each pair were for the unlist button that
     card will never show. Deciding here rather than lifting the fetch to the
     page keeps the data next to the one branch that reads it. */
  const { data: chains } = useApi(
    () => (mine ? ep.chainInfo() : Promise.resolve(null)), [mine])
  const { data: myWallet } = useApi(
    () => (mine ? ep.wallet(identity) : Promise.resolve(null)), [mine, identity])
  const { toast } = useToast()
  const tx = useWalletTx(
    (chains?.chains ?? []).find(c => c.code === o.network) ?? null, myWallet?.address)
  /* Unlisting asks first. It used to fire on the card click: one tap on a
     button that reads like every other card's Buy, and the wallet prompt was
     already up — the first thing the person saw was a signature request for
     something they had not decided to do. The sheet says what will happen and
     takes the decision; the wallet, if the coins were locked from it, asks for
     the signature after. */
  const [askUnlist, setAskUnlist] = useState(false)
  const [unlisting, setUnlisting] = useState(false)

  const unlist = async () => {
    setUnlisting(true)
    /* 下架要把币取回钱包，而合约只认当初锁币的那个地址——后端去调必然
       revert。所以先让后端说「该你签了」（UNLOCK_REQUIRED），签完再来一次，
       那一次后端只核验「链上确实解开了」。 */
    try {
      await ep.delistOffer(o.id, identity)
    } catch (e) {
      if (e instanceof ApiError && e.code === 'UNLOCK_REQUIRED') {
        /* The coins were locked by the maker's own wallet, so only that
           wallet can release them. Ask for the signature, then come back —
           the second call only verifies the chain actually opened. */
        try {
          const prep = await ep.prepareDelist(o.id, identity)
          await tx.unlockListing({ escrow: prep.escrow, offerKey: prep.offer_key })
          await ep.delistOffer(o.id, identity)
        } catch (e2) {
          toast(msgOf(e2, 'Could not unlock those coins'), { kind: 'err' })
          setUnlisting(false)
          return
        }
      } else {
        /* This used to `return` in silence. Unlisting is the only way to get
           locked coins back, so a button that fails without a word leaves
           someone believing their money is stuck with no way to ask why. */
        toast(msgOf(e, 'Could not unlist that offer'), { kind: 'err' })
        setUnlisting(false)
        return
      }
    }
    location.reload()
  }

  const take = async () => {
    /* 先问身份再切视图：否则用户先被甩进一个空页面，登录门才追上来 */
    if (onNeedSignIn) { onNeedSignIn(); return }
    /* 再过身份门。法币腿点对点走银行，付款方必须可识别——买家也要验。 */
    if (!mine && kyc.require()) return
    if (mine) { setAskUnlist(true); return }
    /* 从大厅点一笔单，落点是**这个人的会话**，不是一张独立的工单页。
    
       参照的 showOrder() 就是这么走的：ensureThread(o.peer) → restoreSession
       → 评估在对话里当着面跑 → 工单卡追加进同一条流。原来这里跳 view:'order'，
       于是评估、成交、后续的每一句话被劈成三个互不相通的地方——而「我跟这个人
       做了什么」本来就是一件事。会话是那件事唯一完整的记录。
    
       对手方的 id 只有工单回来才知道（Offer.maker 里没有 user id），所以是
       先下单、再进会话，而不是先进会话等它长出来。 */
    try {
      /* 按币的数量下单：法币金额是换算出来的，整条挂单那一档会因为四舍五入
         比可成交量多出几分，然后被后端拒掉。 */
      const ord = await ep.take(o.id, {
        amount: o.remaining_qty, amount_kind: 'coin', network: o.networks[0] ?? o.network,
      })
      /* 先下单再起跑，而且回放的是**这一单存下来的**那一份评估。
      
         反过来（先按挂单评一次再下单）会出现两组分：后端按种子算分，挂单号
         和工单号是两个种子。而下单之后两处同时在屏幕上——右栏在跑，会话里
         那张卡已经在流里了——同一单显示两组数，人只能当它是乱编的。
      
         不 await：逐票落下来是给人看的过程，进会话不该等它。 */
      void start(o.id, m.name, ord.id)
      go({ view: 'thread', peer: ord.counterparty_id ?? '' })
    } catch (e) {
      /* Stay on the card. The thread does not exist yet, so there is nowhere
         else for the error to appear — swallowing it made a failed click
         look like a dead button. */
      toast(msgOf(e, 'Could not open that order'), { kind: 'err' })
    }
  }

  return (
    <>
    {/* Outside the card's <button>: a dialog nested in a button is invalid
        markup, and every click inside it would bubble up as a card click. */}
    {askUnlist && (
      <ConfirmSheet
        title="Unlist"
        amount={qty.toLocaleString()} unit={o.asset}
        walletKind={myWallet?.wallet_kind ?? 'atara'}
        busy={unlisting}
        lead={<>
          Take <b className="num">{qty.toLocaleString()} {o.asset}</b> off the market at{' '}
          <b className="num">{sym}{px.toLocaleString()}</b>. The coins return to your
          wallet; trades already in progress on this listing are not affected.
        </>}
        note={{ why: 'Unlisting releases the escrow',
                how: 'If your wallet locked the coins, it will ask you to sign the release next.' }}
        /* A plain button: the sheet is the decision, the wallet is the
           signature, and only some listings need one. "Sign in your wallet"
           here would promise a prompt that the external-deposit route never
           shows. */
        plain="Unlist"
        onConfirm={() => void unlist()}
        onClose={() => { if (!unlisting) setAskUnlist(false) }} />
    )}
    <button className={'od' + (mine ? ' odmine' : '')} onClick={() => void take()}>
      <div className="od-h">
        <span className="od-peer">{m.name}
          <i className="od-id num">{m.peer_code}</i>
          {mine ? <i className="od-known">Your listing · {o.side === 'sell' ? 'selling' : 'buying'}</i> : null}
        </span>
        {/*
          Every card carries the ring, the way console.html renders it — the
          score is the first thing anyone judges a counterparty by, and a card
          missing that corner reads as a different kind of card rather than as
          "no score yet".

          Unrated is its own state, not a low one. A merchant with no settled
          trades has nothing to summarise: the ring draws empty, with no number
          inside. A dash in that hole reads as a missing widget; an empty ring
          still occupies the same corner as a scored card. Painting a 0 there
          would put someone we know nothing about in the warning band, which
          keeps a new maker from ever getting a first trade — and without a
          first trade there is never a record. See docs/信任分.md §4.
        */}
        <span className={('od-ai ' + scoreBand(rated)).trimEnd()}
          style={{ ['--p' as string]: rated ?? 0 }}
          title={rated === null
            ? 'Not rated yet — no settled trades to score'
            : 'AI risk score — priced from settlement history, fund provenance and dispute record'}>
          <span className="od-ring">
            <svg viewBox="0 0 44 44" aria-hidden>
              <circle className="trk" cx="22" cy="22" r="18" />
              <circle className="val" cx="22" cy="22" r="18" />
            </svg>
            {rated !== null ? <b className="num">{rated}</b> : null}
          </span>
          <em>{rated === null ? 'Not rated' : 'AI score'}</em>
        </span>
      </div>

      {/* 分数的来源，不能只给分不给依据 */}
      <div className="od-trust">
        {!scored ? <span>New merchant — history builds as trades settle</span> : (
          <>
            <span><b className="num">{m.deals}</b>&nbsp; trades</span>
            <em>·</em><span><b className="num">{m.fill_rate}%</b>&nbsp; completion</span>
            <em>·</em><span>Avg release <b className="num">{relText(m.median_release_secs)}</b></span>
          </>
        )}
      </div>

      <div className="od-px">
        <b className="num">{sym}{px.toLocaleString()}</b>
        <span>per {o.asset} · settles in {flag(o.fiat)} {o.fiat}</span>
      </div>

      <dl className="od-kv">
        <div><dt>Size</dt><dd className="num">{qty.toLocaleString()} {o.asset}</dd></div>
        <div><dt>Limits</dt>
          <dd className="num">{Number(o.min_lot).toLocaleString()} – {ceiling.toLocaleString()} {o.fiat}</dd></div>
        <div><dt>Networks</dt>
          <dd>{o.networks.map(n => <span className="od-net" key={n}>{n}</span>)}</dd></div>
        <div>
          <dt>Docs<span className="od-dn num">{docsOn}/6</span></dt>
          <dd className="od-docs">
            {DOCS.map(([k, lb, tip]) => (
              <span key={k} className={'doc' + (m.docs?.[k] ? ' on' : '')}
                title={tip + (m.docs?.[k] ? '' : ' — not provided')}>
                {m.docs?.[k] ? '✓' : '✕'} {lb}
              </span>
            ))}
          </dd>
        </div>
      </dl>

      <div className="od-f">
        {m.disputes
          ? <span className="od-disp">{m.disputes} disputes</span>
          : <span className="od-disp ok">No disputes</span>}
        <span className="od-cta">{mine ? 'Unlist' : side === 'buy' ? 'Buy' : 'Sell'}</span>
      </div>
    </button>
    </>
  )
}


/**
 * 结算币种选择器。结构逐处对齐参照的 openFiatPicker：
 * 搜索框 + Any currency + 按走廊分组的币种卡。
 */
function FiatPicker({
  groups, on, avail, onPick, onClose,
}: {
  groups: { group: string; assets: { code: string; name: string }[] }[]
  on: string
  avail: Set<string>
  onPick: (code: string) => void
  onClose: () => void
}) {
  const [q, setQ] = useState('')
  const kw = q.trim().toLowerCase()
  const shown = groups
    .map(g => ({
      group: g.group,
      assets: g.assets.filter(a => avail.has(a.code)
        && (!kw || a.code.toLowerCase().includes(kw) || a.name.toLowerCase().includes(kw))),
    }))
    .filter(g => g.assets.length)

  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">
        <header className="mhead">
          <h3>Settlement currency</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <div className="sf">
            <input type="text" autoFocus value={q} onChange={e => setQ(e.target.value)}
              placeholder="Search currency or code" autoComplete="off" />
          </div>
          <button className={'fany' + (on ? '' : ' on')} onClick={() => onPick('')}>Any currency</button>
          {shown.map(g => (
            <div className="fgrp" key={g.group}>
              <h4>{g.group}</h4>
              <div className="fgrid">
                {g.assets.map(a => (
                  <button key={a.code} className={'fchip' + (on === a.code ? ' on' : '')}
                    onClick={() => onPick(a.code)}>
                    <span className="fflag">{flag(a.code)}</span>
                    <span className="fmeta"><b>{a.code}</b><em>{a.name}</em></span>
                    {on === a.code ? <span className="fok">✓</span> : null}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!shown.length && <div className="fempty">No match</div>}
        </div>
      </div>
    </div>
  )
}

/** Error → something worth showing. Keeps the server's wording when it has one. */
function msgOf(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}
