import { useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { KYC_CORP, KYC_IND, LISTING_STEPS, type Field, type Step } from './kycforms'
import type { MakerApp } from '../api/types'

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

/* 挂单配置的字段。经营配置是能力级的——它圈定以后每次挂单的可选范围，
   所以在这里定一次，不是每次挂单重填。 */
const LISTING_FIELDS: Field[][] = [
  [
    { k: 'dir', l: 'Direction', type: 'pick', opts: ['Buy', 'Sell', 'Both'] },
    { k: 'coins', l: 'Assets', type: 'multi', opts: ['USDT', 'USDC'] },
    { k: 'fiats', l: 'Settlement currencies', type: 'multi', opts: ['CNY', 'HKD', 'USD'] },
    { k: 'lo', l: 'Minimum per order', type: 'text' },
    { k: 'hi', l: 'Maximum per order', type: 'text' },
    { k: 'spread', l: 'Spread %', type: 'text' },
  ],
  [{ k: 'agree', l: 'I accept the maker terms', type: 'sign' }],
]

/**
 * 做市准入：两段提交，两段审核。
 *
 *   身份 →【审核】→ 挂单配置 →【审核】→ 可挂单
 *
 * KYC 是账户级的，审过一次就不再重做；挂单配置是能力级的，改经营范围才重提。
 *
 * 两道门的放行都在后端：提交后落一个到期时间，调度器到点改状态（演示 5 秒，
 * 参照里是 6 秒的 setTimeout）。放行不在前端做——前端置位的话，换个浏览器
 * 打开就又变回「审核中」了，而且后端那道挂单闸门根本不认。
 */
export default function MakerFlow({
  app, identity, from, onClose, onDone,
}: {
  app: MakerApp | null
  identity: string
  /** 从哪儿来的：先要下单（trade）还是直接来入驻（maker）。决定通过后说什么。 */
  from: 'trade' | 'maker'
  onClose: () => void
  onDone: () => void
}) {
  const phase: 'kyc' | 'listing' = app?.kyc_ok ? 'listing' : 'kyc'
  const [kind, setKind] = useState<'Individual' | 'Corporate'>('Individual')
  const [step, setStep] = useState(0)
  const [form, setForm] = useState<Record<string, string | string[]>>({})
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  /* 从「身份已通过」那张卡进挂单配置。原来那颗按钮调的是 onDone——
     而 onDone 只是重新拉一次数据，拉完状态没变，又渲染同一张卡，原地打转。 */
  const [toListing, setToListing] = useState(false)

  const steps: Step[] = phase === 'kyc'
    ? (kind === 'Corporate' ? KYC_CORP : KYC_IND)
    : LISTING_STEPS.map((s, i) => ({ ...s, fields: LISTING_FIELDS[i] ?? [] }))
  const cur = steps[step]
  const last = step === steps.length - 1

  const set = (k: string, v: string | string[]) => setForm(f => ({ ...f, [k]: v }))

  /* 必填就是必填：缺一项就不让进下一步，并把话说在那一项上，不弹窗。 */
  const missing = (cur?.fields ?? []).filter(f => {
    const v = form[f.k]
    return f.type === 'multi' ? !(Array.isArray(v) && v.length) : !v
  })

  /* 占位符写了 YYYY-MM-DD 就得真按这个收——原生日期控件没了，
     格式校验的活就落到这里，不然一句「2019年6月」也会被当成填好了。 */
  const badDate = (cur?.fields ?? []).find(f =>
    f.type === 'date' && typeof form[f.k] === 'string'
    && !/^\d{4}-\d{2}-\d{2}$/.test(form[f.k] as string))

  const next = async () => {
    if (missing.length) { setErr(`${missing[0]!.l} is required`); return }
    if (badDate) { setErr(`${badDate.l} must be YYYY-MM-DD`); return }
    setErr('')
    if (!last) { setStep(s => s + 1); return }
    setBusy(true)
    try {
      await ep.submitMakerApp(phase, { kind, ...form }, identity)
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not submit')
    } finally { setBusy(false) }
  }

  /* 交完之后不是直接关掉——参照会在会话里留一张回执卡（receiptCard）。
     提交完界面一片空白，人会以为什么都没发生，然后再点一遍。 */
  const reviewing = (app?.kyc_done && !app.kyc_ok) || (app?.listing_done && !app.approved)
  const cleared = app?.kyc_ok && !app.listing_done && !toListing
  /* 两段都过了。以前挂单那一段永远不会通过，所以没有这张卡；现在会通过了，
     不补上的话卡片会掉回九步表单，看起来像提交没成功。 */
  if (app?.approved) {
    return (
      <div className="deal mine xopen">
        <div className="row1">
          <span className="st">Trading terms</span>
          <span>Approved</span>
          <button className="sayic" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="open"><div className="openin"><div className="pad">
          <p className="sellm-lead">
            ✓ Terms approved — you can post listings now. A listing is one offer with an
            amount and a price; posting it locks those coins into the escrow contract.
          </p>
          {/* 参照这里还有一颗「Post your first listing →」。挂单的界面这边还没有，
              放一颗点不动的按钮比不放更糟——上一轮就是这么被挑出来的。 */}
          <div className="dfoot">
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div></div></div>
      </div>
    )
  }
  if (cleared) {
    return (
      <div className="deal mine xopen">
        <div className="row1">
          <span className="st">Identity verification</span>
          <span>Cleared</span>
          <button className="sayic" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="open"><div className="openin"><div className="pad">
          {/* 文案取自参照的两条通过消息：为下单来验的只说「可以交易了」，
              直接来入驻的才带出下一段。 */}
          <p className="sellm-lead">
            {from === 'trade'
              ? '✓ Identity verified — you can trade now.'
              : '✓ Identity verified. Next: configure what you sell — assets, limits, '
                + 'pricing and payment rails.'}
          </p>
          <div className="dfoot">
            <button className="btn btn-ghost btn-sm" onClick={onClose}>Close</button>
            {/* 切到挂单配置要把步数归零。不归零的话它还停在身份那九步的第 9 步，
                而挂单配置只有两步，卡片会显示「9 / 2」而且一个字段都没有。 */}
            <button className="btn btn-primary"
              onClick={() => { setStep(0); setForm({}); setErr(''); setToListing(true) }}>
              Set up trading terms →
            </button>
          </div>
        </div></div></div>
      </div>
    )
  }
  if (reviewing) {
    return (
      <div className="deal mine xopen">
        <div className="row1">
          <span className="st">{app?.listing_done ? 'Trading terms' : 'Identity verification'}</span>
          <span>Received · in review</span>
          <button className="sayic" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </div>
        <div className="open"><div className="openin"><div className="pad">
          <p className="sellm-lead">
            Received — your {app?.listing_done ? 'trading terms are' : 'identity application is'}{' '}
            under review. Usually cleared within one business day{' '}
            <em style={{ fontStyle: 'normal', color: 'var(--faint)' }}>(demo: seconds)</em>.
            {app?.reject_reason ? <><br /><b>Returned:</b> {app.reject_reason}</> : null}
          </p>
          <div className="dfoot">
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div></div></div>
      </div>
    )
  }

  const fill = () => {
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
    setErr(''); setForm(next)
  }

  const tag = phase === 'kyc'
    ? (kind === 'Corporate' ? 'Business verification' : 'Identity verification')
    : 'Trading terms'

  /* 结构逐处对齐参照的 paintMaker()：一张 deal 卡，不是弹窗。
     步骤指示是一条分段进度条（.dsteps），不是把九个步骤名铺成一片文字——
     后者在窄栏里会换行成三四行，把表单本身挤到屏幕外面去。 */
  return (
    <div className="deal mine xopen">
      <div className="row1">
        <span className="st">{tag}</span>
        <span>{step + 1} / {steps.length} · {cur?.t}</span>
        <button className="sayic" style={{ marginLeft: 'auto' }} aria-label="Close" onClick={onClose}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
            strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
        </button>
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

          {/* 第一步选主体类型：之后两条路的字段完全不同 */}
          {phase === 'kyc' && step === 0 && (
            <div className="sf"><span className="sfl">Account type</span>
              <div className="sfchips">
                {(['Individual', 'Corporate'] as const).map(k => (
                  <button key={k} type="button" className={'sfchip' + (kind === k ? ' on' : '')}
                    onClick={() => { setKind(k); setForm({}) }}>{k}</button>
                ))}
              </div>
            </div>
          )}

          {(cur?.fields ?? []).map(f => <FieldRow key={f.k} f={f} v={form[f.k]} onSet={v => set(f.k, v)} />)}

          {err ? <p className="dnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}

          <div className="dfoot">
            <button className="btn btn-ghost btn-sm" onClick={fill}
              title="Fill every step with sample data">Demo fill</button>
            {step > 0 && (
              <button className="btn btn-icon backbtn" title="Back" aria-label="Back"
                onClick={() => { setErr(''); setStep(s2 => s2 - 1) }}>
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
  f, v, onSet,
}: { f: Field; v: string | string[] | undefined; onSet: (v: string) => void }) {
  const pick = useRef<HTMLInputElement>(null)
  return (
    <div className="sf">
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
    </div>
  )
}

function FieldRow({
  f, v, onSet,
}: { f: Field; v: string | string[] | undefined; onSet: (v: string | string[]) => void }) {
  if (f.type === 'pick') {
    return (
      <div className="sf"><span className="sfl">{f.l}</span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (v === o ? ' on' : '')}
              onClick={() => onSet(o)}>{o}</button>
          ))}
        </div>
      </div>
    )
  }
  if (f.type === 'multi') {
    const arr = Array.isArray(v) ? v : []
    return (
      <div className="sf"><span className="sfl">{f.l}</span>
        <div className="sfchips">
          {(f.opts ?? []).map(o => (
            <button key={o} type="button" className={'sfchip' + (arr.includes(o) ? ' on' : '')}
              onClick={() => onSet(arr.includes(o) ? arr.filter(x => x !== o) : [...arr, o])}>{o}</button>
          ))}
        </div>
      </div>
    )
  }
  /* 签名和上传都是一条宽行（.sfup），标签在按钮里面，外面不再另起 .sfl——
     参照就是这么做的：这两个不是「从几个选项里挑一个」，而是「做一件事」，
     做成小芯片会跟旁边的多选芯片长得一样，读的人分不出哪个是动作。 */
  if (f.type === 'sign') {
    return (
      <div className="sf">
        <button type="button" className={'sfup' + (v ? ' ok' : '')}
          onClick={() => onSet(v ? '' : 'Signed')}>
          <span><b>{f.l}</b><em>{typeof v === 'string' && v ? v : 'Tap to sign'}</em></span>
          <span className="sfst">{v ? 'Signed' : 'Sign'}</span>
        </button>
      </div>
    )
  }
  if (f.type === 'upload') return <UploadRow f={f} v={v} onSet={onSet} />
  /* 日期不用原生 <input type="date">：它按浏览器语言渲染，中文系统上会显示
     「年/月/日」，跟这套全英文界面对不上。参照用的就是普通文本框 +
     YYYY-MM-DD 占位符，格式由这里自己校验。 */
  const isDate = f.type === 'date'
  return (
    <div className="sf"><span className="sfl">{f.l}</span>
      <input type="text" value={typeof v === 'string' ? v : ''}
        placeholder={isDate ? 'YYYY-MM-DD' : 'Enter'}
        inputMode={isDate ? 'numeric' : undefined}
        onChange={e => onSet(e.target.value)} autoComplete="off" spellCheck={false} />
    </div>
  )
}
