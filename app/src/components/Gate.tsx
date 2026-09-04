import { useState } from 'react'
import * as ep from '../api/endpoints'

type Stage =
  | { k: 'menu' }
  | { k: 'busy'; title: string; body: string }
  | { k: 'done'; addr: string }
  | { k: 'paste' }

/** 浏览器里有没有注入钱包。没探测就写「Installed」是骗人。 */
interface Eip1193 { request(a: { method: string; params?: unknown[] }): Promise<unknown> }
const injected = (): Eip1193 | null => {
  const w = window as unknown as { ethereum?: Eip1193 }
  return w.ethereum ?? null
}

/**
 * 登录门。只有一条路：连 MetaMask。
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

  const connect = async () => {
    setErr('')
    const eth = injected()
    // 没装扩展就别转 spinner：直说，并给一条能走通的退路
    if (!eth) { setStage({ k: 'paste' }); return }
    setStage({ k: 'busy', title: 'Waiting for MetaMask',
      body: 'Approve the connection in your wallet. Nothing is spent — connecting only proves the address is yours.' })
    try {
      const accts = await eth.request({ method: 'eth_requestAccounts' }) as string[]
      const addr = accts?.[0]
      if (!addr) throw new Error('MetaMask returned no account')
      await land(addr)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not reach MetaMask')
      setStage({ k: 'menu' })
    }
  }

  const has = !!injected()

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
              <button className="gmrow" onClick={() => void connect()}>
                <span className="gmi" style={{ background: '#E2761B' }}>M</span>
                <span className="gmtxt"><b>MetaMask</b></span>
                <span className={'gmst' + (has ? ' on' : '')}>{has ? 'Detected' : 'Not detected'}</span>
              </button>
            </div>
            {!has && (
              <p className="rnote" style={{ marginTop: 12 }}>
                No wallet extension in this browser.{' '}
                <a className="lnk" href="https://metamask.io/download/" target="_blank" rel="noopener">
                  Install MetaMask
                </a>{' '}— or continue with an address for the demo.
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
