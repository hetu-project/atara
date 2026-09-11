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
 * Atara 钱包 + 没有 passkey：先补一把。没有它的话，「你的钥匙你签」这句话在
 * 这条路上根本不成立——按钮不该假装能签。
 */
export interface ConfirmRow { k: string; v: React.ReactNode }

export default function ConfirmSheet({
  title, amount, unit, lead, rows, extra, note, walletKind, plain, busy, onConfirm, onClose,
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
  onConfirm: () => void
  onClose: () => void
}) {
  const { user } = usePrivy()
  const ext = walletKind === 'ext'
  const hasPk = (user?.linkedAccounts ?? []).some(a => a.type === 'passkey')

  const [icon, label] = plain
    ? [null, plain]
    : ext
    ? [<IWallet key="w" />, 'Sign in your wallet']
    : hasPk
      ? [<IPasskey key="p" />, 'Confirm with passkey']
      : [<IPasskey key="p" />, 'Add a passkey to approve']

  return (
    <div id="confirm" className="show" role="dialog" aria-modal="true" aria-label={title}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="paysheet">
        <div className="pshead">
          <button className="psx" aria-label="Close" onClick={onClose}>✕</button>
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
        <button className="btn btn-primary psok" disabled={busy} onClick={onConfirm}>
          {icon} {busy ? 'Working…' : label}
        </button>
      </div>
    </div>
  )
}
