/**
 * 钱包那一侧出的错。
 *
 * 打上标记，好让调用方知道「这条已经在别处显示过了」——交易进度那一行，
 * 或者右上角的 toast——不然同一句话会被外层的错误提示再显示一遍，
 * 看着像出了两次错。
 *
 * 放在 api/ 而不是 hooks/：确认签名是 api/client.ts 发起的，它也要能抛这个
 * 错，而 api 层不该反过来依赖 hooks 层。
 */
export class WalletTxError extends Error {
  readonly walletTx = true
}
export const isWalletTxError = (e: unknown): e is WalletTxError =>
  e instanceof Error && (e as WalletTxError).walletTx === true

/** 钱包报错常常是一大段 JSON-RPC 原文。取第一句给人看，别把整段糊上去。 */
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

/** 拒签确认消息时说的话。和拒掉一笔交易分开：这里还没有任何东西发出去。 */
export function signatureDeclined(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/User rejected|denied|cancel/i.test(raw)) {
    return 'You declined the signature — nothing was sent'
  }
  return readable(e)
}
