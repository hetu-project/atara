import type { TxStep } from '../hooks/useWalletTx'

/**
 * How far the wallet side has got.
 *
 * A wallet transaction needs a signature, then it waits for a block; without
 * saying so people assume it has hung. And when it fails, this line is the
 * only place the reason is shown: wallet errors are tagged WalletTxError so
 * the generic action banner stays quiet about them (see useAction) -- a card
 * that sends wallet transactions and does not render this line fails in
 * complete silence, which is exactly how "Deposit from wallet" looked broken
 * for external-wallet accounts.
 */
export default function TxLine({ step, explorer }: { step: TxStep; explorer: string }) {
  if (step.k === 'idle') return null
  if (step.k === 'error') {
    /* A block, not a recoloured .dnote. What these messages describe is almost never a typo in a field
       above -- it is a wallet that declined, a wrong network, an empty balance -- and a 12px orange line
       tucked under the button reads as field validation, which is how "nothing happened when I pressed
       it" happens. role=status so it is announced when it appears, rather than only being visible.
       aria-hidden on the mark: it is decoration, and "exclamation mark" read aloud tells nobody anything. */
    return (
      <p className="txerr" role="status">
        <span className="txerri" aria-hidden>!</span>
        <span>{step.msg}</span>
      </p>
    )
  }
  const hash = 'hash' in step ? step.hash : ''
  return (
    <p className="dnote">
      {step.k === 'wallet' && <>{step.msg} …</>}
      {step.k === 'mining' && <>{step.msg} — waiting for the transaction to confirm</>}
      {step.k === 'done' && <>Confirmed on chain</>}
      {hash && explorer ? (
        <> · <a className="lnk" href={`${explorer}/tx/${hash}`} target="_blank"
          rel="noopener">view transaction</a></>
      ) : null}
    </p>
  )
}
