import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import { IPasskey, IWallet } from './icons'

/**
 * The confirmation just before money moves.
 *
 * The reference's #confirm / .paysheet: a title, one big number, a line of explanation, an optional
 * allowance card, and finally that button. Locking funds for a listing and taking an order share it --
 * both are "after this, money moves", and two separate UIs would only suggest they are different in kind.
 *
 * -- Why the button has three forms --
 *
 * External wallet (MetaMask and friends): we do not hold its keys, and what pops up after the click
 * is the wallet's own window, so this only says "go sign in your wallet".
 *
 * Atara wallet with a passkey: the passkey is the signing key, so it says "confirm with passkey".
 *
 * Atara wallet without a passkey: mint one first, still inside this confirmation. console.html's
 * cok registers first and then signs the same transaction once it is set up, rather than kicking the
 * person out to Settings. A demo
 * seat has no Privy session and cannot mint a key — it must not be told to.
 */
export interface ConfirmRow { k: string; v: React.ReactNode }

export default function ConfirmSheet({
  title, amount, unit, unitPos = 'post', lead, rows, extra, note, walletKind, plain, busy, blocked, quiet, okLabel,
  onConfirm, onClose,
}: {
  title: string
  /** The big number. For a listing it is the coin amount, for taking an order it is the fiat to be paid. */
  amount?: string
  unit?: string
  /** Which side the unit sits on.
   *
   *  'post' is a quantity of something — `33 USDT`.
   *  'pre'  is a currency symbol — `¥779,589.65`.
   *
   *  It is not only word order. The unit renders muted and a size down from
   *  the number, so a fiat symbol baked into `amount` instead comes out in
   *  the same weight as the figure, and a currency code appended on top of a
   *  symbol already in the string gives `¥779589.65CNY`. The margin on the
   *  unit sits on its right, which is the gap a prefix needs. */
  unitPos?: 'pre' | 'post'
  lead: React.ReactNode
  rows?: ConfirmRow[]
  /** The deposit-method row and similar, slotted between the explanation and the allowance card. */
  extra?: React.ReactNode
  /** The warning line: what is actually about to happen. */
  note?: { why: string; how: string }
  walletKind: string
  /**
   * This step does not move money, it is only a commitment -- so use an ordinary button, do not put
   * a passkey there.
   *
   * A buyer accepting an order is this case: the counterparty's coins were locked in the contract
   * long ago, nothing leaves my side, and the bank transfer comes later. Showing "sign with passkey"
   * suggests this click moves the money. Only the steps that really move money (locking funds for a
   * listing, a seller's deposit) go through signing.
   */
  plain?: string
  busy?: boolean
  /** This path is not available. Grey the button out rather than letting it be clicked through to somewhere else. */
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
            {unit && unitPos === 'pre' ? <i>{unit}</i> : null}
            <b className="num">{amount}</b>
            {unit && unitPos === 'post' ? <i>{unit}</i> : null}
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
            {/* Say what this does before saying how it does it. The other order buries the sentence
                that matters most (money is about to enter the contract) behind implementation detail. */}
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
