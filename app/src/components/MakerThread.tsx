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

// ── 三段进度 ────────────────────────────────────────────────────────

const STEPS: [string, string][] = [
  ['kyc', 'Identity'], ['listing', 'Trading terms'], ['offer', 'First listing'],
]

type StepSt = 'done' | 'now' | 'review' | 'wait'

/**
 * review 和 now 必须分开画。
 *
 * 两者都「停在这一段」，但一个是等你动手、一个是等我们审——人只在前一种
 * 情况下需要做点什么。混成一个样子，等审核的人会一直去戳一个戳不动的东西。
 */
function stepStates(app: MakerApp | null, listed: boolean): StepSt[] {
  const kycDone = !!app?.kyc_done, kycOk = !!app?.kyc_ok
  const listDone = !!app?.listing_done, approved = !!app?.approved
  return [
    kycOk ? 'done' : kycDone ? 'review' : 'now',
    !kycOk ? 'wait' : approved ? 'done' : listDone ? 'review' : 'now',
    !approved ? 'wait' : listed ? 'done' : 'now',
  ]
}

/**
 * 准入是三段，但走在里面的人只看得见当前这一段。
 *
 * 不知道后面还有没有、还剩几段，每做完一步都要重新猜一次「是不是完了」。
 * 三个点一摆，「这是什么、要经过什么」就不必再解释——落地那一刻缺的是
 * 方位，不是理由，而方位用一行就能给，不值得为它挡一个弹窗：这条路是要
 * 反复进出的（交完条款回来挂单、挂完再挂第二个），给反复走的通道加一道
 * 确认，是在惩罚熟练的人。
 *
 * 它只报位置，不带按钮。动作留在对话里那条消息上（「Set up trading terms →」）：
 * 那颗按钮紧跟着解释它的那句话，而这里只有一个孤零零的「Set up →」。
 *
 * 当初给这一条也配过按钮，因为准入那块排在对话开头，聊几句那颗按钮就滚出了
 * 屏幕。整块沉到对话末尾之后，那个理由没有了——而理由没有了的补丁就该拆掉，
 * 否则屏幕上两颗按钮做同一件事，人得先分辨它们是不是同一件事。
 *
 * **只画给来做市的人。** 为了下单才去验身份的那条路，验完就回去下单，
 * 全程只有身份这一件事；对他画三段做市流程，等于告诉一个没打算做市的人
 * 「你卡在第二步」——而那一步在他那条路上根本不存在，连按钮都不会有。
 */
export function MakerProgress({
  app, listed, from,
}: { app: MakerApp | null; listed: boolean; from: 'trade' | 'maker' }) {
  if (from === 'trade') return null
  const st = stepStates(app, listed)
  return (
    <div className="mkprog">
      <ol className="mksteps" aria-label="Maker onboarding progress">
        {STEPS.map(([k, n], i) => (
          <li key={k} className={'mkstep ' + st[i]}
            aria-current={st[i] === 'now' ? 'step' : undefined}>
            <span className="mkdot" aria-hidden>{st[i] === 'done' ? '✓' : i + 1}</span>
            <b>{n}</b>
            {st[i] === 'review' ? <i>under review</i> : null}
          </li>
        ))}
      </ol>
    </div>
  )
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
          /* onDone 顺手把「名下有没有挂单」也重取一遍：不重取的话单子都挂
             出去了，待办条还停在「去挂第一单」。 */
          onPosted={(o, sym) => {
            setToOffer(false); setPosted(ps => [...ps, { o, sym }]); onDone()
          }} />
      ) : card ? (
        <MakerFlow phase={card} identity={identity} onSubmitted={submitted}
          onBackOut={() => setToListing(false)} />
      ) : null}
      <div ref={bottom} />
    </>
  )
}
