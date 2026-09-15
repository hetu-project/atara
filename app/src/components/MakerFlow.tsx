import { useEffect, useMemo, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import IdCheck from './IdCheck'
import {
  KYC_CORP, KYC_IND, LISTING_STEPS, VERIFIED_FIELDS, type Field, type Step,
} from './kycforms'
import { ListingStep, badListingField, blankListing, type Listing } from './MakerListing'
import type { ReviewIssue } from '../api/types'


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
  phase, identity, initial, issues, onPending, onSubmitted, onBackOut,
}: {
  phase: 'kyc' | 'listing'
  identity: string
  /** 上一次预审指出来的问题。标在出问题的那几项上，不是丢一段摘要让人自己找。 */
  issues?: ReviewIssue[]
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
  /** 交易条款第一步的返回。参照那颗箭头退回身份表单，我们这边身份已经交了、
      表单不在了，所以退回对话——「先不弄」是个真实的意图，得有地方去。 */
  onBackOut?: () => void
}) {
  /* 初值从上次那份里拆出来。提交时 kyc 段发的是 { kind, ...form }，
     所以 kind 要单独挑出来，剩下的才是表单字段本身。
     惰性初始化（useState(() => …)）而不是 useEffect 回填：回填会让表先
     空着渲染一帧再跳成有值的，九步表单那一跳很显眼。 */
  const [kind, setKind] = useState<'Individual' | 'Corporate'>(
    () => (initial?.kind === 'Corporate' ? 'Corporate' : 'Individual'),
  )
  /*
    Open on the step that has the first problem, not on step one.

    The summary sits at the top of the thread and the per-field note sits
    inside the step it belongs to; with nine steps between them, someone who
    was sent back to fix two fields can see neither. Moving the summary below
    the form would not help — the distance is the problem, not the side.

    Nothing flagged (a first submission) starts at the beginning as before.
  */
  const [step, setStep] = useState(() => firstFlaggedStep(phase, initial, issues))
  const [form, setForm] = useState<Record<string, string | string[]>>(() => {
    if (phase !== 'kyc' || !initial) return {}
    const { kind: _k, ...rest } = initial
    return rest as Record<string, string | string[]>
  })
  const [lst, setLst] = useState<Listing>(
    () => (phase === 'listing' && initial
      ? { ...blankListing(), ...(initial as unknown as Listing) }
      : blankListing()),
  )
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
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
  const { data: kyc, reload: reloadKyc } =
    useApi(() => (phase === 'kyc' ? ep.kycStatus(identity) : Promise.resolve(null)), [identity, phase])

  /* 证件上读出来的那几项写回表单：核验过之后这些不该再手打。
     写进 form 而不是只在渲染时替换，是因为提交的就是 form——
     只改显示的话，交上去的还是空的。 */
  const verified = useMemo(() => {
    const id = kyc?.state === 'accept' ? kyc.identity : null
    if (!id) return {}
    /* 选项类字段要先问一句「这个值在我们的选项里吗」。DocuPass 认得的国家和
       证件类型比这张表列的多得多——读出来一个不在列表里的值硬塞进去，
       结果是一行选不中的值，或者被悄悄改成「Other」。 */
    const opts = new Map<string, string[] | undefined>()
    for (const st of (kind === 'Corporate' ? KYC_CORP : KYC_IND) as Step[]) {
      for (const f of st.fields ?? []) {
        if (f.type === 'pick' || f.type === 'multi') opts.set(f.k, f.opts)
      }
    }
    const out: Record<string, string> = {}
    for (const [k, src] of Object.entries(VERIFIED_FIELDS)) {
      const v = id[src]
      if (typeof v !== 'string' || !v) continue
      if (opts.has(k) && !(opts.get(k) ?? []).includes(v)) continue
      out[k] = v
    }
    return out
  }, [kyc, kind])

  useEffect(() => {
    if (!Object.keys(verified).length) return
    setForm(f => ({ ...verified, ...f, ...verified }))
  }, [verified])

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
    if (!last) { setStep(s => s + 1); return }
    setBusy(true)
    try {
      const payload = phase === 'kyc'
        ? { kind, ...form }
        : { ...lst } as unknown as Record<string, unknown>
      // Tell the thread we are waiting *before* awaiting, not after it lands.
      onPending?.(phase)
      await ep.submitMakerApp(phase, payload, identity)
      onSubmitted(phase, payload)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit')
      /* The request failed, so nothing is in flight any more. Leaving the
         thread on "checking…" would have it wait forever on a reply that
         is never coming. */
      onSubmitted(phase, {})
    } finally { setBusy(false) }
  }

  const tag = phase === 'kyc'
    ? (kind === 'Corporate' ? 'Business verification' : 'Identity verification')
    : 'Trading terms'
  const kindLine = kind + (form.surname
    ? ' · ' + String(form.surname) + String(form.firstname ?? '')
    : form.company ? ' · ' + String(form.company) : '')

  /* 结构逐处对齐参照的 paintMaker()：一张 deal 卡，不是弹窗。
     步骤指示是一条分段进度条（.dsteps），不是把九个步骤名铺成一片文字——
     后者在窄栏里会换行成三四行，把表单本身挤到屏幕外面去。 */
  return (
    <div className="deal mine xopen">
      <div className="row1">
        <span className="st">{tag}</span>
        <span>{step + 1} / {steps.length} · {cur?.t}</span>
      </div>
      <div className="open"><div className="openin">
        <div className="dsteps" role="progressbar" aria-valuenow={step + 1}
          aria-valuemin={1} aria-valuemax={steps.length}
          aria-label={`Step ${step + 1} of ${steps.length}: ${cur?.t ?? ''}`}>
          {/* A step still holding a flagged field is marked, so "how much is
              left to fix" is readable without walking every step. The mark
              clears as soon as the field is edited — see `flagged`. */}
          {steps.map((s2, i) => {
            const needs = (s2.fields ?? []).some(f => flagged.has(f.k))
            const cls = [i < step ? 'on' : i === step ? 'now' : '', needs ? 'todo' : '']
              .filter(Boolean).join(' ')
            return (
              <i key={s2.t} className={cls}
                title={`${i + 1}. ${s2.t}${needs ? ' — needs a change' : ''}`} />
            )
          })}
        </div>
        <div className="pad">
          <p className="sellm-lead">{cur?.lead}</p>

          {phase === 'listing' ? (
            <ListingStep d={lst} step={step} bad={bad} kindLine={kindLine} onChange={setLst} />
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
                        onClick={() => { setKind(k); setForm({ ...verified }) }}>{k}</button>
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

          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

          <div className="dfoot">
            {(step > 0 || (phase === 'listing' && onBackOut)) && (
              <button className="btn btn-icon backbtn" title="Back" aria-label="Back"
                onClick={() => {
                  setBad(''); setErr('')
                  if (step > 0) setStep(s2 => s2 - 1)
                  else onBackOut?.()
                }}>
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
                  strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M10 3.5 5.5 8l4.5 4.5" /></svg>
              </button>
            )}
            <button className="btn btn-primary" disabled={busy} onClick={() => void next()}>
              {/* Say what it is doing. A button that only greys out looks
                  broken when the wait runs into seconds. */}
              {busy ? 'Checking…' : last ? 'Submit' : 'Next'}
            </button>
          </div>
        </div>
      </div></div>
    </div>
  )
}

/* 错误话跟着控件类型走。不小写化：会把 ID / TIN 这类缩写弄坏。逐字取自参照。 */
const VERB: Record<string, string> = {
  text: 'Enter', date: 'Enter', pick: 'Select', multi: 'Select', sign: 'Sign',
}
const errFor = (f: Field) =>
  f.type === 'sign' ? 'Signature required'
    : f.type === 'idcheck' ? 'Finish the identity check first'
      : `${VERB[f.type] ?? 'Enter'} ${f.l}`

function FieldRow({
  f, v, bad, locked, flagged, onSet,
}: {
  f: Field; v: string | string[] | undefined; bad: boolean
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
    return (
      <div className={cls} data-flag={flagged}>
        <span className="sfl">{f.l}</span>
        <div className="sfvfd">
          <b>{Array.isArray(v) ? v.join(', ') : v}</b>
          <em>from your document</em>
        </div>
      </div>
    )
  }
  if (f.type === 'pick') {
    return (
      <div className={cls} data-flag={flagged}><span className="sfl">{f.l}</span>
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
      <div className={cls} data-flag={flagged}><span className="sfl">{f.l}</span>
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
    <div className={cls} data-flag={flagged}><span className="sfl">{f.l}</span>
      <input type="text" value={typeof v === 'string' ? v : ''}
        placeholder={isDate ? 'YYYY-MM-DD' : 'Enter'}
        inputMode={isDate ? 'numeric' : undefined}
        onChange={e => onSet(e.target.value)} autoComplete="off" spellCheck={false} />
      <span className="err">{isDate ? `${f.l} must be YYYY-MM-DD` : errFor(f)}</span>
    </div>
  )
}
