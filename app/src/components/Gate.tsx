import { useState } from 'react'
import * as ep from '../api/endpoints'

type Stage =
  | { k: 'menu' }
  | { k: 'busy'; kind: 'pk' | 'spin'; title: string; body: string }
  | { k: 'done'; title: string; body: string }
  | { k: 'code'; email: string }

/** 钱包入口。Installed 与否是演示态——真实实现要探测 window.ethereum。 */
const WALLETS: [string, string, string, string?][] = [
  ['mm', 'MetaMask', '#E2761B', 'Installed'],
  ['okx', 'OKX Wallet', '#000', 'Installed'],
  ['wc', 'WalletConnect', '#3B99FC'],
]

/**
 * 登录门。
 *
 * 「你的钱包就是你的账户」——所以这里没有密码，只有拿到一个地址的四条路：
 * 自建 passkey 钱包、连已有钱包、Google、邮箱。前两条落到 atara / ext 两种
 * wallet_kind，那决定额度是写进账户合约策略还是对支出合约 approve。
 *
 * 未登录不是白屏：大厅照常能看，动手那一下才弹这个门。
 */
export default function Gate({
  open, onClose, onDone,
}: { open: boolean; onClose: () => void; onDone: (addr: string) => void }) {
  const [stage, setStage] = useState<Stage>({ k: 'menu' })
  const [email, setEmail] = useState('')
  const [err, setErr] = useState('')

  if (!open) return null

  const short = (a: string) => (a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

  const finish = async (
    method: 'passkey' | 'wallet' | 'google' | 'email',
    opts: { address?: string; email?: string; okTitle: string; okBody: (a: string) => string },
  ) => {
    try {
      const r = await ep.connect({ method, address: opts.address, email: opts.email })
      setStage({ k: 'done', title: opts.okTitle, body: opts.okBody(short(r.address)) })
      // 让人看清「拿到的是哪个地址」再落座——立刻跳走等于没说
      setTimeout(() => { onDone(r.address); setStage({ k: 'menu' }) }, 1100)
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not connect')
      setStage({ k: 'menu' })
    }
  }

  const create = () => {
    setStage({ k: 'busy', kind: 'pk', title: 'Touch ID',
      body: 'Creating your wallet — the key is minted inside this device and never leaves it.' })
    setTimeout(() => void finish('passkey', {
      okTitle: 'Wallet created',
      okBody: a => `${a} · secured by your passkey. Back it up later under Settings › Wallet keys.`,
    }), 1500)
  }

  const wallet = (name: string) => {
    setStage({ k: 'busy', kind: 'spin', title: `Waiting for ${name}`,
      body: 'Approve the connection, then sign the one-line message — the signature proves the address is yours. Nothing is spent.' })
    /* demo：真实实现里地址由钱包回传，这里让后端按方法派生一个。
       wallet_kind 会是 ext——我们没有它的私钥，额度只能靠 approve。 */
    setTimeout(() => void finish('wallet', {
      address: '', okTitle: 'Connected',
      okBody: a => `${a} · signature verified — this address is now your account.`,
    }), 1600)
  }

  const google = () => {
    setStage({ k: 'busy', kind: 'spin', title: 'Waiting for Google',
      body: 'Pick an account — a wallet is created for you behind it, keys on this device.' })
    setTimeout(() => void finish('google', {
      email: 'demo@gmail.com', okTitle: 'Signed in with Google',
      okBody: a => `${a} · wallet created for you — add a passkey under Settings › Wallet keys.`,
    }), 1600)
  }

  const mailGo = (e: React.FormEvent) => {
    e.preventDefault()
    const v = email.trim()
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { setErr('That does not look like an email address.'); return }
    setErr('')
    setStage({ k: 'code', email: v })
  }

  return (
    <div id="gate" className="open novt" role="dialog" aria-modal="true" aria-labelledby="gatetitle">
      <div className="gatebox">
        <button className="gclose" aria-label="Close and keep browsing"
          onClick={() => { setStage({ k: 'menu' }); onClose() }}>✕</button>
        <span className="glogo" aria-hidden><i /></span>
        <h1 id="gatetitle">Connect to Atara</h1>
        <p className="gsub">Your wallet is your account.</p>

        {stage.k === 'menu' ? (
          <div id="gmethods">
            <div className="gmlist">
              <button className="gmrow" onClick={create}>
                <span className="gmi gmi-pk">✦</span>
                <span className="gmtxt"><b>Create a wallet</b></span>
                <span className="gmst on">Recommended</span>
              </button>
              {WALLETS.map(([k, name, bg, tag]) => (
                <button className="gmrow" key={k} onClick={() => wallet(name)}>
                  <span className="gmi" style={{ background: bg,
                    boxShadow: bg === '#000' ? '0 0 0 1px var(--line-strong) inset' : undefined }}>
                    {name[0]}
                  </span>
                  <span className="gmtxt"><b>{name}</b></span>
                  {tag ? <span className="gmst">{tag}</span> : null}
                </button>
              ))}
              <button className="gmrow" onClick={() => wallet('your wallet')}>
                <span className="gmi" style={{ background: 'var(--card)', boxShadow: '0 0 0 1px var(--line-strong) inset' }}>🗝</span>
                <span className="gmtxt"><b>Import an existing wallet</b></span>
              </button>
            </div>

            <div className="gdiv"><span>or</span></div>

            <button className="gmrow gsoc" onClick={google}>
              <span className="gmi" style={{ background: '#fff' }}><GoogleMark /></span>
              <span className="gmtxt"><b>Continue with Google</b></span>
            </button>

            <form className="gmail" onSubmit={mailGo}>
              <input type="email" autoComplete="email" spellCheck={false}
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="Continue with email" aria-label="Email" />
              <button className="btn btn-primary" type="submit" aria-label="Continue with email">→</button>
            </form>
          </div>
        ) : (
          <div id="gstage">
            {stage.k === 'busy' && (
              <div className="nasign">
                <span className={stage.kind === 'pk' ? 'gpkring' : 'gspin'}>{stage.kind === 'pk' ? '✦' : ''}</span>
                <b>{stage.title}</b><em>{stage.body}</em>
                <button className="btn btn-ghost btn-sm gback" onClick={() => setStage({ k: 'menu' })}>Back</button>
              </div>
            )}
            {stage.k === 'done' && (
              <div className="nasign">
                <span className="gok">✓</span><b>{stage.title}</b>
                <em><b className="gaddr num">{stage.body.split(' · ')[0]}</b>{stage.body.includes(' · ') ? ` · ${stage.body.split(' · ').slice(1).join(' · ')}` : ''}</em>
              </div>
            )}
            {stage.k === 'code' && (
              <CodeStep email={stage.email}
                onBack={() => setStage({ k: 'menu' })}
                onOk={() => void finish('email', {
                  email: stage.email, okTitle: 'Wallet created for you',
                  okBody: a => `${a} · the email is only for codes and notices — add a passkey to hold the key yourself.`,
                })} />
            )}
          </div>
        )}

        <p className="gateerr" role="alert">{err}</p>
      </div>
    </div>
  )
}

/** 六位码。demo 里任意六位都通过——这道门挡的是顺着落地页点进来的人。 */
function CodeStep({ email, onBack, onOk }: { email: string; onBack: () => void; onOk: () => void }) {
  const [v, setV] = useState('')
  return (
    <div className="nasign">
      <b>Check your inbox</b>
      <em>We sent a 6-digit code to <b>{email}</b> — demo build, any 6 digits work.</em>
      <input className="pwin" inputMode="numeric" maxLength={6} autoFocus
        placeholder="······" autoComplete="one-time-code" value={v}
        onChange={e => {
          const n = e.target.value.replace(/\D/g, '')
          setV(n)
          if (n.length >= 6) onOk()
        }} />
      <button className="btn btn-ghost btn-sm gback" onClick={onBack}>Back</button>
    </div>
  )
}

function GoogleMark() {
  return (
    <svg width="17" height="17" viewBox="0 0 48 48" aria-hidden>
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}
