import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

/**
 * Recovery phrase backup.
 *
 * Step one is the square warning card from the template (.msq): spell out what these twelve words mean.
 * Step two hands off to Privy's exportWallet -- it shows this embedded wallet's real mnemonic inside
 * an **iframe on a separate domain**, which our code cannot touch and should not.
 *
 * -- Why we do not draw those twelve cells ourselves --
 *
 * Printing a mnemonic in our own UI would require having it first. Privy's SDK simply does not
 * expose it (nothing like mnemonic / seedPhrase exists in the type definitions), and the
 * cross-origin iframe exists precisely so that the application can never read it.
 *
 * Nor can it be "derived back from the private key": BIP-39 is one-way --
 *   mnemonic --PBKDF2(HMAC-SHA512, 2048 rounds)--> seed --BIP-32--> private key --> address
 * That PBKDF2 step is designed to be irreversible. Deriving a mnemonic from a private key amounts
 * to asking for a hash to be inverted.
 *
 * So there are only two possibilities: show Privy's real window (what is chosen here), or generate
 * the wallet ourselves and carry the keys ourselves. The middle road -- drawing twelve cells and
 * filling them with twelve invented words -- is the worst of all: users will copy it onto paper and
 * treat it as control of their assets.
 */
export default function Backup({
  backedUp, onClose, onDone,
}: { backedUp: boolean; onClose: () => void; onDone: () => void }) {
  const { user, exportWallet } = usePrivy()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* Only embedded wallets issued by Privy itself can be exported. The keys of external wallets
     (MetaMask and friends) were never on this path, and Privy cannot export them either. */
  const w = user?.wallet
  const embedded = w?.walletClientType === 'privy' ? w.address : ''

  const reveal = async () => {
    setBusy(true); setErr('')
    try {
      // The promise resolves after the user closes Privy's window
      await exportWallet({ address: embedded })
      onDone()
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Could not open the export window')
    } finally { setBusy(false) }
  }

  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard msq">
        <header className="mhead">
          <h3>Recovery phrase</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <div className="sqi">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2.6 4.6 5.6v5.5c0 4.4 3 8.5 7.4 9.8 4.4-1.3 7.4-5.4 7.4-9.8V5.6Z" />
              <path d="M12 8.4v4" />
              <circle cx="12" cy="15.6" r=".9" fill="currentColor" stroke="none" />
            </svg>
          </div>

          {embedded ? (
            <>
              <p className="acnote">
                Twelve words that restore this wallet anywhere — with or without Atara.
                Anyone who reads them can spend your funds, so write them down offline and
                never type them into a website.
              </p>
              {/* Say up front that someone else's window is about to appear. Without that, the jump
                  reads as phishing -- and this is exactly the step that must not. */}
              <p className="acnote">
                They open in Privy’s own window, on a separate domain. Atara never sees
                them — the phrase does not pass through this console at any point.
              </p>
              {err ? <p className="acnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
              <div className="dfoot">
                <button className="btn btn-primary" disabled={busy} onClick={() => void reveal()}>
                  {busy ? 'Opening…' : backedUp ? 'View my phrase' : 'Show my phrase'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* Accounts with no embedded wallet: there is nothing to export, so say so plainly. */}
              <p className="acnote">
                This account has no phrase to show. Its address came from an external
                wallet or was derived from your login, so the key that controls it was
                never created here — and nothing in this console can reveal it.
              </p>
              <p className="acnote">
                An external wallet keeps its own recovery phrase; back it up there.
              </p>
              <div className="dfoot">
                <button className="btn btn-primary" onClick={onClose}>Got it</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
