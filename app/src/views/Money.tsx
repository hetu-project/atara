import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useAction, useApi } from '../hooks/useApi'
import { ErrorBox } from '../components/bits'
import type { Allowance, Payee, Withdrawal } from '../api/types'

/** 支配权、地址簿、提现——「钱能进能出」的那一半。 */
export default function Money({ identity }: { identity: string }) {
  return (
    <>
      <h1>Money</h1>
      <p className="lede">
        额度是签进链上的支配权，不是平台的额度表。提现由你自己签那笔链上转账，
        协议只记意图与合规材料——它既不代持也不代发。
      </p>
      <Allowances identity={identity} />
      <Payees identity={identity} />
      <Withdrawals identity={identity} />
    </>
  )
}

// ── 支配权 ──

function Allowances({ identity }: { identity: string }) {
  const { data, error, reload } = useApi(() => ep.allowances(), [identity])
  const { run, pending, error: actErr } = useAction()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState<ep.AllowanceReq>({
    spender: '', kind: 'agent', per_payment: '300', window_cap: '1200',
    cycle: 'weekly', expires: '30 days', recipients: '',
  })

  const save = async () => {
    const r = await run(() => ep.saveAllowance(f))
    if (r) { setOpen(false); reload() }
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="row" style={{ justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>支配权</h2>
        <button className="btn ghost sm" onClick={() => setOpen(!open)}>
          {open ? '收起' : '签发一份'}
        </button>
      </div>
      <ErrorBox error={error} />

      {open && (
        <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--hairline)' }}>
          <div className="grid two">
            <label className="field">花钱的人
              <input type="text" value={f.spender} placeholder="Ops agent"
                onChange={e => setF({ ...f, spender: e.target.value })} />
            </label>
            <label className="field">类型
              <select value={f.kind}
                onChange={e => setF({ ...f, kind: e.target.value as 'person' | 'agent' })}>
                <option value="agent">Agent</option>
                <option value="person">人</option>
              </select>
            </label>
            <label className="field">单笔上限（USD）
              <input type="text" inputMode="decimal" value={f.per_payment}
                onChange={e => setF({ ...f, per_payment: e.target.value })} />
            </label>
            <label className="field">窗口总额（USD）
              <input type="text" inputMode="decimal" value={f.window_cap}
                onChange={e => setF({ ...f, window_cap: e.target.value })} />
            </label>
            <label className="field">周期
              <select value={f.cycle}
                onChange={e => setF({ ...f, cycle: e.target.value as 'weekly' | 'monthly' })}>
                <option value="weekly">每周</option>
                <option value="monthly">每月</option>
              </select>
            </label>
            <label className="field">有效期
              <select value={f.expires} onChange={e => setF({ ...f, expires: e.target.value })}>
                <option value="30 days">30 天</option>
                <option value="90 days">90 天</option>
                <option value="">不过期</option>
              </select>
            </label>
          </div>
          <p className="muted" style={{ fontSize: 12.5, margin: '12px 0' }}>
            单笔上限不能超过窗口总额。签发要 Passkey 签名——授予支配权本身就是一次授权动作。
          </p>
          <button className="btn" onClick={save} disabled={pending || !f.spender}>
            {pending ? '…' : '签名并签发'}
          </button>
          <ErrorBox error={actErr} onRemedy={v => setF({ ...f, per_payment: v })} />
        </div>
      )}

      {data?.length === 0 && <p className="muted">还没有签发过额度。</p>}
      <div className="orders" style={{ marginTop: data?.length ? 16 : 0 }}>
        {data?.map((a: Allowance) => (
          <div className="ordrow" key={a.id} role="presentation">
            <span className={`chip ${a.status === 'live' ? 'done' : 'them'}`}>{a.status}</span>
            <span className="ti">
              {a.spender} <span className="muted">· {a.kind}</span>
              <br />
              <span className="muted num" style={{ fontSize: 12.5 }}>
                单笔 ≤ {a.per_payment} · 窗口 {a.used}/{a.window_cap} · {a.cycle}
                {a.expires_at && ` · 到 ${a.expires_at.slice(0, 10)}`}
              </span>
            </span>
            {a.status === 'live' && (
              <button className="btn ghost sm" disabled={pending}
                onClick={() => run(() => ep.revokeAllowance(a.id)).then(reload)}>
                撤销
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 地址簿 ──

function Payees({ identity }: { identity: string }) {
  const { data, error, reload } = useApi(() => ep.payees(), [identity])
  const { run, pending, error: actErr } = useAction()
  const [f, setF] = useState({ label: '', chain: 'TRON', address: '' })

  const add = async () => {
    const r = await run(() => ep.addPayee(f))
    if (r) { setF({ label: '', chain: 'TRON', address: '' }); reload() }
  }

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <h2>收款方</h2>
      <p className="lede" style={{ marginBottom: 12 }}>
        同一串字符在另一条链上是另一个账户，所以链必填。按 (链, 地址) 去重。
      </p>
      <ErrorBox error={error} />
      <div className="row">
        <input type="text" placeholder="备注" value={f.label} style={{ width: 130 }}
          onChange={e => setF({ ...f, label: e.target.value })} aria-label="备注" />
        <select value={f.chain} onChange={e => setF({ ...f, chain: e.target.value })}
          aria-label="链">
          {['TRON', 'ETH', 'POLYGON', 'BTC'].map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <input type="text" placeholder="地址" value={f.address} style={{ flex: 1, minWidth: 200 }}
          onChange={e => setF({ ...f, address: e.target.value })} aria-label="地址" />
        <button className="btn sm" onClick={add} disabled={pending || !f.address}>加入</button>
      </div>
      <ErrorBox error={actErr} />

      <div className="orders" style={{ marginTop: 16 }}>
        {data?.length === 0 && <p className="muted">地址簿是空的。</p>}
        {data?.map((p: Payee) => (
          <div className="ordrow" key={p.id} role="presentation">
            <span className="chip them">{p.chain}</span>
            <span className="ti">
              {p.label}<br />
              <span className="mono muted">{p.address}</span>
            </span>
            <button className="btn ghost sm" disabled={pending}
              onClick={() => run(() => ep.deletePayee(p.id)).then(reload)}>删除</button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── 提现 ──

const PURPOSES = ['OTC settlement', 'Goods payment', 'Service fee', 'Refund',
  'Internal transfer', 'Other']

function Withdrawals({ identity }: { identity: string }) {
  const { data, error, reload } = useApi(() => ep.withdrawals(), [identity])
  const { data: payeeList } = useApi(() => ep.payees(), [identity])
  const { data: w } = useApi(() => ep.wallet(), [identity])
  const { run, pending, error: actErr } = useAction()
  const [f, setF] = useState<ep.WithdrawReq>({
    payee_id: '', asset: 'USDT', amount: '', purpose: PURPOSES[0]!,
  })
  const [tx, setTx] = useState<Record<string, string>>({})

  const submit = async () => {
    const r = await run(() => ep.createWithdrawal(f))
    if (r) { setF({ ...f, amount: '' }); reload() }
  }

  // 钱包里只有数字资产——法币不入账，所以提现的资产选项从钱包持仓来。
  const assetOptions = w?.assets.map(a => a.asset) ?? ['USDT']

  return (
    <div className="panel">
      <h2>提现</h2>
      <p className="lede" style={{ marginBottom: 12 }}>
        四步一次提交：地址 → 金额 → 用途 → 凭证。<strong>只能提数字资产</strong>——
        钱包里从来没有法币行。用途必填，收款银行会追问。
      </p>
      <ErrorBox error={error} />

      <div className="grid two">
        <label className="field">收款方
          <select value={f.payee_id} onChange={e => setF({ ...f, payee_id: e.target.value })}>
            <option value="">选一个…</option>
            {payeeList?.map(p => (
              <option key={p.id} value={p.id}>{p.label} · {p.chain}</option>
            ))}
          </select>
        </label>
        <label className="field">资产
          <select value={f.asset} onChange={e => setF({ ...f, asset: e.target.value })}>
            {assetOptions.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </label>
        <label className="field">金额
          <input type="text" inputMode="decimal" value={f.amount}
            onChange={e => setF({ ...f, amount: e.target.value })} />
        </label>
        <label className="field">用途
          <select value={f.purpose} onChange={e => setF({ ...f, purpose: e.target.value })}>
            {PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </label>
      </div>
      <div className="row" style={{ marginTop: 12 }}>
        <label className="field" style={{ flex: 1 }}>凭证（可选）
          <input type="file" onChange={async e => {
            const file = e.target.files?.[0]
            if (!file) return
            const ref = await ep.upload(file)
            setF(prev => ({ ...prev, doc_upload_id: ref }))
          }} />
        </label>
        <button className="btn" onClick={submit}
          disabled={pending || !f.payee_id || !f.amount}>
          {pending ? '…' : '签名并提交'}
        </button>
      </div>
      <ErrorBox error={actErr} />

      <div className="orders" style={{ marginTop: 16 }}>
        {data?.length === 0 && <p className="muted">还没有提现记录。</p>}
        {data?.map((d: Withdrawal) => (
          <div className="ordrow" key={d.id} role="presentation" style={{ flexWrap: 'wrap' }}>
            <span className={`chip ${d.state === 'confirmed' ? 'done'
              : d.state === 'failed' ? 'neg' : d.state === 'broadcast' ? 'auto' : 'you'}`}>
              {d.state}
            </span>
            <span className="ti">
              <span className="num">{d.amount} {d.asset}</span>
              {' → '}{d.payee_label}
              <br />
              <span className="muted" style={{ fontSize: 12.5 }}>
                {d.purpose} · <span className="mono">{d.payee_address}</span>
              </span>
            </span>
            {d.state === 'submitted' ? (
              // 协议不代发。你自己签完那笔转账，把哈希回填进来，状态才往前走。
              <span className="row" style={{ flexBasis: '100%', marginTop: 8 }}>
                <input type="text" placeholder="你签出来的 tx hash"
                  value={tx[d.id] ?? ''} style={{ flex: 1 }}
                  onChange={e => setTx({ ...tx, [d.id]: e.target.value })}
                  aria-label="交易哈希" />
                <button className="btn sm" disabled={pending || !tx[d.id]}
                  onClick={() => run(() => ep.broadcastWithdrawal(d.id, tx[d.id]!)).then(reload)}>
                  回填
                </button>
              </span>
            ) : d.tx_hash ? (
              <span className="mono muted">{d.tx_hash.slice(0, 14)}…</span>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  )
}
