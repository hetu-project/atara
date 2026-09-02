import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { ErrorBox } from '../components/bits'

export default function Wallet({ identity }: { identity: string }) {
  const { data: w, error, loading } = useApi(() => ep.wallet(), [identity])
  const { data: user } = useApi(() => ep.me(), [identity])

  return (
    <>
      <h1>Account</h1>
      <p className="lede">
        账户就是一个链上地址。余额读自链，不读平台账本——协议不持有资金。
        钱包里只有数字资产，法币永远不入账。
      </p>
      <ErrorBox error={error} />
      {loading && <p className="muted">读取中…</p>}

      {user && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <dl className="kv">
            <dt>身份</dt><dd>{user.display_name}</dd>
            <dt>地址</dt><dd className="mono">{user.address}</dd>
            <dt>钱包类型</dt><dd>
              {user.wallet_kind === 'ext'
                ? '自带钱包 — 协议从未持有你的私钥'
                : 'Atara 钱包 — 私钥由 passkey 持有'}
            </dd>
            <dt>登录方式</dt><dd>{user.login_method}</dd>
            {user.role !== 'user' && <><dt>角色</dt><dd>{user.role}</dd></>}
          </dl>
        </div>
      )}

      {w && (
        <>
          <div className="grid two">
            <div className="panel">
              <h2>资金</h2>
              <dl className="kv">
                <dt>链上</dt><dd className="num">${w.on_chain_usd}</dd>
                <dt>在托管中</dt><dd className="num">${w.in_escrow_usd}</dd>
                <dt>合计</dt><dd className="num"><strong>${w.total_usd}</strong></dd>
                <dt>托管方</dt><dd>{w.custody === 'self' ? '自托管' : w.custody}</dd>
              </dl>
            </div>
            <div className="panel">
              <h2>合约</h2>
              <dl className="kv">
                <dt>托管合约</dt><dd className="mono">{w.escrow_contract.address}</dd>
                <dt>网络</dt><dd>{w.escrow_contract.network}</dd>
                <dt>支出合约</dt><dd className="mono">{w.spending_contract}</dd>
              </dl>
            </div>
          </div>

          <div className="panel" style={{ marginTop: 16 }}>
            <h2>持仓</h2>
            {w.assets.length === 0 && <p className="muted">这个账户还没有余额。</p>}
            {w.assets.map(a => (
              <dl className="kv" key={a.asset} style={{ marginBottom: 12 }}>
                <dt>{a.asset}</dt>
                <dd className="num">
                  {a.on_chain} 可用 · {a.in_escrow} 在托管 · ${a.usd_value}
                  <span className="muted"> · {a.networks.join(' / ')}</span>
                </dd>
              </dl>
            ))}
          </div>
        </>
      )}
    </>
  )
}
