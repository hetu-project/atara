/**
 * Errors coming from the wallet side.
 *
 * Tagged so callers know "this one has already been shown elsewhere" -- on the
 * transaction progress line, or in the toast at the top right -- otherwise the outer
 * error banner shows the same sentence a second time and it looks like two failures.
 *
 * Lives in api/ rather than hooks/: signature confirmation is initiated by api/client.ts,
 * which also needs to throw this, and the api layer must not depend on the hooks layer.
 */
export class WalletTxError extends Error {
  readonly walletTx = true
}
export const isWalletTxError = (e: unknown): e is WalletTxError =>
  e instanceof Error && (e as WalletTxError).walletTx === true

/** Wallet errors are often a wall of raw JSON-RPC text. Show the first sentence, do not paste the whole thing. */
export function readable(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/User rejected|denied transaction|User denied/i.test(raw)) {
    return 'You cancelled that transaction in your wallet'
  }
  if (/insufficient funds/i.test(raw)) {
    return 'Not enough native coin in this wallet to pay gas'
  }
  return raw.split('\n')[0]!.slice(0, 200)
}

/** What we say when a confirmation message signature is rejected. Kept separate from rejecting a transaction: nothing has been sent yet at this point. */
export function signatureDeclined(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/User rejected|denied|cancel/i.test(raw)) {
    return 'You declined the signature — nothing was sent'
  }
  return readable(e)
}
