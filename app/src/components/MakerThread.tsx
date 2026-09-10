import { useEffect, useRef, useState } from 'react'
import MakerFlow from './MakerFlow'
import MakerOffer, { OfferPosted } from './MakerOffer'
import { KYC_CORP, KYC_IND } from './kycforms'
import { listingRows, type Listing } from './MakerListing'
import { go } from '../hooks/useRoute'
import type { MakerApp, Offer } from '../api/types'

/**
 * 准入是一轮对话，不是一张会变脸的状态卡。
 *
 * 参照把这件事说得很直白：「这是个对话产品，提交不是『表单变成状态卡』，
 * 而是一轮对话——你发出申请（可展开看提交了什么），平台回执，审核过了再回
 * 一条带下一步的消息。」所以这里往下走的每一步都往 #log 里追加一条消息，
 * 前面说过的话留着：
 *
 *   [卡片 九步表单] → [我：Submitted identity verification]
 *   → [平台：Received — …（可展开 25 项提交内容）]
 *   → [平台：✓ Identity verified. Next: … 「Set up trading terms →」]
 *   → [卡片 两步条款] → [我：Submitted trading terms] → …
 *
 * 消息由后端状态推出来，不靠这个组件自己记：刷新一次页面对话还在，
 * 而参照那边刷新就全没了。放行也在后端（提交后 5 秒），所以「审核中」
 * 变成「已通过」是那边推的，这里只是照着画。
 */

// ── 消息 ────────────────────────────────────────────────────────────

const Me = ({ children }: { children: React.ReactNode }) => (
  <div className="msg me"><span className="bub">{children}</span></div>
)

/* 平台的回执也是「对方」发的：挂 Atara 的方块标识，跟人的圆头像分得开。 */
const Them = ({ children, typing }: { children: React.ReactNode; typing?: boolean }) => (
  <div className={'msg them' + (typing ? ' typing' : '')}>
    <span className="mrow">
      <span className="mav deskav" aria-hidden><i /></span>
      <span className="bub">{children}</span>
    </span>
  </div>
)

// ── 回执里那份「查看提交内容」 ───────────────────────────────────────

type Group = [string, [string, string][]]

const show = (v: unknown) => {
  if (Array.isArray(v)) return v.join(' · ')
  if (typeof v === 'boolean') return v ? 'Yes' : '—'
  const s = v == null ? '' : String(v)
  return s || '—'
}

/** 身份材料按步骤分组展开全部字段——记录要全，不是三行摘要。 */
function kycGroups(form: Record<string, unknown>): Group[] {
  const steps = form.kind === 'Corporate' ? KYC_CORP : KYC_IND
  return steps
    .filter(st => (st.fields ?? []).length)
    .map(st => [st.t, (st.fields ?? []).map(f => [f.l, show(form[f.k])] as [string, string])])
}

function Receipt({ groups }: { groups: Group[] }) {
  const n = groups.reduce((a, [, rows]) => a + rows.length, 0)
  return (
    <details className="rcpt">
      <summary>View submission · {n} fields</summary>
      {groups.map(([t, rows]) => (
        <div className="rgrp" key={t}>
          <em>{t}</em>
          <dl className="sfsum">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
      ))}
    </details>
  )
}

/** 后端把两段提交分开存成 {"kyc":…,"listing":…}。解不开就当没有。 */
function forms(raw: string | undefined): { kyc?: Record<string, unknown>; listing?: Listing } {
  try { return raw ? JSON.parse(raw) : {} } catch { return {} }
}

// ── 主体 ────────────────────────────────────────────────────────────

export default function MakerThread({
  app, identity, from, wantOffer, onDone,
}: {
  app: MakerApp | null
  identity: string
  /** 从哪儿来的：先要下单（trade）还是直接来入驻（maker）。决定通过后说什么。 */
  from: 'trade' | 'maker'
  /** Discover 上那颗「Post a listing →」按的次数。变了就把挂单表单铺出来。 */
  wantOffer: number
  onDone: () => void
}) {
  /* 用户点了「Set up trading terms →」。审核通过那条消息带的是下一段的入口，
     不是自动就把表单铺出来——参照也是要点一下的。 */
  const [toListing, setToListing] = useState(false)
  /* 刚提交完的那一秒。参照先发一条「typing…」，1.2 秒后才换成回执——
     回执是平台开的，瞬间蹦出来不像一个人在那头处理。 */
  const [typing, setTyping] = useState<'kyc' | 'listing' | null>(null)
  /* 挂单表单开着没有。参照那颗「Post your first listing →」点开的就是它。 */
  const [toOffer, setToOffer] = useState(false)
  /* 挂出去的单。留在对话里就是这笔挂单的记录——参照的 offerPosted 也是
     把那张卡换成回执，而不是清掉。 */
  const [posted, setPosted] = useState<{ o: Offer; sym: string }[]>([])
  const bottom = useRef<HTMLDivElement>(null)

  /* 从 Discover 点过来的：那颗按钮按一次就把表单铺一次。 */
  useEffect(() => { if (wantOffer) setToOffer(true) }, [wantOffer])

  const f = forms(app?.form)
  const kycDone = !!app?.kyc_done
  const kycOk = !!app?.kyc_ok
  const listDone = !!app?.listing_done
  const approved = !!app?.approved

  /* 新消息进来就滚到底——不滚的话通过那条消息连同它的按钮都在屏幕外面。 */
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [kycDone, kycOk, listDone, approved, typing, toListing, toOffer, posted.length])

  const submitted = (phase: 'kyc' | 'listing') => {
    setTyping(phase)
    setTimeout(() => setTyping(null), 1200)
    onDone()
  }

  /* 表单卡什么时候在：还没交身份材料；身份过了、点了下一段还没交；
     两段都过了、点了挂单。 */
  const card: 'kyc' | 'listing' | 'offer' | null =
    !kycDone ? 'kyc'
      : kycOk && !listDone && toListing ? 'listing'
        : approved && toOffer ? 'offer'
          : null

  return (
    <>
      {kycDone && (
        <>
          <Me>Submitted identity verification</Me>
          {typing === 'kyc'
            ? <Them typing>typing…</Them>
            : (
              <Them>
                Received — your identity application is under review. Usually cleared within
                one business day{' '}
                <em style={{ fontStyle: 'normal', color: 'var(--faint)' }}>(demo: seconds)</em>.
                {app?.reject_reason ? <><br /><b>Returned:</b> {app.reject_reason}</> : null}
                {f.kyc ? <Receipt groups={kycGroups(f.kyc)} /> : null}
              </Them>
            )}
        </>
      )}

      {kycOk && (
        /* 通过那两条话逐字取自参照：为下单来验的只说「可以交易了」，
           直接来入驻的才带出下一段。 */
        <Them>
          {from === 'trade'
            ? '✓ Identity verified — you can trade now.'
            : <>
                ✓ Identity verified. Next: configure what you sell — assets, limits, pricing
                and payment rails.
                {!listDone && !toListing && (
                  <span className="rgo">
                    <button className="btn btn-primary btn-sm" onClick={() => setToListing(true)}>
                      Set up trading terms →
                    </button>
                  </span>
                )}
              </>}
        </Them>
      )}

      {listDone && (
        <>
          <Me>Submitted trading terms</Me>
          {typing === 'listing'
            ? <Them typing>typing…</Them>
            : (
              <Them>
                Received — your trading terms are under review. Usually cleared within one
                business day{' '}
                <em style={{ fontStyle: 'normal', color: 'var(--faint)' }}>(demo: seconds)</em>.
                {f.listing ? <Receipt groups={[['Trading terms', listingRows(f.listing)]]} /> : null}
              </Them>
            )}
        </>
      )}

      {approved && (
        <Them>
          ✓ Terms approved — you can post listings now. A listing is one offer with an amount
          and a price; posting it locks those coins into the escrow contract.
          {!toOffer && !posted.length && (
            <span className="rgo">
              <button className="btn btn-primary btn-sm" onClick={() => setToOffer(true)}>
                Post your first listing →
              </button>
            </span>
          )}
        </Them>
      )}

      {posted.map(p => (
        <OfferPosted key={p.o.id} o={p.o} sym={p.sym} onGo={() => go({ view: 'discover' })} />
      ))}

      {card === 'offer' ? (
        <MakerOffer terms={f.listing} identity={identity}
          onPosted={(o, sym) => { setToOffer(false); setPosted(ps => [...ps, { o, sym }]) }} />
      ) : card ? (
        <MakerFlow phase={card} identity={identity} onSubmitted={submitted}
          onBackOut={() => setToListing(false)} />
      ) : null}
      <div ref={bottom} />
    </>
  )
}
