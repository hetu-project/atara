import { useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { KYC_CORP, KYC_IND, LISTING_STEPS, type Field, type Step } from './kycforms'
import {
  DEMO_LISTING, ListingStep, badListingField, blankListing, type Listing,
} from './MakerListing'

/* Demo fill 的样本数据，逐字取自参照。演示时没人愿意手打九步表单——
   这个按钮不是玩具，它决定了这条流程能不能当着人走完。 */
const DEMO_TXT: Record<string, string> = {
  surname: 'Liu', firstname: 'Ellie', idno: 'H12345678', phone: '+852 6123 4567',
  email: 'demo@atara.example', addr: '12 Harbour Rd, Wan Chai, HK', tin: 'HK-98765432',
  industry: 'Cross-border trade', employer: 'Self-employed',
  company: 'Huachuang Trading Ltd', regno: 'CR-2019-88123', street: '12 Harbour Rd',
  city: 'Hong Kong', province: 'HK', zip: '999077', bizindustry: 'Electronics export',
  bizscope: 'Component sourcing', mainrev: 'Component resale', repname: 'Ellie Liu',
  reptitle: 'Director', repid: 'H12345678', repphone: '+852 6123 4567',
  dirname: 'Ellie Liu', dirid: 'H12345678', ubo: 'Ellie Liu', uboshare: '100',
  uboid: 'H12345678',
}
const DEMO_DATE: Record<string, string> = {
  idissue: '2019-06-01', iddue: '2031-06-01', birthday: '1992-04-16', estdate: '2019-03-12',
}


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
export default function MakerFlow({
  phase, identity, onSubmitted, onBackOut,
}: {
  phase: 'kyc' | 'listing'
  identity: string
  /** 提交成功。form 交回去是给回执用的——那张「查看提交内容」要照着它画。 */
  onSubmitted: (phase: 'kyc' | 'listing', form: Record<string, unknown>) => void
  /** 交易条款第一步的返回。参照那颗箭头退回身份表单，我们这边身份已经交了、
      表单不在了，所以退回对话——「先不弄」是个真实的意图，得有地方去。 */
  onBackOut?: () => void
}) {
  const [kind, setKind] = useState<'Individual' | 'Corporate'>('Individual')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Record<string, string | string[]>>({})
  const [lst, setLst] = useState<Listing>(blankListing)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* 出错的是哪一行。参照给那个 .sf 加 .bad，让它预置的 .err 显出来——
     错误话说在出错的字段上，不是卡片底下一句泛泛的提示。 */
  const [bad, setBad] = useState('')

  const steps: Step[] = phase === 'kyc'
    ? (kind === 'Corporate' ? KYC_CORP : KYC_IND)
    : LISTING_STEPS.map(s => ({ ...s, fields: [] }))
  const cur = steps[step]
  const last = step === steps.length - 1

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  /** 身份那一段：缺项、日期格式。返回出错字段的 id。 */
  const badKyc = (): string => {
    for (const f of cur?.fields ?? []) {
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
      await ep.submitMakerApp(phase, payload, identity)
      onSubmitted(phase, payload)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit')
    } finally { setBusy(false) }
  }

  const fill = () => {
    if (phase === 'listing') { setBad(''); setLst({ ...lst, ...DEMO_LISTING }); return }
    const next: Record<string, string | string[]> = { ...form }
    for (const st of steps) {
      for (const f of st.fields ?? []) {
        if (next[f.k]) continue
        if (f.type === 'pick') next[f.k] = f.opts?.[0] ?? ''
        else if (f.type === 'multi') next[f.k] = f.opts?.[0] ? [f.opts[0]] : []
        else if (f.type === 'date') next[f.k] = DEMO_DATE[f.k] ?? '2020-01-01'
        else if (f.type === 'sign') next[f.k] = 'Signed'
        else if (f.type === 'upload') next[f.k] = 'Uploaded'
        else next[f.k] = DEMO_TXT[f.k] ?? 'Demo'
      }
    }
    setBad(''); setForm(next)
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
          {steps.map((s2, i) => (
            <i key={s2.t} className={i < step ? 'on' : i === step ? 'now' : ''} title={`${i + 1}. ${s2.t}`} />
          ))}
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
                        onClick={() => { setKind(k); setForm({}) }}>{k}</button>
                    ))}
                  </div>
                </div>
              )}
              {(cur?.fields ?? []).map(f => (
                <FieldRow key={f.k} f={f} v={form[f.k]} bad={bad === 'sf-' + f.k}
                  onSet={v => { setBad(''); set(f.k, v) }} />
              ))}
            </>
          )}

          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

          <div className="dfoot">
            <button className="btn btn-ghost btn-sm" onClick={fill}
              title="Fill every step with sample data">Demo fill</button>
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
              {last ? 'Submit' : 'Next'}
            </button>
          </div>
        </div>
      </div></div>
    </div>
  )
}

/**
 * 上传行。用 <button> 而不是包着 input 的 <label>——样式表里有一条
 * `.sf>label{display:block}`，优先级比 .sfup 高，会把这一行从 flex 压成
 * block，右边那颗状态胶囊就贴到文字后面去了，推不到最右。
 */
function UploadRow({
  f, v, bad, onSet,
}: { f: Field; v: string | string[] | undefined; bad: boolean; onSet: (v: string) => void }) {
  const pick = useRef<HTMLInputElement>(null)
  return (
    <div className={'sf' + (bad ? ' bad' : '')}>
      <button type="button" className={'sfup' + (v ? ' ok' : '')}
        onClick={() => pick.current?.click()}>
        <span><b>{f.l}</b><em>{typeof v === 'string' && v ? v : 'Tap to upload'}</em></span>
        <span className="sfst">{v ? 'Uploaded' : 'Upload'}</span>
      </button>
      {/* 真上传：审核员要看到的是文件，不是一个占位字符串 */}
      <input type="file" hidden ref={pick} accept="image/*,application/pdf"
        onChange={async e => {
          const file = e.target.files?.[0]
          if (!file) return
          try { onSet(await ep.upload(file)) } catch { /* 失败就保持未附 */ }
        }} />
      <span className="err">{errFor(f)}</span>
    </div>
  )
}

/* 错误话跟着控件类型走——上传类说 Enter 不通。不小写化：会把 ID / TIN
   这类缩写弄坏。逐字取自参照。 */
const VERB: Record<string, string> = {
  text: 'Enter', date: 'Enter', pick: 'Select', multi: 'Select', upload: 'Upload', sign: 'Sign',
}
const errFor = (f: Field) =>
  f.type === 'sign' ? 'Signature required' : `${VERB[f.type] ?? 'Enter'} ${f.l}`

function FieldRow({
  f, v, bad, onSet,
}: {
  f: Field; v: string | string[] | undefined; bad: boolean
  onSet: (v: string | string[]) => void
}) {
  const cls = 'sf' + (bad ? ' bad' : '')
  if (f.type === 'pick') {
    return (
      <div className={cls}><span className="sfl">{f.l}</span>
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
      <div className={cls}><span className="sfl">{f.l}</span>
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
      <div className={cls}>
        <button type="button" className={'sfup' + (v ? ' ok' : '')}
          onClick={() => onSet(v ? '' : 'Signed')}>
          <span><b>{f.l}</b><em>{typeof v === 'string' && v ? v : 'Tap to sign'}</em></span>
          <span className="sfst">{v ? 'Signed' : 'Sign'}</span>
        </button>
        <span className="err">{errFor(f)}</span>
      </div>
    )
  }
  if (f.type === 'upload') return <UploadRow f={f} v={v} bad={bad} onSet={onSet} />
  /* 日期不用原生 <input type="date">：它按浏览器语言渲染，中文系统上会显示
     「年/月/日」，跟这套全英文界面对不上。参照用的就是普通文本框 +
     YYYY-MM-DD 占位符，格式由这里自己校验。 */
  const isDate = f.type === 'date'
  return (
    <div className={cls}><span className="sfl">{f.l}</span>
      <input type="text" value={typeof v === 'string' ? v : ''}
        placeholder={isDate ? 'YYYY-MM-DD' : 'Enter'}
        inputMode={isDate ? 'numeric' : undefined}
        onChange={e => onSet(e.target.value)} autoComplete="off" spellCheck={false} />
      <span className="err">{isDate ? `${f.l} must be YYYY-MM-DD` : errFor(f)}</span>
    </div>
  )
}
