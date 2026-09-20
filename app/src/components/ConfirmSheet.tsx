import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { IPasskey, IWallet } from './icons'

/**
 * 动钱之前的那一下确认。
 *
 * 参照的 #confirm / .paysheet：标题、一个大数、一句说明、可选的额度卡，
 * 最后是那颗按钮。挂单锁币和吃单下单共用它——两件事都是「这一下之后钱就动了」，
 * 用两套界面只会让人以为它们性质不同。
 *
 * ── 按钮为什么有三种 ──
 *
 * 外部钱包（MetaMask 之类）：我们没有它的钥匙，点一下之后弹出来的是钱包自己
 * 的窗口，所以这里只说「去你的钱包里签」。
 *
 * Atara 钱包 + 有 passkey：passkey 就是签名的那把钥匙，说「用 passkey 确认」。
 *
 * Atara 钱包 + 没有 passkey：先补一把，仍在这张确认里。console.html 的
 * cok 是这一下先注册、装好了再签同一笔，不把人踢去 Settings。A demo
 * seat has no Privy session and cannot mint a key — it must not be told to.
 */
export interface ConfirmRow { k: string; v: React.ReactNode }

export default function ConfirmSheet({
  title, amount, unit, lead, rows, extra, note, walletKind, plain, busy, blocked, quiet, okLabel,
  onConfirm, onClose,
}: {
  title: string
  /** 大数。挂单是币量，吃单是要付的法币。 */
  amount?: string
  unit?: string
  lead: React.ReactNode
  rows?: ConfirmRow[]
  /** 入金方式那一排之类，挂在说明和额度卡之间。 */
  extra?: React.ReactNode
  /** ⚠ 那一句：这一下到底会发生什么。 */
  note?: { why: string; how: string }
  walletKind: string
  /**
   * 这一下不动钱，只是一句承诺——那就用普通按钮，别摆 passkey。
   *
   * 买方接单就是这种：对方的币早就锁在合约里了，我这边什么都没出，之后才
   * 去银行转账。摆一个「用 passkey 签」会让人以为这一下就把钱划走了。
   * 真正动钱的那几步（挂单锁币、卖方入金）才走签名。
   */
  plain?: string
  busy?: boolean
  /** 这条路还走不通。按钮置灰，而不是让它点下去走到别的地方。 */
  blocked?: boolean
  /**
   * The button no longer commits to anything — it just dismisses. Secondary
   * styling, so it does not read as one more "yes" after the money has moved.
   */
  quiet?: boolean
  /**
   * One word for the signing button, whichever wallet is behind it. The icon
   * still says how — wallet or passkey — and what is required does not change
   * with the wording. Default wording is per variant ("Sign in your wallet",
   * "Confirm with passkey", "Add a passkey to approve").
   */
  okLabel?: string
  onConfirm: () => void
  onClose: () => void
}) {
  const { user, authenticated, linkPasskey } = usePrivy()
  const ext = walletKind === 'ext'
  const hasPk = (user?.linkedAccounts ?? []).some(a => a.type === 'passkey')
  const [linking, setLinking] = useState(false)
  const [linkErr, setLinkErr] = useState('')

  /* Signed-in Atara wallet, no key yet. The first click registers one
     here; the second signs. Demo identities skip this — they have no
     Privy session, and linkPasskey throws instead of minting. */
  const needsPk = !plain && !ext && authenticated && !hasPk

  useEffect(() => {
    if (hasPk) setLinking(false)
  }, [hasPk])

  const [icon, label] = plain
    ? [null, plain]
    : ext
    ? [<IWallet key="w" />, okLabel ?? 'Sign in your wallet']
    : needsPk
    ? [<IPasskey key="p" />, 'Add a passkey to approve']
    : hasPk
    ? [<IPasskey key="p" />, okLabel ?? 'Confirm with passkey']
    : [null, okLabel ?? 'Confirm']

  const wait = linking
    ? 'Creating your passkey…'
    : busy
      ? (plain ? 'Working…' : ext ? 'Waiting for your wallet…' : 'Waiting for Touch ID…')
      : label

  const click = () => {
    if (busy || blocked || linking) return
    if (!needsPk) {
      onConfirm()
      return
    }
    /* First click: mint the key in this sheet. Do not settle the order. */
    setLinkErr('')
    setLinking(true)
    try {
      const r = linkPasskey() as unknown as Promise<unknown> | void
      if (r && typeof (r as Promise<unknown>).then === 'function') {
        void (r as Promise<unknown>).then(() => {
          setLinking(false)
        }).catch((e: unknown) => {
          setLinking(false)
          setLinkErr(e instanceof Error ? e.message : 'Could not add a passkey')
        })
      } else {
        setLinking(false)
      }
    } catch (e) {
      setLinking(false)
      setLinkErr(e instanceof Error ? e.message : 'Could not add a passkey')
    }
  }

  return (
    <div id="confirm" className="show" role="dialog" aria-modal="true" aria-label={title}
      onClick={e => {
        if (e.target === e.currentTarget && !linking && !busy) onClose()
      }}>
      <div className="paysheet">
        <div className="pshead">
          <button className="psx" aria-label="Close" onClick={onClose} disabled={linking || busy}>✕</button>
          <span id="pstitle">{title}</span>
        </div>
        {amount && (
          <div className="psamt">
            <b className="num">{amount}</b>{unit ? <i>{unit}</i> : null}
          </div>
        )}
        <div className="psfor">{lead}</div>
        {extra}
        {rows && rows.length > 0 && (
          <div className="psrows">
            {rows.map(r => (
              <div className="ccbrow" key={r.k}>
                <span className="ccbk">{r.k}</span><b>{r.v}</b>
              </div>
            ))}
          </div>
        )}
        {note && (
          <div className="psrows">
            {/* 先说这一下会发生什么，再说它怎么发生的。顺序反过来的话，
                最该看见的那句（钱要进合约了）被实现细节挡在后面。 */}
            <span className="pslab" style={{ color: 'var(--warn)' }}>⚠ {note.why}</span>
            <span className="psfund">{note.how}</span>
          </div>
        )}
        {linkErr ? (
          <div className="psrows">
            <span className="pslab" style={{ color: 'var(--warn)' }}>{linkErr}</span>
          </div>
        ) : null}
        <button className={'btn psok ' + (quiet ? 'btn-secondary quiet' : 'btn-primary')}
          disabled={busy || blocked || linking} onClick={click}>
          {(linking || (busy && !plain)) ? <i className="pkpulse" /> : icon}{' '}
          {wait}
        </button>
      </div>
    </div>
  )
}
