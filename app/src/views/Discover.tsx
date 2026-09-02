import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useAction, useApi } from '../hooks/useApi'
import { ErrorBox } from '../components/bits'
import type { MakerApp, Market } from '../api/types'

/**
 * Discover：协议的纵向，以及做市准入。
 *
 * 准入是两段：身份 → 【审核】→ 挂单配置 → 【审核】→ 可挂单。
 * 审核不算 agent 共识，是真人动作——所以审核台挂在 reviewer 角色后面。
 */
export default function Discover({ identity }: { identity: string }) {
  const { data: markets } = useApi(() => ep.markets(), [])
  const [pick, setPick] = useState('otc')
  const active = markets?.find(m => m.key === pick)

  return (
    <>
      <h1>Discover</h1>
      <p className="lede">
        协议按纵向划分。V1 只做 OTC——一个说得出而做不到的纵向，比不说更糟。
      </p>

      <div className="nav" style={{ margin: '0 0 20px' }}>
        {markets?.map((m: Market) => (
          <button key={m.key} aria-current={pick === m.key ? 'page' : undefined}
            onClick={() => setPick(m.key)}>
            {m.name}{!m.live && <span className="muted"> · Coming</span>}
          </button>
        ))}
      </div>

      {active && !active.live && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <span className="chip warn">Coming</span>
          <h2 style={{ marginTop: 12 }}>{active.name}</h2>
          <p className="lede">{active.desc}</p>
          {active.map && (
            <dl className="kv">
              {active.map.map(([k, v]) => (
                <div key={k} style={{ display: 'contents' }}>
                  <dt>{k}</dt><dd>{v}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <MakerAccess identity={identity} />
      <ReviewDesk identity={identity} />
    </>
  )
}

// ── 做市准入 ──

/** 九步 KYC 在旧控制台里很长。这里做成一份精简表单——后端只校验它是合法 JSON。 */
const KYC_FIELDS: [keyof KycForm, string, string[]?][] = [
  ['kind', '主体类型', ['Individual', 'Company']],
  ['nationality', '国籍 / 注册地', ['China', 'Hong Kong', 'Singapore', 'United States', 'Other']],
  ['legal_name', '法定名称', undefined],
  ['id_number', '证件号', undefined],
  ['source_of_funds', '资金来源', ['Trading', 'Business revenue', 'Investment', 'Other']],
]

interface KycForm {
  kind: string
  nationality: string
  legal_name: string
  id_number: string
  source_of_funds: string
}

interface ListingForm {
  dir: string[]
  coins: string[]
  fiats: string[]
  pricing: string
  spread: string
}

function MakerAccess({ identity }: { identity: string }) {
  const { data: app, error, reload } = useApi(() => ep.makerApp(), [identity])
  const { run, pending, error: actErr } = useAction()
  const [kyc, setKyc] = useState<KycForm>({
    kind: 'Individual', nationality: 'China', legal_name: '',
    id_number: '', source_of_funds: 'Trading',
  })
  const [listing, setListing] = useState<ListingForm>({
    dir: ['sell'], coins: ['USDT'], fiats: ['CNY'], pricing: 'Float', spread: '0.8',
  })

  if (!app) return <div className="panel"><p className="muted">读取申请状态…</p></div>

  const stage = stageOf(app)

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>做市准入</h2>
        <span className={`chip ${stage.chip}`}>{stage.label}</span>
      </div>
      <ErrorBox error={error} />

      {app.reject_reason && (
        <div className="err" role="alert">
          <code>被退回</code>
          <p>{app.reject_reason}</p>
        </div>
      )}

      <Steps app={app} />

      {stage.key === 'kyc' && (
        <>
          <p className="lede" style={{ margin: '16px 0 12px' }}>
            身份材料。后端只校验它是合法 JSON，不校验业务语义——字段还在改，
            后端跟着改会一直破。
          </p>
          <div className="grid two">
            {KYC_FIELDS.map(([k, label, opts]) => (
              <label className="field" key={k}>{label}
                {opts ? (
                  <select value={kyc[k]} onChange={e => setKyc({ ...kyc, [k]: e.target.value })}>
                    {opts.map(o => <option key={o} value={o}>{o}</option>)}
                  </select>
                ) : (
                  <input type="text" value={kyc[k]}
                    onChange={e => setKyc({ ...kyc, [k]: e.target.value })} />
                )}
              </label>
            ))}
          </div>
          <button className="btn" style={{ marginTop: 16 }} disabled={pending || !kyc.legal_name}
            onClick={() => run(() => ep.submitMakerApp('kyc', kyc)).then(reload)}>
            {pending ? '…' : '提交身份材料'}
          </button>
        </>
      )}

      {stage.key === 'listing' && (
        <>
          <p className="lede" style={{ margin: '16px 0 12px' }}>
            身份已过审。填挂单配置，再审一次就能挂单。
          </p>
          <div className="grid two">
            <label className="field">方向
              <select value={listing.dir[0]}
                onChange={e => setListing({ ...listing, dir: [e.target.value] })}>
                <option value="sell">卖币</option>
                <option value="buy">买币</option>
                <option value="both">双向</option>
              </select>
            </label>
            <label className="field">币种
              <select value={listing.coins[0]}
                onChange={e => setListing({ ...listing, coins: [e.target.value] })}>
                {['USDT', 'USDC', 'BTC', 'ETH'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">法币
              <select value={listing.fiats[0]}
                onChange={e => setListing({ ...listing, fiats: [e.target.value] })}>
                {['CNY', 'HKD', 'SGD', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </label>
            <label className="field">定价
              <select value={listing.pricing}
                onChange={e => setListing({ ...listing, pricing: e.target.value })}>
                <option value="Float">浮动</option>
                <option value="Fixed">固定</option>
              </select>
            </label>
            <label className="field">点差 %
              <input type="text" inputMode="decimal" value={listing.spread}
                onChange={e => setListing({ ...listing, spread: e.target.value })} />
            </label>
          </div>
          <button className="btn" style={{ marginTop: 16 }} disabled={pending}
            onClick={() => run(() => ep.submitMakerApp('listing', listing)).then(reload)}>
            {pending ? '…' : '提交挂单配置'}
          </button>
        </>
      )}

      {stage.key === 'review' && (
        <p className="muted" style={{ marginTop: 16 }}>
          已提交，等审核。审核是真人动作，不由系统自动放行——
          切到 <strong>Reviewer</strong> 身份可以看到审核台。
        </p>
      )}

      {stage.key === 'approved' && <MyOffers identity={identity} />}

      <ErrorBox error={actErr} />
    </div>
  )
}

function stageOf(app: MakerApp): { key: string; label: string; chip: string } {
  if (app.approved) return { key: 'approved', label: '已通过', chip: 'done' }
  if (app.listing_done) return { key: 'review', label: '配置审核中', chip: 'warn' }
  if (app.kyc_ok) return { key: 'listing', label: '待填挂单配置', chip: 'you' }
  if (app.kyc_done) return { key: 'review', label: '身份审核中', chip: 'warn' }
  return { key: 'kyc', label: '未申请', chip: 'them' }
}

function Steps({ app }: { app: MakerApp }) {
  const steps = [
    { label: '提交身份', done: app.kyc_done },
    { label: '身份过审', done: app.kyc_ok },
    { label: '提交配置', done: app.listing_done },
    { label: '配置过审', done: app.approved },
  ]
  return (
    <div className="rail" style={{ marginTop: 16 }}>
      {steps.map((s, i) => (
        <div key={s.label}
          className={`stop ${s.done ? 'done' : steps[i - 1]?.done ?? true ? 'now' : 'next'}`}>
          <div className="dot" />
          <div className="lb">{s.label}</div>
        </div>
      ))}
    </div>
  )
}

// ── 已通过后：挂单 ──

function MyOffers({ identity }: { identity: string }) {
  const { data, reload } = useApi(() => ep.myOffers(), [identity])
  const { run, pending, error } = useAction()
  const [f, setF] = useState({
    side: 'sell' as 'buy' | 'sell', asset: 'USDT', fiat: 'CNY',
    unit_price: '7.30', qty: '1000', min_lot: '500', network: 'TRON',
  })

  return (
    <div style={{ marginTop: 20, paddingTop: 20, borderTop: '1px solid var(--hairline)' }}>
      <h2>我的挂单</h2>
      <p className="lede" style={{ marginBottom: 12 }}>
        <strong>卖单挂出即上链锁币</strong>——买家看到的可成交量必须真的在托管合约里，
        所以要 Passkey 签名。买单不锁任何东西，法币腿走银行，那只是一句承诺。
      </p>
      <div className="grid two">
        <label className="field">方向
          <select value={f.side}
            onChange={e => setF({ ...f, side: e.target.value as 'buy' | 'sell' })}>
            <option value="sell">卖出（挂出即锁币）</option>
            <option value="buy">买入（不锁币）</option>
          </select>
        </label>
        <label className="field">资产
          <select value={f.asset} onChange={e => setF({ ...f, asset: e.target.value })}>
            {['USDT', 'USDC', 'BTC', 'ETH'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">法币
          <select value={f.fiat} onChange={e => setF({ ...f, fiat: e.target.value })}>
            {['CNY', 'HKD', 'SGD', 'JPY'].map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </label>
        <label className="field">单价
          <input type="text" inputMode="decimal" value={f.unit_price}
            onChange={e => setF({ ...f, unit_price: e.target.value })} />
        </label>
        <label className="field">数量（{f.asset}）
          <input type="text" inputMode="decimal" value={f.qty}
            onChange={e => setF({ ...f, qty: e.target.value })} />
        </label>
        <label className="field">起投额（{f.fiat}）
          <input type="text" inputMode="decimal" value={f.min_lot}
            onChange={e => setF({ ...f, min_lot: e.target.value })} />
        </label>
      </div>
      <button className="btn" style={{ marginTop: 16 }} disabled={pending}
        onClick={() => run(() => ep.createOffer(f)).then(reload)}>
        {pending ? '…' : f.side === 'sell' ? '签名并锁币挂出' : '挂出买单'}
      </button>
      <ErrorBox error={error} />

      <div className="orders" style={{ marginTop: 16 }}>
        {data?.length === 0 && <p className="muted">还没有挂单。</p>}
        {data?.map(o => (
          <div className="ordrow" key={o.id} role="presentation">
            <span className={`chip ${o.status === 'active' ? 'done' : 'them'}`}>{o.status}</span>
            <span className="ti">
              {o.side === 'sell' ? '卖' : '买'} {o.asset}/{o.fiat} @ <span className="num">{o.unit_price}</span>
              <br />
              <span className="muted num" style={{ fontSize: 12.5 }}>
                余 {o.remaining_qty} {o.asset} · 起投 {o.min_lot} {o.fiat}
              </span>
            </span>
            {o.status === 'active' && (
              <button className="btn ghost sm" disabled={pending}
                onClick={() => run(() => ep.delistOffer(o.id)).then(reload)}>下架</button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 审核台（reviewer 角色）──

function ReviewDesk({ identity }: { identity: string }) {
  const { data: user } = useApi(() => ep.me(), [identity])
  const { data, error, reload } = useApi(
    () => user?.role === 'reviewer' ? ep.pendingMakerApps() : Promise.resolve([]),
    [identity, user?.role])
  const { run, pending, error: actErr } = useAction()
  const [reason, setReason] = useState<Record<string, string>>({})

  if (user?.role !== 'reviewer') return null

  const review = (userId: string, stage: 'kyc' | 'listing',
    decision: 'approve' | 'reject') =>
    run(() => ep.reviewMakerApp(userId, {
      stage, decision, reason: reason[userId] ?? '',
    })).then(reload)

  return (
    <div className="panel">
      <h2>审核台</h2>
      <p className="lede" style={{ marginBottom: 12 }}>
        审核不算 agent 共识——它是真人动作，所以既不由系统自动放行，也不是人人都能点。
        拒绝必须给理由，否则申请人不知道该改什么，只会反复提交同一份材料。
      </p>
      <ErrorBox error={error} />
      {data?.length === 0 && <p className="muted">没有待审的申请。</p>}

      <div className="orders">
        {data?.map((a: MakerApp) => {
          const stage: 'kyc' | 'listing' = a.kyc_ok ? 'listing' : 'kyc'
          return (
            <div className="ordrow" key={a.user_id} role="presentation"
              style={{ flexWrap: 'wrap' }}>
              <span className="chip you">{stage}</span>
              <span className="ti">
                {a.display_name ?? a.user_id}
                <br />
                <span className="mono muted" style={{ fontSize: 12 }}>
                  {a.form.slice(0, 90)}{a.form.length > 90 ? '…' : ''}
                </span>
              </span>
              <span className="row" style={{ flexBasis: '100%', marginTop: 8 }}>
                <input type="text" placeholder="退回理由（拒绝时必填）"
                  value={reason[a.user_id] ?? ''} style={{ flex: 1 }}
                  onChange={e => setReason({ ...reason, [a.user_id]: e.target.value })}
                  aria-label="退回理由" />
                <button className="btn sm" disabled={pending}
                  onClick={() => review(a.user_id, stage, 'approve')}>通过</button>
                <button className="btn ghost sm" disabled={pending || !reason[a.user_id]}
                  onClick={() => review(a.user_id, stage, 'reject')}>退回</button>
              </span>
            </div>
          )
        })}
      </div>
      <ErrorBox error={actErr} />
    </div>
  )
}
