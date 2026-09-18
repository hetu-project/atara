import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import Fold from './Fold'
import MakerFlow from './MakerFlow'
import MakerOffer, { OfferPosted } from './MakerOffer'
import { FIELD_LABELS, KYC_CORP, KYC_IND } from './kycforms'
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

/*
  Three dots, the chat idiom for "the other side is composing".

  Written in CSS rather than pulled from a motion library: the animation is
  one keyframe and three delays, while the library it comes from wants
  framer-motion, Next and Tailwind — none of which this app has. Borrowing
  the idea is free; borrowing the dependency is not.
*/
const Dots = () => (
  <span className="tdots" aria-hidden><i /><i /><i /></span>
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
function Revise({
  reason, app, identity, onDone,
}: {
  reason: string
  app: MakerApp | null
  identity: string
  onDone: () => void
}) {
  /* 申诉是个**次要**出口，所以默认收着：绝大多数打回是真的有东西要改，
     把「我觉得你判错了」和「去改」摆得一样显眼，会让人先去点那颗更省事的。 */
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const appealed = !!app?.appeal_note
  const issues = (app?.review_issues ?? []).filter(i => !i.fields.includes('*'))

  const send = async () => {
    const b = note.trim()
    if (!b || busy) return
    setBusy(true); setErr('')
    try {
      await ep.appealMakerApp(b, identity)
      setOpen(false); setNote(''); onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not send that')
    } finally { setBusy(false) }
  }

  return (
    <Them>
      {/*
        Framed as a record, not as a remark.

        It used to be an ordinary chat bubble — same avatar, same background,
        same shape as the assistant making conversation. But this is a
        decision that stops the application, so it has to read like one:
        what it is, how many things it found, and who found them.
      */}
      <div className="mkverd">
        <div className="mkvh">
          <span className="mkvt">Review</span>
          <span className="mkvn">
            {issues.length ? `${issues.length} to change` : 'Needs a change'}
          </span>
        </div>

        {issues.length ? (
          <ol className="mkvl">
            {issues.map((it, n) => (
              <li key={n}>
                {/* Name the fields it is about. A verdict you cannot trace
                    back to a field is one you cannot check. */}
                <span className="mkvf">{it.fields.map(labelOf).join(' · ')}</span>
                <p className="mkvs">{it.says}</p>
                <p className="mkva">{it.ask}</p>
              </li>
            ))}
          </ol>
        ) : (
          // Older records kept only the joined summary; still show it.
          <p className="mkvs">{reason}</p>
        )}

        {/* Attribution. A decision that blocks someone must say who made it —
            without it a machine's call is indistinguishable from small talk. */}
        <div className="mkvby">
          {app?.review_source === 'ai'
            ? `Checked by Atara AI${app.review_model ? ` · ${app.review_model}` : ''}`
            : app?.review_source === 'human' ? 'Reviewed by a person'
              : 'Checked against the listing rules'}
          {app?.reviewed_at ? ` · ${clockOf(app.reviewed_at)}` : ''}
        </div>
      </div>

      <span className="mkrevf">Your answers are still below — edit and send again.</span>
      {/* 已经申诉过就不再给第二颗按钮：重复递交同一件事，只会让队列里
          多几条一模一样的条目，而他并不会因此更快被看到。 */}
      {appealed ? (
        <span className="mkrevf">We have your note — a person will look at this.</span>
      ) : open ? (
        <span className="mkapp">
          <textarea rows={3} value={note} autoFocus
            placeholder="What do you think we got wrong?"
            onChange={e => setNote(e.target.value)} />
          <span className="mkappb">
            <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
            <button className="btn btn-primary btn-sm" disabled={busy || !note.trim()}
              onClick={() => void send()}>{busy ? 'Sending…' : 'Send to a person'}</button>
          </span>
          {err ? <em className="mkapperr">{err}</em> : null}
        </span>
      ) : (
        <button className="mkapplink" type="button" onClick={() => setOpen(true)}>
          I think this is wrong
        </button>
      )}
    </Them>
  )
}

/** Field key → the label on the form. Unknown keys print as-is rather than vanish. */
const labelOf = (k: string) => FIELD_LABELS[k] ?? k

const clockOf = (iso: string) => {
  const d = new Date(iso)
  return Number.isNaN(+d) ? '' : d.toTimeString().slice(0, 5)
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
  /*
    Which stage is waiting on the server right now.

    This used to be a 1.2s timer started *after* the reply came back — it
    simulated a delay that had already happened, while the real wait (rules
    plus a model call, a few seconds) showed nothing at all. Now it covers
    the actual request: set when it goes out, cleared when it lands.
  */
  const [pending, setPending] = useState<'kyc' | 'listing' | null>(null)
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
  /* The receipt prints the limits with their currency, and which currency
     that is depends on the rails they picked. */
  const { data: accts } = useApi(() => ep.bankAccounts(identity), [identity])

  /* 新消息进来就滚到底——不滚的话通过那条消息连同它的按钮都在屏幕外面。 */
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [kycDone, kycOk, listDone, approved, pending, toListing, toOffer, posted.length])

  const submitted = (phase: 'kyc' | 'listing') => {
    setPending(cur => (cur === phase ? null : cur))
    /* Close the form once it has been handed in.

       toListing is what "they asked to edit the terms" means, and nothing
       cleared it on the way out — so after a successful resubmission the
       thread showed the receipt and the approval above a form still sitting
       on its confirm step, asking to be submitted again. Whether the review
       passes or bounces is the thread's answer to give, not the form's. */
    if (phase === 'listing') setToListing(false)
    onDone()
  }

  /* 表单卡什么时候在：还没交身份材料；被打回的那一段；身份过了、点了
     下一段还没交；两段都过了、点了挂单。

     被打回的那一段不用等人再点一次「去修改」——评语就在上面一条消息里，
     让他对着评语改，中间再插一次点击只是多一道手续。 */
  const card: 'kyc' | 'listing' | 'offer' | null =
    revise ? revise
      /* Terms stay editable after approval. The gate used to be
         `!listDone`, which meant that once they were in, they were fixed:
         a maker who picked the wrong network or typed the wrong limit had
         nowhere to go, and neither did one whose business simply changed.
         Reopening sends the terms back for review — see
         SubmitMakerApplication. */
      : kycOk && toListing ? 'listing'
        : !kycDone ? 'kyc'
          : approved && toOffer ? 'offer'
            : null

  return (
    <>
      {/* Render as soon as it is in flight, not only once it has landed:
          the applicant's own message should appear the moment they hit
          Submit, the same as in any chat. */}
      {(kycDone || pending === 'kyc') && (
        <>
          <Me>Submitted identity verification</Me>
          {pending === 'kyc'
            ? <Them typing><Dots />Reading your answers…</Them>
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

      {/* 重审期间收掉上一次的结论。

          它说的是「你交的上一版有这两处要改」。人已经改完又交了一次,正等着
          听结果,这时把旧评语摆在那儿只会让他以为改了没用——而那两条确实
          可能已经不成立了。等新结论回来再显示,显示的就一定是当下的判断。 */}
      {revise === 'kyc' && pending !== 'kyc'
        ? <Revise reason={app?.reject_reason ?? ''} app={app} identity={identity} onDone={onDone} />
        : null}

      {kycOk && (from === 'trade' || kycDone) && (
        /* 通过那两条话逐字取自参照：为下单来验的只说「可以交易了」，
           直接来入驻的才带出下一段。

           入驻那条还要 kycDone：证件核验通过只说明这个人是真人，不说明
           九步材料交上来了——国籍、税务居民地、资金来源那些 DocuPass 从
           没问过。只读 kycOk 的话，做完活体就被告知「身份已通过，下一步
           配置交易条款」，整段自述被跳过。为下单来验的人不看这一段，
           所以 from==='trade' 照旧。 */
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

      {(listDone || pending === 'listing') && (
        <>
          <Me>Submitted trading terms</Me>
          {pending === 'listing'
            ? <Them typing><Dots />Reading your terms…</Them>
            : (
              <Them>
                Received — your trading terms are under review. Usually cleared within one
                business day{' '}
                <em style={{ fontStyle: 'normal', color: 'var(--faint)' }}>(demo: seconds)</em>.
                {f.listing
                  ? <Receipt groups={[['Trading terms', listingRows(f.listing, accts ?? [])]]} />
                  : null}
              </Them>
            )}
        </>
      )}

      {revise === 'listing' && pending !== 'listing'
        ? <Revise reason={app?.reject_reason ?? ''} app={app} identity={identity} onDone={onDone} />
        : null}

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
          onEditTerms={() => { setToOffer(false); setToListing(true) }}
          /* 挂完重取一次申请：挂单会动到账户状态（币锁进合约），
             这条对话里别处显示的还是挂之前那一份。 */
          onPosted={(o, sym) => {
            setToOffer(false); setPosted(ps => [...ps, { o, sym }]); onDone()
          }} />
      ) : card && !app ? (
        /* 申请还没拉回来,先什么都不铺。

           门控是从 app 的几个布尔推出来的,而 app 为 null 时它们全是 false
           ——于是「还没交身份材料」这个判断在数据缺席的情况下永远成立,
           表单会以默认状态先铺一遍:个人、第 1 步、空表。等数据到了,
           useState 的初始化函数早就跑完了,草稿和已选的主体再也塞不回去。

           后端对没有申请的人也回一个对象,所以 null 只可能是「还没加载完」。 */
        <div className="mkempty">Loading your application…</div>
      ) : card ? (
        <MakerFlow phase={card} identity={identity}
          initial={card === 'kyc' ? f.kyc : (f.listing as unknown as Record<string, unknown>)}
          issues={app?.review_issues}
          /* 只有同一段的草稿才恢复。两段表单字段完全不同,把身份那段的
             内容塞进交易条款表单,比不恢复糟得多。 */
          draft={app?.draft_phase === card ? app.draft : undefined}
          draftStep={app?.draft_phase === card ? app.draft_step : 0}
          kyb={app?.kyb}
          resubmit={card === 'listing' && listDone}
          onPending={setPending}
          onSubmitted={submitted}
          onBackOut={() => setToListing(false)} />
      ) : null}
      <div ref={bottom} />
    </>
  )
}
