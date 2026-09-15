import { useEffect, useRef, useState } from 'react'
import Fold from './Fold'
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

/**
 * 身份材料按步骤分组展开全部字段——记录要全，不是三行摘要。
 *
 * 核验那一步不在里面：它不是一个填进表单的值，过没过存在 kyc_verifications 里。
 * 不滤掉的话回执上会多出一行「Identity verification —」，看着像有一项没填。
 */
function kycGroups(form: Record<string, unknown>): Group[] {
  const steps = form.kind === 'Corporate' ? KYC_CORP : KYC_IND
  return steps
    .map(st => [st.t, (st.fields ?? [])
      .filter(f => f.type !== 'idcheck')
      .map(f => [f.l, show(form[f.k])] as [string, string])] as Group)
    .filter(([, rows]) => rows.length)
}

function Receipt({ groups }: { groups: Group[] }) {
  const n = groups.reduce((a, [, rows]) => a + rows.length, 0)
  return (
    <Fold className="rcpt" summary={`View submission · ${n} fields`}>
      {groups.map(([t, rows]) => (
        <div className="rgrp" key={t}>
          <em>{t}</em>
          <dl className="sfsum">
            {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </div>
      ))}
    </Fold>
  )
}

/** 后端把两段提交分开存成 {"kyc":…,"listing":…}。解不开就当没有。 */
function forms(raw: string | undefined): { kyc?: Record<string, unknown>; listing?: Listing } {
  try { return raw ? JSON.parse(raw) : {} } catch { return {} }
}

/**
 * 打回修改。
 *
 * 它不是「你被拒了」——措辞、颜色、后面跟着什么，三样都要说明这一点：
 * 说完话表单就在下面重新铺开，带着上次填的内容。终局的拒绝没有下文，
 * 打回有；两者在屏幕上长得一样，人只会理解成前者。
 */
function Revise({ reason }: { reason: string }) {
  return (
    <Them>
      <b className="mkrevh">A few things need changing before this can go through</b>
      <span className="mkrevb">{reason}</span>
      <span className="mkrevf">Your answers are still below — edit and send again.</span>
    </Them>
  )
}

/**
 * 哪一段被打回了。没有就是空。
 *
 * reject_reason 只有一列，两段共用——不会有歧义，因为「交过了但没过」
 * 同一时刻只可能是其中一段：身份没过就交不了挂单配置（后端拦着）。
 */
export function reviseAt(app: MakerApp | null): '' | 'kyc' | 'listing' {
  if (!app?.reject_reason) return ''
  if (app.kyc_done && !app.kyc_ok) return 'kyc'
  if (app.listing_done && !app.approved) return 'listing'
  return ''
}

// ── 主体 ────────────────────────────────────────────────────────────

export default function MakerThread({
  app, identity, from, toListing, toOffer, setToListing, setToOffer, onDone,
}: {
  app: MakerApp | null
  identity: string
  /** 从哪儿来的：先要下单（trade）还是直接来入驻（maker）。决定通过后说什么。 */
  from: 'trade' | 'maker'
  /* 两段表单开着没有。状态在 KycProvider 手里：输入框上方那条待办和这里
     这颗按钮点的是同一件事，各存一份就会出现「表单已经开着、待办还在催」。
     用户点了「Set up trading terms →」才铺表单，审核通过那条消息带的是
     下一段的入口，不是自动展开——参照也是要点一下的。 */
  toListing: boolean
  toOffer: boolean
  setToListing: (v: boolean) => void
  setToOffer: (v: boolean) => void
  onDone: () => void
}) {
  /* 刚提交完的那一秒。参照先发一条「typing…」，1.2 秒后才换成回执——
     回执是平台开的，瞬间蹦出来不像一个人在那头处理。 */
  const [typing, setTyping] = useState<'kyc' | 'listing' | null>(null)
  /* 挂出去的单。留在对话里就是这笔挂单的记录——参照的 offerPosted 也是
     把那张卡换成回执，而不是清掉。 */
  const [posted, setPosted] = useState<{ o: Offer; sym: string }[]>([])
  const bottom = useRef<HTMLDivElement>(null)

  const f = forms(app?.form)
  const kycDone = !!app?.kyc_done
  const kycOk = !!app?.kyc_ok
  const listDone = !!app?.listing_done
  const approved = !!app?.approved
  const revise = reviseAt(app)

  /* 新消息进来就滚到底——不滚的话通过那条消息连同它的按钮都在屏幕外面。 */
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [kycDone, kycOk, listDone, approved, typing, toListing, toOffer, posted.length])

  const submitted = (phase: 'kyc' | 'listing') => {
    setTyping(phase)
    setTimeout(() => setTyping(null), 1200)
    onDone()
  }

  /* 表单卡什么时候在：还没交身份材料；被打回的那一段；身份过了、点了
     下一段还没交；两段都过了、点了挂单。

     被打回的那一段不用等人再点一次「去修改」——评语就在上面一条消息里，
     让他对着评语改，中间再插一次点击只是多一道手续。 */
  const card: 'kyc' | 'listing' | 'offer' | null =
    revise ? revise
      : !kycDone ? 'kyc'
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
                {f.kyc ? <Receipt groups={kycGroups(f.kyc)} /> : null}
              </Them>
            )}
        </>
      )}

      {revise === 'kyc' ? <Revise reason={app?.reject_reason ?? ''} /> : null}

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

      {revise === 'listing' ? <Revise reason={app?.reject_reason ?? ''} /> : null}

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
          /* onDone 顺手把「名下有没有挂单」也重取一遍：不重取的话单子都挂
             出去了，待办条还停在「去挂第一单」。 */
          onPosted={(o, sym) => {
            setToOffer(false); setPosted(ps => [...ps, { o, sym }]); onDone()
          }} />
      ) : card ? (
        <MakerFlow phase={card} identity={identity}
          initial={card === 'kyc' ? f.kyc : (f.listing as unknown as Record<string, unknown>)}
          onSubmitted={submitted}
          onBackOut={() => setToListing(false)} />
      ) : null}
      <div ref={bottom} />
    </>
  )
}
