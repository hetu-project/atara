import { useEffect, useState } from 'react'
import * as ep from '../api/endpoints'
import { WALLETS, discover, resolve, requestAddress, type Eip1193, type WalletSpec } from './wallets'

type Stage =
  | { k: 'menu' }
  | { k: 'busy'; title: string; body: string }
  | { k: 'done'; addr: string }
  | { k: 'paste' }
  | { k: 'wc' }

/** WalletConnect 的 project ID，构建时注入：VITE_WC_PROJECT_ID=… npm run build */
const WC_ID = import.meta.env.VITE_WC_PROJECT_ID ?? ''

/**
 * 登录门。四个钱包 + 一条粘地址的退路。
 *
 * 「你的钱包就是你的账户」——所以这里没有密码，也没有注册。
 * 地址必须由钱包给出：我们没有它的私钥，wallet_kind 因此是 ext，
 * 额度走对支出合约的 approve，而不是写进账户合约策略。
 *
 * 未登录不是白屏：大厅照常能看，动手那一下才弹这个门。
 */
export default function Gate({
  open, onClose, onDone,
}: { open: boolean; onClose: () => void; onDone: (addr: string) => void }) {
  const [stage, setStage] = useState<Stage>({ k: 'menu' })
  const [err, setErr] = useState('')
  const [announced, setAnnounced] = useState<Parameters<Parameters<typeof discover>[0]>[0]>([])

  /* 每次打开都重新探询一次：用户可能刚装完扩展又回到这个页面。 */
  useEffect(() => {
    if (!open) return
    return discover(setAnnounced)
  }, [open])

  if (!open) return null

  const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

  const land = async (address: string) => {
    try {
      const r = await ep.connect({ method: 'wallet', address })
      setStage({ k: 'done', addr: short(r.address) })
      // 让人看清拿到的是哪个地址再落座——立刻跳走等于没说
      setTimeout(() => { onDone(r.address); setStage({ k: 'menu' }) }, 1100)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not connect')
      setStage({ k: 'menu' })
    }
  }

  const connect = async (spec: WalletSpec, provider: Eip1193) => {
    setErr('')
    setStage({
      k: 'busy',
      title: `Waiting for ${spec.label}`,
      body: 'Approve the connection in your wallet. Nothing is spent — connecting only proves the address is yours.',
    })
    try {
      await land(await requestAddress(provider))
    } catch (e) {
      setErr(e instanceof Error ? e.message : `Could not reach ${spec.label}`)
      setStage({ k: 'menu' })
    }
  }

  const rows = WALLETS.map(spec => ({ spec, provider: resolve(spec, announced) }))
  const none = rows.every(r => !r.provider)

  return (
    <div id="gate" className="open novt" role="dialog" aria-modal="true" aria-labelledby="gatetitle">
      <div className="gatebox">
        <button className="gclose" aria-label="Close and keep browsing"
          onClick={() => { setStage({ k: 'menu' }); setErr(''); onClose() }}>✕</button>
        <span className="glogo" aria-hidden><i /></span>
        <h1 id="gatetitle">Connect to Atara</h1>
        <p className="gsub">Your wallet is your account.</p>

        {stage.k === 'menu' && (
          <div id="gmethods">
            <div className="gmlist">
              {rows.map(({ spec, provider }) => (
                <button key={spec.key} className="gmrow"
                  onClick={() => {
                    /* 没装就别转 spinner：直接送去安装页，比一个转不出结果的圈诚实 */
                    if (!provider) { window.open(spec.install, '_blank', 'noopener'); return }
                    void connect(spec, provider)
                  }}>
                  <span className="gmi" style={{
                    background: spec.bg,
                    boxShadow: spec.bg === '#000000' ? '0 0 0 1px var(--line-strong) inset' : undefined,
                  }}>{spec.ch}</span>
                  <span className="gmtxt"><b>{spec.label}</b></span>
                  <span className={'gmst' + (provider ? ' on' : '')}>
                    {provider ? 'Detected' : 'Install'}
                  </span>
                </button>
              ))}

              <button className="gmrow" onClick={() => setStage({ k: 'wc' })}>
                <span className="gmi" style={{ background: '#3B99FC' }}>W</span>
                <span className="gmtxt"><b>WalletConnect</b></span>
                <span className={'gmst' + (WC_ID ? ' on' : '')}>
                  {WC_ID ? 'Scan' : 'Needs setup'}
                </span>
              </button>

              <button className="gmrow" onClick={() => setStage({ k: 'paste' })}>
                <span className="gmi" style={{
                  background: 'var(--card)', boxShadow: '0 0 0 1px var(--line-strong) inset',
                }}>🗝</span>
                <span className="gmtxt"><b>Continue with an address</b></span>
              </button>
            </div>

            {none && (
              <p className="rnote" style={{ marginTop: 12 }}>
                No wallet extension detected in this browser — the rows above link to their
                install pages. Or continue with an address for the demo.
              </p>
            )}
          </div>
        )}

        {stage.k === 'busy' && (
          <div id="gstage"><div className="nasign">
            <span className="gspin" /><b>{stage.title}</b><em>{stage.body}</em>
            <button className="btn btn-ghost btn-sm gback" onClick={() => setStage({ k: 'menu' })}>Back</button>
          </div></div>
        )}

        {stage.k === 'done' && (
          <div id="gstage"><div className="nasign">
            <span className="gok">✓</span><b>Connected</b>
            <em><b className="gaddr num">{stage.addr}</b> · this address is now your account.</em>
          </div></div>
        )}

        {stage.k === 'wc' && (
          <div id="gstage"><div className="nasign">
            <b>WalletConnect is not configured</b>
            <em>
              WalletConnect v2 needs a project ID from its cloud dashboard — without one the
              relay refuses the session, so there is nothing to show a QR code for. Set{' '}
              <b className="num">VITE_WC_PROJECT_ID</b> at build time to turn this on.
            </em>
            <button className="btn btn-ghost btn-sm gback" onClick={() => setStage({ k: 'menu' })}>Back</button>
          </div></div>
        )}

        {stage.k === 'paste' && (
          <div id="gstage"><PasteStep onBack={() => setStage({ k: 'menu' })} onOk={a => void land(a)} /></div>
        )}

        <p className="gateerr" role="alert">{err}</p>
      </div>
    </div>
  )
}

/**
 * 没装钱包时的退路：粘一个地址。
 *
 * 它只证明「你说这个地址是你的」，不证明你持有私钥——真实实现里这里要让
 * 钱包签一条消息再验签。所以这样连进来的账户能看，动钱那一步仍然过不了
 * 签名档：那一步的令牌后端会验等级。
 */
function PasteStep({ onBack, onOk }: { onBack: () => void; onOk: (a: string) => void }) {
  const [v, setV] = useState('')
  const ok = /^0x[0-9a-fA-F]{40}$/.test(v.trim())
  return (
    <div className="nasign">
      <b>Continue with an address</b>
      <em>Demo only — pasting an address does not prove you hold its key, so it cannot move funds.</em>
      <input className="pwin" autoFocus spellCheck={false} placeholder="0x…"
        value={v} onChange={e => setV(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter' && ok) onOk(v.trim()) }} />
      <button className="btn btn-primary" disabled={!ok} onClick={() => onOk(v.trim())}>
        Use this address
      </button>
      <button className="btn btn-ghost btn-sm gback" onClick={onBack}>Back</button>
    </div>
  )
}
