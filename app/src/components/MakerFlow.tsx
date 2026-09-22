import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { COUNTRIES } from './countries'
import Dither from './Dither'
import FilePick from './FilePick'
import IdCheck from './IdCheck'
import {
  IDENTITY_FIELDS, KYC_CORP, KYC_IND, LISTING_STEPS, VERIFIED_BIZ, VERIFIED_FIELDS,
  type Field, type Step,
} from './kycforms'
import { ListingStep, badListingField, blankListing, type Listing } from './MakerListing'
import type { KybResult, ReviewIssue } from '../api/types'


/**
 * 准入向导那张卡：九步身份材料，或两步交易条款。
 *
 * 只是一张表单卡——提交完发生什么（回执、审核中、通过）不在这里，那是
 * 对话里的几条消息，由 MakerThread 渲染。参照就是这么分的：
 * 「提交不是『表单变成状态卡』，而是一轮对话」。
 *
 * 卡上没有关闭按钮，参照也没有：它是这条对话里的一条内容，不是盖在上面的
 * 弹窗，关掉它等于把刚说过的话删了。
 */
/**
 * Index of the earliest step containing a field the review flagged.
 *
 * Returns 0 when nothing is flagged, so a first submission is unaffected.
 * Field keys the form does not have (a model naming something we never sent,
 * or a stale issue after the form changed) simply match nothing — they must
 * not push the applicant to a step that has no problem on it.
 */
function firstFlaggedStep(
  phase: 'kyc' | 'listing',
  initial: Record<string, unknown> | undefined,
  issues: ReviewIssue[] | undefined,
): number {
  if (phase !== 'kyc' || !issues?.length) return 0
  const want = new Set(issues.flatMap(i => i.fields).filter(k => k !== '*'))
  if (!want.size) return 0
  const steps = (initial?.kind === 'Corporate' ? KYC_CORP : KYC_IND) as Step[]
  const at = steps.findIndex(st => (st.fields ?? []).some(f => want.has(f.k)))
  return at < 0 ? 0 : at
}

export default function MakerFlow({
  phase, identity, initial, issues, draft, draftStep, kyb: initialKyb,
  resubmit, onPending, onSubmitted, onFailed, onBackOut,
}: {
  phase: 'kyc' | 'listing'
  identity: string
  /**
   * These terms have already been approved once and are being changed.
   *
   * Submitting is not a free edit: it drops the approval until the review
   * clears again (PRD §卖方支线 改配置重审), and no listing can be posted in
   * between. Opening this form costs nothing, so the warning belongs here on
   * the last step rather than on the button that opens it.
   */
  resubmit?: boolean
  /** 上一次预审指出来的问题。标在出问题的那几项上，不是丢一段摘要让人自己找。 */
  issues?: ReviewIssue[]
  /**
   * 半路存下的那份,还没提交过。
   *
   * 优先于 initial:initial 是「上次交上去的」,草稿是「这次正在填的」。
   * 两者都有时,正在填的那份才是他离开时的样子。
   */
  draft?: Record<string, unknown>
  draftStep?: number
  /** 最近一次企业核验的结论。刷新回来靠它,不必重核。 */
  kyb?: KybResult
  /** 上次交上来的那份。被打回时表要带着原内容重开——让人对着评语改，
      而不是从头再填一遍九步。没有上一次就是 undefined。 */
  initial?: Record<string, unknown>
  /**
   * Fired the moment the request goes out, before anything comes back.
   *
   * The review runs server-side and takes a few seconds (rules are instant,
   * the model is not). Without this the thread has nothing to show for that
   * whole wait: the form just sits there with a dead button.
   */
  onPending?: (phase: 'kyc' | 'listing') => void
  /** 提交成功。form 交回去是给回执用的——那张「查看提交内容」要照着它画。 */
  onSubmitted: (phase: 'kyc' | 'listing', form: Record<string, unknown>) => void
  /** 提交失败：请求没落地。只用来撤掉「审核中」那条待办——表单留着，错误就在
      它下面。原来这里复用 onSubmitted，而那一路顺手把表单关了，错误随表单一起消失。 */
  onFailed?: (phase: 'kyc' | 'listing') => void
  /** 交易条款第一步的返回。参照那颗箭头退回身份表单，我们这边身份已经交了、
      表单不在了，所以退回对话——「先不弄」是个真实的意图，得有地方去。 */
  onBackOut?: () => void
}) {
  /* 初值从上次那份里拆出来。提交时 kyc 段发的是 { kind, ...form }，
     所以 kind 要单独挑出来，剩下的才是表单字段本身。
     惰性初始化（useState(() => …)）而不是 useEffect 回填：回填会让表先
     空着渲染一帧再跳成有值的，九步表单那一跳很显眼。 */
  /* 主体先看草稿,再看上次交的。草稿是「这次正在填的」,而人刚在第 1 步
     点过的那一下就在里面——它比一份还没提交过的 initial 更接近他此刻的意图。 */
  const [kind, setKind] = useState<'Individual' | 'Corporate'>(() => {
    const src = (draft ?? initial) as Record<string, unknown> | undefined
    return src?.kind === 'Corporate' ? 'Corporate' : 'Individual'
  })
  /*
    Open on the step that has the first problem, not on step one.

    The summary sits at the top of the thread and the per-field note sits
    inside the step it belongs to; with a dozen corporate steps between them,
    someone who was sent back to fix two fields can see neither. Moving the summary below
    the form would not help — the distance is the problem, not the side.

    Nothing flagged (a first submission) starts at the beginning as before.
  */
  /* 有草稿就回到离开时那一步;被打回的那一份仍然跳到第一个出问题的地方——
     评语指着某一步,把人放在别处读评语是没有用的。 */
  const [step, setStep] = useState(() => {
    const flagged = firstFlaggedStep(phase, initial, issues)
    if (flagged > 0) return flagged
    return Math.max(0, draftStep ?? 0)
  })
  const [form, setForm] = useState<Record<string, string | string[]>>(() => {
    if (phase !== 'kyc') return {}
    const src = draft ?? initial
    if (!src) return {}
    const { kind: _k, ...rest } = src
    return rest as Record<string, string | string[]>
  })
  const [lst, setLst] = useState<Listing>(() => {
    const src = phase === 'listing' ? (draft ?? initial) : null
    return src ? { ...blankListing(), ...(src as unknown as Listing) } : blankListing()
  })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* 交出去之后就不再存草稿了。后端在提交时已经把它清掉;这里再存一次会
     把它写回去,于是下次打开恢复的是一份跟正在审的材料不一样的东西。 */
  const [done, setDone] = useState(false)
  /* 企业核验的结论。初值来自申请——刷新回来不该让人再花 10 credits 核一次。
     `kybBusy` 只在这一次会话里为真:它是「正在等上游」,不是一个要持久的状态。 */
  const [kyb, setKyb] = useState(() => initialKyb)
  const [kybBusy, setKybBusy] = useState(false)
  const kybOk = kyb?.status === 'accept'

  /* 自动保存。

     防抖 800ms:每敲一个字符打一次接口,九步表单一次填写就是几百个请求,
     而这些请求都要加密一次、写一次库。停下来的那一刻再存,是人真的"填完
     一项"的时刻。

     提交之后不再存:那时草稿已经被后端清掉,再存一次等于把它又写回去,
     下次打开恢复的就是一份跟提交内容不同的材料。

     存失败不打扰人。它是个便利功能,不是他正在做的事——为一次没存上弹一
     条错误,只会打断填表。没配密钥时后端回 DRAFT_UNAVAILABLE,同样静默。 */
  const sent = useRef('')
  useEffect(() => {
    if (busy || done) return
    /* 存的是**此刻选中的**主体,不是上次交上去的那个。

       原来这里写的是 `kind: initial?.kind` —— 人在第 1 步点了 Corporate、
       一路填到第七步,草稿里记的却还是 undefined。刷新回来读到没有主体,
       退回个人那条路,前面填的十几项全部对不上号。 */
    const body = phase === 'kyc'
      ? { ...form, kind }
      : (lst as unknown as Record<string, unknown>)
    const payload = JSON.stringify(body)
    // 没变过就不存。步数变了也算变——人翻了一页。
    const sig = String(step) + ':' + payload
    if (sig === sent.current) return
    const t = setTimeout(() => {
      sent.current = sig
      void ep.saveMakerDraft({ phase, step, form: body }, identity).catch(() => {})
    }, 800)
    return () => clearTimeout(t)
  }, [form, lst, step, phase, identity, busy, done, kind])
  /* 出错的是哪一行。参照给那个 .sf 加 .bad，让它预置的 .err 显出来——
     错误话说在出错的字段上，不是卡片底下一句泛泛的提示。 */
  const [bad, setBad] = useState('')

  /* 预审指出来的问题，摊成「字段 → 要你做什么」。
  
     一条指摘可以指到好几个字段（「国籍写香港、税务居民写中国」指的是两项），
     那两项都要标——只标第一项的话，另一项看着是好的，人改完一项再提交，
     又被同一条打回来。
  
     改过的项要立刻不再标红：人已经动手了，红着不动等于说他改了也没用。
     所以 touched 一旦包含这个 key 就不再标它。 */
  const [touched, setTouched] = useState<Set<string>>(() => new Set())
  const flagged = useMemo(() => {
    const m = new Map<string, string>()
    for (const i of issues ?? []) {
      for (const k of i.fields) {
        if (k === '*' || touched.has(k)) continue
        m.set(k, i.ask)
      }
    }
    return m
  }, [issues, touched])

  /* 身份核验的状态。只有 kyc 那一段要它——挂单配置跟证件无关。
     这里不自己轮询：IdCheck 在人真的开了流程之后才让它转，没开之前
     每几秒问一次后端是白问，而后端每次问都会去上游拉一遍（按次计费）。 */
  /* 核验一过就把那条红字撤掉。

     点 Next 时还没验完 → setBad('sf-idcheck') → 红字出现。之后核验在另一个
     窗口里完成、状态推回来,绿框亮了,而那条红字还挂着——同一个控件上同时
     写着「已通过」和「先去通过」。红字是那一刻的判断,判断变了它就该走。 */
  const { data: kyc, reload: reloadKyc } =
    useApi(() => (phase === 'kyc' ? ep.kycStatus(identity) : Promise.resolve(null)), [identity, phase])

  /* 证件上读出来的那几项写回表单：核验过之后这些不该再手打。
     写进 form 而不是只在渲染时替换，是因为提交的就是 form——
     只改显示的话，交上去的还是空的。 */
  const verified = useMemo(() => {
    const id = kyc?.state === 'accept' ? kyc.identity : null
    if (!id && !(kind === 'Corporate' && kybOk)) return {}
    /* 选项类字段要先问一句「这个值在我们的选项里吗」。DocuPass 认得的国家和
       证件类型比这张表列的多得多——读出来一个不在列表里的值硬塞进去，
       结果是一行选不中的值，或者被悄悄改成「Other」。 */
    const opts = new Map<string, string[] | undefined>()
    const fields = [
      ...((kind === 'Corporate' ? KYC_CORP : KYC_IND) as Step[]).flatMap(st => st.fields ?? []),
      /* The individual path has no step for the identity fields any more;
         their option lists still decide what the document may write in. */
      ...IDENTITY_FIELDS,
    ]
    for (const f of fields) {
      if (f.type === 'pick' || f.type === 'multi') opts.set(f.k, f.opts)
    }
    const out: Record<string, string> = {}
    const take = (map: Record<string, string>, src: Record<string, unknown> | undefined) => {
      if (!src) return
      for (const [k, from] of Object.entries(map)) {
        const v = src[from]
        if (typeof v !== 'string' || !v) continue
        if (opts.has(k) && !(opts.get(k) ?? []).includes(v)) continue
        out[k] = v
      }
    }
    take(VERIFIED_FIELDS, id as unknown as Record<string, unknown>)
    /* 企业那条同理:注册文件上读出来的公司信息也不该再手打。
       只有核过的才算——review / reject 的那份数据本身就是存疑的,
       拿它去锁住输入框等于把一个可疑结论变成不可改的事实。 */
    if (kind === 'Corporate' && kybOk) {
      take(VERIFIED_BIZ, kyb?.business as unknown as Record<string, unknown>)
    }
    return out
  }, [kyc, kind, kyb, kybOk])

  useEffect(() => {
    if (!Object.keys(verified).length) return
    setForm(f => ({ ...verified, ...f, ...verified }))
  }, [verified])

  /* 董事名单从核验结果带出来。

     /kyb 的 directorsToVerify 是「该去验哪几个自然人」的权威答案,比让人
     手打一遍强得多——手打的名单没人核对过,而这一步存在的理由就是核对。

     只在这一栏还空着时填:人已经自己加过行了,再覆盖就是把他填的东西
     冲掉。国籍和证件号仍然要他补,文件上没有这两样。 */
  useEffect(() => {
    const names = kybOk ? (kyb?.business.directors ?? []) : []
    if (!names.length) return
    setForm(f => {
      const cur = Array.isArray(f.dirs) ? f.dirs : []
      if (cur.length) return f
      return { ...f, dirs: names.map(n => ({ name: n })) as unknown as string[] }
    })
  }, [kyb, kybOk])

  /* 传完就核,不用人再点一次。

     不放在 FilePick 的 onDone 里:那一层只知道「文件传好了」,而这件事要看
     它是不是注册文件、以及这一份有没有核过。`sentDoc` 记住核过的那一份,
     换一份才重核——10 credits 一次,重复核同一份是白烧。

     初值取自后端已有的结论,而不是空串。ref 只活在这一次挂载里:刷新一下
     它就忘了核过什么,而草稿里的 bizdoc 还在,于是又发一次请求。实测这样
     烧掉过 30 credits。服务端现在也会挡(按 user_id + file_ref 复用结论),
     但那一趟往返本来就不必发——它知道的东西这里也知道得到。 */
  const sentDoc = useRef(initialKyb?.file_ref ?? '')
  useEffect(() => {
    if (kind !== 'Corporate') return
    const ref = typeof form.bizdoc === 'string' ? form.bizdoc : ''
    if (!ref || ref === sentDoc.current) return
    sentDoc.current = ref
    setKybBusy(true)
    ep.verifyBusiness(ref, identity)
      .then(setKyb)
      .catch((e: unknown) => {
        /* 核验失败不静默。它花了钱、花了时间,而人正等着这一步的结论——
           什么都不说的话,他只会以为界面卡住了,然后再传一次。 */
        setErr(e instanceof Error ? e.message : 'Could not verify that document')
        sentDoc.current = ''
      })
      .finally(() => setKybBusy(false))
  }, [form.bizdoc, kind, identity])

  useEffect(() => {
    if (kyc?.state === 'accept') setBad(b => (b === 'sf-idcheck' ? '' : b))
  }, [kyc?.state])

  const steps: Step[] = phase === 'kyc'
    ? (kind === 'Corporate' ? KYC_CORP : KYC_IND)
    : LISTING_STEPS.map(s => ({ ...s, fields: [] }))
  const cur = steps[step]
  const last = step === steps.length - 1

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  /** 身份那一段：缺项、日期格式。返回出错字段的 id。 */
  const badKyc = (): string => {
    for (const f of cur?.fields ?? []) {
      /* 核验那一步过没过由后端说了算。前端记一个「我点过了」再放行，
         等于把这道门的钥匙交给了任何一个打开控制台的人。 */
      if (f.type === 'idcheck') {
        if (kyc?.state !== 'accept') return 'sf-' + f.k
        continue
      }
      const v = form[f.k]
      /* 可选项留空就过。

         前端原来把每一项都当必填,比后端严——「省」这种在香港、新加坡、
         开曼根本不存在的东西也被逼着填,填了又被审核指出跟城市重复。
         必填清单的权威在后端,这里跟着它走。 */
      if (f.opt && !(Array.isArray(v) ? v.length : v)) continue
      /* 一组人:至少一行,而且每行的每一栏都要填。空行比没有行更糟——
         它看着像申报过了,实际什么都没说。 */
      if (f.type === 'list') {
        const rows = (Array.isArray(v) ? v : []) as unknown as Record<string, string>[]
        if (!rows.length) return 'sf-' + f.k
        const hole = rows.some(r => (f.row ?? []).some(sub => !String(r?.[sub.k] ?? '').trim()))
        if (hole) return 'sf-' + f.k
        continue
      }
      const empty = f.type === 'multi' ? !(Array.isArray(v) && v.length) : !v
      if (empty) return 'sf-' + f.k
      if (f.type === 'date' && !/^\d{4}-\d{2}-\d{2}$/.test(String(v).trim())) return 'sf-' + f.k
    }
    return ''
  }

  const next = async () => {
    const b = phase === 'kyc' ? badKyc() : badListingField(lst, step)
    if (b) { setBad(b); return }
    setBad(''); setErr('')
    if (!last) { go(step + 1); return }
    setBusy(true)
    try {
      const payload = phase === 'kyc'
        ? { kind, ...form }
        : { ...lst } as unknown as Record<string, unknown>
      // Tell the thread we are waiting *before* awaiting, not after it lands.
      onPending?.(phase)
      /* Stop autosaving before the request goes out, not after. The submit
         clears the draft server-side; a save that was already queued would
         land afterwards and put it back. */
      setDone(true)
      await ep.submitMakerApp(phase, payload, identity)
      onSubmitted(phase, payload)
    } catch (e) {
      // It did not land, so there is still something worth keeping.
      setDone(false)
      setErr(e instanceof Error ? e.message : 'Could not submit')
      /* The request failed, so nothing is in flight any more. Leaving the
         thread on "checking…" would have it wait forever on a reply that
         is never coming. Only the pending marker comes off: the form stays
         open with the error under its button. (This used to call
         onSubmitted, whose other job is to close the form — so the error
         above was set on a component that vanished in the same tick.) */
      onFailed?.(phase)
    } finally { setBusy(false) }
  }

  const tag = phase === 'kyc'
    ? (kind === 'Corporate' ? 'Business verification' : 'Identity verification')
    : 'Trading terms'
  const kindLine = kind + (form.surname
    ? ' · ' + String(form.surname) + String(form.firstname ?? '')
    : form.company ? ' · ' + String(form.company) : '')

  /* Per-step state for both renderings of the progress: the rail and the
     narrow bar draw the same list, so it is computed once.

     Every step that can be reached is a button. The review points at step 4
     and step 9 while the person stands on step 12; walking Back and Next
     through the whole form is a dozen clicks, each one re-running that step's
     validation. Backwards only, never forward past a step not yet filled —
     the checks run step by step, and skipping one is skipping its check.
     Flagged steps are the exception: they were submitted, and going straight
     to them is the point. */
  const rail = steps.map((s2, i) => {
    const needs = (s2.fields ?? []).some(f => flagged.has(f.k))
    return {
      t: s2.t, i, needs,
      can: i <= step || needs,
      cls: [i < step ? 'on' : i === step ? 'now' : '', needs ? 'todo' : ''].filter(Boolean).join(' '),
    }
  })
  /* A step change is drawn as: this step leaves (fast), the next one arrives
     (slower), moving in the direction of travel. Leaving needs the old content
     to stay on screen for its 110ms, so the state change is held back that long;
     validation has already run by the time go() is called, so nothing the person
     did is delayed — only what they see. Reduced motion: change at once. */
  const [dir, setDir] = useState<1 | -1>(1)
  const [leaving, setLeaving] = useState(false)
  const goTimer = useRef<number | null>(null)
  useEffect(() => () => { if (goTimer.current) clearTimeout(goTimer.current) }, [])
  const go = (i: number) => {
    if (i === step) return
    setDir(i > step ? 1 : -1)
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { setStep(i); return }
    if (goTimer.current) clearTimeout(goTimer.current)
    setLeaving(true)
    goTimer.current = window.setTimeout(() => {
      goTimer.current = null
      setLeaving(false)
      setStep(i)
    }, 110)
  }
  const jump = (i: number) => { setBad(''); setErr(''); go(i) }
  const flaggedSteps = rail.filter(r => r.needs && r.i !== step).map(r => r.i + 1)
  const nextStep = steps[step + 1]

  /* One deal card in the thread, not a modal, as in the reference's paintMaker().

     Two columns: every step named down the left, the current step on the
     right. The old segmented bar hid the step names behind hover, so nobody
     knew what was still to come until they got there — the point in a long
     form where people give up (corporate onboarding is twelve steps). The
     rail lays the whole route out, and a step the review bounced says so in
     words, where the bar could only turn a two-pixel segment amber.

     The rail costs width. Below 640px of card (the chat column with the
     assessment panel dragged wide, or a phone) it folds away and a bar at
     the top of the body takes over — thicker than the old one, with a line
     under it carrying what the rail would have said. One React tree, one
     container query; see .krail / .kbar. */
  return (
    <div className="deal mine xopen kyc">
      <div className="open"><div className="openin">
        {/* The whole card morphs when the route changes — Individual has two
            steps, Corporate twelve, and the rail below goes from one to the
            other in a single render. Without this the card doubles in height
            in one frame and the thread under it jumps. StepStage inside does
            the same for the content on a step change; the two never fire on
            the same render. */}
        <HeightMorph dep={kind + phase} className="kwrap">
          {phase === 'kyc' && (
            /* Keyed on kind so the list remounts when the route changes and
               every item plays its entrance, staggered by --i: the route reads
               as unrolling rather than being swapped. Items that leave are not
               animated out — ten fading at once would drag — the height morph
               above carries that side. */
            <nav className="krail" aria-label="Steps" key={kind}>
              {rail.map(r => (
                <button key={r.t} type="button" className={'kst ' + r.cls}
                  style={{ '--i': Math.min(r.i, 10) } as React.CSSProperties}
                  disabled={!r.can || busy}
                  aria-current={r.i === step ? 'step' : undefined}
                  onClick={() => jump(r.i)}>
                  <span className="kdot" aria-hidden>
                    {r.needs ? '!' : r.i < step ? (
                      <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                        strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M3 8.5 6.2 11.7 13 4.9" /></svg>
                    ) : r.i + 1}
                  </span>
                  <span className="kt">{r.t}{r.needs && <em>Needs a change</em>}</span>
                </button>
              ))}
            </nav>
          )}
          <div className="kbody">
            <div className="keye">
              <span>{tag}</span><i aria-hidden>·</i>
              <span>Step {step + 1} of {steps.length}</span>
            </div>
            <h3 className="kh">{cur?.t}</h3>
            {/* The narrow-width bar. Same states as the rail; what the rail said
                in words goes on one line under it. */}
            <div className="kbar" aria-label={`Step ${step + 1} of ${steps.length}`}>
              <div>
                {rail.map(r => (
                  <button key={r.t} type="button" className={r.cls} disabled={!r.can || busy}
                    title={`${r.i + 1}. ${r.t}`} aria-label={`${r.i + 1}. ${r.t}`}
                    onClick={() => jump(r.i)}><i /></button>
                ))}
              </div>
              <p>
                {nextStep ? <>Next: <b>{nextStep.t}</b></> : <>Last step</>}
                {flaggedSteps.length > 0 && (
                  <> · Step {flaggedSteps.join(', ')} need{flaggedSteps.length === 1 ? 's' : ''} a change</>
                )}
              </p>
            </div>
            <StepStage step={step} dir={dir} leaving={leaving}>
            <p className="sellm-lead">{cur?.lead}</p>

          {phase === 'listing' ? (
            <ListingStep d={lst} step={step} bad={bad} kindLine={kindLine}
              identity={identity} onChange={setLst} />
          ) : (
            <>
              {/* 第一步选主体类型：之后两条路的字段完全不同 */}
              {step === 0 && (
                <div className="sf"><span className="sfl">Account type</span>
                  <div className="sfchips">
                    {(['Individual', 'Corporate'] as const).map(k => (
                      <button key={k} type="button" className={'sfchip' + (kind === k ? ' on' : '')}
                        /* 换主体类型清空表单：两条路的字段完全不同，留着上一条路
                           填的东西会串到这一条路的同名字段上。但证件读出来的那几项
                           不是「填的」——清掉它们，下一步会变回一排要手打的空框。 */
                        /* Clear the form outright. `verified` is memoised on the
                           kind that is *about to change*, so spreading it here put
                           the outgoing kind's verified fields — a company's, say —
                           into the incoming kind's form. The effect on `verified`
                           re-applies the right set once kind has actually changed. */
                        onClick={() => { setKind(k); setForm({}) }}>{k}</button>
                    ))}
                  </div>
                </div>
              )}
              {(cur?.fields ?? []).map(f => (
                f.type === 'idcheck' ? (
                  /* 这一步过没过不写在表单里，所以也没有 FieldRow 那个 .err 可用。
                     不补一句的话，点 Next 是一颗死按钮：没反应、也没说为什么。 */
                  <div key={f.k} className={'sf' + (bad === 'sf-' + f.k ? ' bad' : '')}>
                    <IdCheck identity={identity} status={kyc ?? null} onDone={reloadKyc} />
                    <span className="err">{errFor(f)}</span>
                  </div>
                ) : (
                  <FieldRow key={f.k} f={f} v={form[f.k]} bad={bad === 'sf-' + f.k}
                    identity={identity}
                    after={f.k === 'bizdoc'
                      ? <KybNote r={kyb} busy={kybBusy} /> : undefined}
                    locked={f.k in verified}
                    flagged={flagged.get(f.k)}
                    onSet={v => {
                      setBad('')
                      /* 动过的项不再标红——人已经在改了。 */
                      if (flagged.has(f.k)) {
                        setTouched(t => new Set(t).add(f.k))
                      }
                      set(f.k, v)
                    }} />
                )
              ))}
            </>
          )}

          {last && resubmit && !err ? (
            <p className="dnote" style={{ color: 'var(--warn)' }}>
              Submitting sends these terms back for review. Your current terms stay
              approved until then, but you cannot post new listings while it runs.
            </p>
          ) : null}
          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
            </StepStage>

            {/* Back on the left, forward on the right, on a rule of their own at
                the bottom of the column. Back is always drawn so the two never
                swap places between steps; on the first step it is simply off. */}
            <div className="kfoot">
              <button type="button" className="btn btn-ghost"
                disabled={busy || !(step > 0 || (phase === 'listing' && onBackOut))}
                onClick={() => {
                  setBad(''); setErr('')
                  if (step > 0) go(step - 1)
                  else onBackOut?.()
                }}>
                <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                  strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 3 5 8l5 5" /></svg>
                Back
              </button>
              <button className="btn btn-primary" disabled={busy} onClick={() => void next()}>
                {/* Say what it is doing. A button that only greys out looks
                    broken when the wait runs into seconds. */}
                {busy && <Dither size={12} speed={1} label="Checking" />}
                {busy ? 'Checking…' : !last ? 'Next' : resubmit ? 'Resubmit for review' : 'Submit'}
                {!busy && !last && (
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="m6 3 5 5-5 5" /></svg>
                )}
              </button>
            </div>
          </div>
        </HeightMorph>
      </div></div>
    </div>
  )
}

/**
 * A box that transitions its height whenever `dep` changes, by measuring
 * itself before and after. The same measure-and-tween StepStage uses for the
 * step content, without the content animation: here the children are the
 * card's two columns and only the outline should move. Reduced motion: the
 * height simply changes.
 */
function HeightMorph({
  dep, className, children,
}: { dep: string; className?: string; children: React.ReactNode }) {
  const wrap = useHeightMorph(dep)
  return <div ref={wrap} className={className}>{children}</div>
}

/**
 * The area of the card that changes between steps, and how it changes.
 *
 * Two motions at once. The content: the old step fades, lifts 5px and blurs
 * on its way out (`.kstage.out`, 110ms); the new one fades in from 8px below,
 * blurred, and settles (`.kin`, 220ms). Going back reverses the direction —
 * `--kdir` flips the signs. The blur is what makes it read as one thing
 * changing rather than two things swapping: without it there is a frame where
 * both are legible at once. Same recipe as beUI's tab panels; nothing new.
 *
 * The height: the stage measures itself before and after the content changes
 * and transitions between the two, the way StepSlide does in WalletModals. Without
 * this the chat stream below the card jumps every time a step has a different
 * number of fields — and every step does.
 *
 * `key={step}` remounts the inner wrapper so the enter animation plays once
 * per step. Keyframes, not a transition, because it runs from a fresh mount and
 * is never interrupted mid-way: the exit is finished before it starts.
 */
function StepStage({
  step, dir, leaving, children,
}: { step: number; dir: 1 | -1; leaving: boolean; children: React.ReactNode }) {
  const wrap = useHeightMorph(step)
  return (
    <div ref={wrap} className={'kstage' + (leaving ? ' out' : '')}
      style={{ '--kdir': dir } as React.CSSProperties}>
      <div key={step} className="kin">{children}</div>
    </div>
  )
}

/**
 * Transition an element's height whenever `dep` changes: measure before,
 * measure after, tween between. Used by StepStage (per step) and HeightMorph
 * (per route).
 *
 * Two effects, on purpose. The first has no deps and only takes a reading each
 * render, so the "before" height is always the latest. The second runs only
 * when `dep` changes and owns the tween. They used to be one depless effect,
 * and that was the bug: the tween sets the old height, then waits a frame to
 * set the new one — and any re-render in between (switching account type
 * triggers one straight away, from the verified-fields write-back) ran the
 * cleanup, cancelled that frame, and left the box pinned at the old height
 * with nothing left to unpin it. The card stayed Corporate-tall after
 * switching back to Individual.
 *
 * The cleanup now also clears the inline styles itself, and a timer clears
 * them if transitionend never arrives (it can be skipped when the transition
 * is interrupted). Reduced motion: the height just changes.
 */
function useHeightMorph(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null)
  const fromH = useRef(0)
  const prev = useRef(dep)

  useLayoutEffect(() => {
    const el = ref.current
    if (el && prev.current === dep) fromH.current = el.offsetHeight
  })

  useLayoutEffect(() => {
    const el = ref.current
    if (!el || prev.current === dep) return
    prev.current = dep
    const from = fromH.current
    /* Read the natural height with nothing pinned: a previous tween that was
       cut short may have left its inline height on the element. */
    el.style.height = ''
    el.style.overflow = ''
    el.style.transition = ''
    const to = el.offsetHeight
    fromH.current = to
    if (!from || from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) return

    const clear = () => {
      el.style.height = ''
      el.style.overflow = ''
      el.style.transition = ''
      el.removeEventListener('transitionend', done)
      clearTimeout(guard)
    }
    const done = (e: TransitionEvent) => {
      if (e.target === el && e.propertyName === 'height') clear()
    }
    el.style.height = `${from}px`
    el.style.overflow = 'hidden'
    const id = requestAnimationFrame(() => {
      el.style.transition = 'height var(--dur-normal) var(--ease)'
      el.style.height = `${to}px`
    })
    el.addEventListener('transitionend', done)
    const guard = window.setTimeout(clear, 600)
    return () => { cancelAnimationFrame(id); clear() }
  }, [dep])

  return ref
}

/* 错误话跟着控件类型走。不小写化：会把 ID / TIN 这类缩写弄坏。逐字取自参照。 */
const VERB: Record<string, string> = {
  text: 'Enter', date: 'Enter', pick: 'Select', multi: 'Select', sign: 'Sign',
  country: 'Select', upload: 'Upload', list: 'Add at least one',
}
const errFor = (f: Field) =>
  f.type === 'sign' ? 'Signature required'
    : f.type === 'idcheck' ? 'Finish the identity check first'
      : `${VERB[f.type] ?? 'Enter'} ${f.l}`

/**
 * 企业核验的结论,挂在注册文件那一项下面。
 *
 * 三档说三件不同的事,不揉成一句「通过/不通过」:
 *   accept  —— 读出来了,下一步那些框会是锁住的
 *   review  —— 读出来了但有疑点,人会看
 *   reject  —— 这份文件不成立,换一份
 *
 * simulated 那一行必须显眼:一台在模拟核验的机器跟一台在真核验的机器,
 * 界面上除了这句话没有任何区别。
 */
function KybNote({ r, busy }: { r?: KybResult; busy: boolean }) {
  if (busy) {
    /* The house loader (Dither) beside the sentence. A line of grey text on
       its own does not move, and a wait of several seconds with nothing
       moving reads as a hang. */
    return (
      <span className="kbn busy">
        <Dither size={16} speed={1.1} label="Reading your document" />
        Reading your document — this takes a few seconds…
      </span>
    )
  }
  if (!r) return null
  const b = r.business
  const tone = r.status === 'accept' ? 'ok' : r.status === 'review' ? 'warn' : 'bad'
  return (
    <div className={'kbn ' + tone}>
      <b>
        {r.status === 'accept' ? '✓ Business verified'
          : r.status === 'review' ? 'Needs a closer look'
            : '✕ Could not verify this document'}
      </b>
      {b.legal_name && (
        <span className="kbb">
          {b.legal_name}
          {b.reg_number ? ` · ${b.reg_number}` : ''}
          {b.status ? ` · ${b.status}` : ''}
        </span>
      )}
      {r.warnings?.length ? (
        <ul className="kbw">
          {r.warnings.map(w => <li key={w.code}>{w.description}</li>)}
        </ul>
      ) : null}
      {r.simulated && (
        <span className="kbs">Simulated — nothing was actually verified.</span>
      )}
    </div>
  )
}

/**
 * 可搜索的国家/地区。
 *
 * 照 BankAccounts 里 BankBox 那套做法,但**没有自由输入这条出口**——两者
 * 的区别在于表的性质:银行那张表是省打字用的,拦住用户填自己真实的银行
 * 就是个 bug;国家这张表是 ISO 3166-1 的全集,不在里面的东西也不是国家。
 *
 * 值是两位代码,显示是名字。存名字的话,「Macedonia」那种改名会让历史数据
 * 对不上号,而代码几十年不动。
 */
function CountryBox({ value, onPick }: { value: string; onPick: (v: string) => void }) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const away = (e: MouseEvent) => {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false)
    }
    addEventListener('mousedown', away)
    return () => removeEventListener('mousedown', away)
  }, [])

  const term = q.trim().toLowerCase()
  /* 代码也参与匹配:知道自己要 GB 的人不该被迫拼出 United Kingdom。
     空查询给前八个,不是给 241 个——一屏滚不完的列表等于没有列表。 */
  const hits = Object.entries(COUNTRIES)
    .filter(([c, n]) => !term || n.toLowerCase().includes(term) || c.toLowerCase() === term)
    .slice(0, 8)

  return (
    <div className="cbox" ref={box}>
      <input type="text" role="combobox" aria-expanded={open} autoComplete="off"
        placeholder="Type to search — Hong Kong, BVI, GB…"
        value={open ? q : (COUNTRIES[value] ?? '')}
        onFocus={() => { setOpen(true); setQ('') }}
        onChange={e => { setQ(e.target.value); setOpen(true) }} />
      <div className="cblist" role="listbox" hidden={!open || !hits.length}>
        {hits.map(([c, n]) => (
          <button type="button" className="cbrow" key={c} role="option"
            onMouseDown={e => { e.preventDefault(); onPick(c); setOpen(false) }}>
            <span className="cbn">{n}</span>
            <span className="cbc">{c}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

/**
 * 「可选」那个小标记。
 *
 * 只标可选、不标必填:这张表上绝大多数是必填的,给多数项挂星号等于给
 * 整页挂星号,而人真正需要知道的是「哪几项可以放过」。
 */
function Opt({ f }: { f: Field }) {
  return f.opt ? <em className="sfopt">optional</em> : null
}

function FieldRow({
  f, v, bad, locked, flagged, identity, after, onSet,
}: {
  f: Field; v: string | string[] | undefined; bad: boolean
  /** upload 那一类要它来传文件。 */
  identity?: string
  /** 挂在控件下面的东西,比如核验结论。 */
  after?: React.ReactNode
  /** 这一项是从证件上读出来的。锁住不给改——改了就不是证件上那个人了。 */
  locked?: boolean
  /** 预审指着这一项说的话。有值就把它标出来并把话摆在下面。 */
  flagged?: string
  onSet: (v: string | string[]) => void
}) {
  const cls = 'sf' + (bad ? ' bad' : '') + (locked ? ' vfd' : '')
    + (flagged ? ' flagged' : '')

  /* 已核验的项一律显示成一行只读的读数，不管它本来是什么控件。
     留成可编辑的输入框，等于让人把核验出来的姓名改掉再提交——
     那份材料就跟证件对不上了，而界面上还写着「已核验」。 */
  if (locked) {
    /* 读出来的国家存的是代码,给人看的得是名字。 */
    const shown = f.type === 'country' && typeof v === 'string'
      ? (COUNTRIES[v] ?? v) : v
    return (
      <div className={cls} data-flag={flagged}>
        <span className="sfl">{f.l}<Opt f={f} /></span>
        <div className="sfvfd">
          <b>{Array.isArray(shown) ? shown.join(', ') : shown}</b>
          <em>from your document</em>
        </div>
      </div>
    )
  }
  if (f.type === 'pick') {
    return (
      <div className={cls} data-flag={flagged}><span className="sfl">{f.l}<Opt f={f} /></span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (v === o ? ' on' : '')}
              onClick={() => onSet(o)}>{o}</button>
          ))}
        </div>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }
  if (f.type === 'multi') {
    const arr = Array.isArray(v) ? v : []
    return (
      <div className={cls} data-flag={flagged}><span className="sfl">{f.l}<Opt f={f} /></span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (arr.includes(o) ? ' on' : '')}
              onClick={() => onSet(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])}>{o}</button>
          ))}
        </div>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }
  /* 签名和上传都是一条宽行（.sfup），标签在按钮里面，外面不再另起 .sfl——
     参照就是这么做的：这两个不是「从几个选项里挑一个」，而是「做一件事」，
     做成小芯片会跟旁边的多选芯片长得一样，读的人分不出哪个是动作。 */
  /* 一份文件。值存的是后端给的 file_ref——文件本身在 uploads 表里,
     带 sha256,所以事后能回答「这份材料还是当初那一份吗」。 */
  /* 可搜索的国家。

     241 个地区装不进一排 chips,而下拉到第 180 个去找「British Virgin
     Islands」也不是选择。打字过滤是这个长度唯一能用的形态。

     值存 ISO 代码、显示名字:代码是稳定的,而名字会随语言和年份变
     (「Macedonia」改名那次让不少系统的历史数据对不上号)。 */
  if (f.type === 'country') {
    return (
      <div className={cls} data-flag={flagged}>
        <span className="sfl">{f.l}<Opt f={f} /></span>
        <CountryBox value={typeof v === 'string' ? v : ''} onPick={onSet} />
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }

  if (f.type === 'upload') {
    return (
      <div className={cls} data-flag={flagged}>
        <FilePick label={f.l} hint={f.hint} identity={identity}
          value={typeof v === 'string' ? v : undefined}
          onDone={(ref: string) => onSet(ref)} />
        {after}
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }

  /* 一组重复的行:董事、受益所有人。

     原来每一组只有三四个单字段,结构上就只填得下一个人——一家有五个董事的
     公司在那张表上无法如实申报,而「如实申报董事」正是这一步存在的理由。

     一行里的每一栏**递归交给 FieldRow 自己渲染**,不另写一套控件。第一版
     手搓了横排的 input 和一个 <select>,而这张表单里从来没有 select——国籍
     一向是 chips。同一页上两种控件,人会以为那是另一种东西。递归之后,
     这里长什么样永远等于别处长什么样。 */
  if (f.type === 'list') {
    const rows: Record<string, string>[] = Array.isArray(v)
      ? (v as unknown as Record<string, string>[]) : []
    const put = (next: Record<string, string>[]) => onSet(next as unknown as string[])
    const label = f.l.replace(/s$/, '')
    return (
      <div className={cls} data-flag={flagged}>
        <div className="lsrows">
          {rows.map((row, i) => (
            <div className="lsrow" key={i}>
              <div className="lshd">
                <span>{label} {i + 1}</span>
                {/* 只有一行时也能删——删光了再加回来,比逼人留一行空的强。 */}
                <button type="button" className="lsx" aria-label={`Remove ${label} ${i + 1}`}
                  onClick={() => put(rows.filter((_, j) => j !== i))}>×</button>
              </div>
              {(f.row ?? []).map(sub => (
                <FieldRow key={sub.k} f={sub} v={row[sub.k]} bad={false}
                  onSet={val => put(rows.map((r, j) =>
                    j === i ? { ...r, [sub.k]: val as string } : r))} />
              ))}
            </div>
          ))}
          <button type="button" className="lsadd"
            onClick={() => put([...rows, {}])}>+ Add {label.toLowerCase()}</button>
        </div>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }

  if (f.type === 'sign') {
    return (
      <div className={cls} data-flag={flagged}>
        <button type="button" className={'sfup' + (v ? ' ok' : '')}
          onClick={() => onSet(v ? '' : 'Signed')}>
          <span><b>{f.l}</b><em>{typeof v === 'string' && v ? v : 'Tap to sign'}</em></span>
          <span className="sfst">{v ? 'Signed' : 'Sign'}</span>
        </button>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }
  /* 日期不用原生 <input type="date">：它按浏览器语言渲染，中文系统上会显示
     「年/月/日」，跟这套全英文界面对不上。参照用的就是普通文本框 +
     YYYY-MM-DD 占位符，格式由这里自己校验。 */
  const isDate = f.type === 'date'
  return (
    <div className={cls} data-flag={flagged}><span className="sfl">{f.l}<Opt f={f} /></span>
      <input type="text" value={typeof v === 'string' ? v : ''}
        placeholder={isDate ? 'YYYY-MM-DD' : 'Enter'}
        inputMode={isDate ? 'numeric' : undefined}
        onChange={e => onSet(e.target.value)} autoComplete="off" spellCheck={false} />
      <span className="err">{isDate ? `${f.l} must be YYYY-MM-DD` : errFor(f)}</span>
    </div>
  )
}
