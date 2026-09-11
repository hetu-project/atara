import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

/**
 * 备份钱包密钥。
 *
 * 「非托管」这句话的唯一凭据就是这个：能把密钥带走，离开 Atara 这笔钱还是你的。
 * 所以它不是一句提示，是一条要看清、要确认抄过的流程。
 *
 * ── 这里有两种账户，导出的东西完全不同，绝不能混为一谈 ──
 *
 * 一、Privy 内嵌钱包（HTTPS 下用 Google / Twitter 登录会拿到）
 *     密钥是真的，由 Privy 持有分片。导出走 Privy 自己的安全弹窗
 *     （exportWallet），密钥从不经过我们的代码，也不该经过。
 *
 * 二、后端按邮箱派生的地址（HTTP 下 Privy 不发内嵌钱包时的退路）
 *     那个地址是 sha256(邮箱) 出来的，**根本没有对应的私钥**——谁也签不了
 *     它的交易。这种账户没有可导出的东西，给一串助记词就是拿假话骗人抄，
 *     而抄下来的人会以为自己拿到了资产的控制权。
 *
 * 参照那边是写死的十二个词，自己标着「Demo build — these words are not a real
 * wallet」。那句标注是它唯一诚实的地方，删掉就成了骗局。我们这边有真的可导，
 * 就导真的；没有的话照实说没有，而不是补一份看起来很像的假词。
 */
export default function Backup({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { user, exportWallet } = usePrivy()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* 只有 Privy 自己发的内嵌钱包才导得出来。外部钱包（MetaMask 之类）的
     密钥从来不在这条链路上，Privy 也导不了它。 */
  const w = user?.wallet
  const embedded = w?.walletClientType === 'privy' ? w.address : ''

  const run = async () => {
    setBusy(true); setErr('')
    try {
      // Privy 在自己的 iframe 里显示密钥，promise 在用户关掉那个窗口后 resolve
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
              <path d="M12 8.4v4" /><circle cx="12" cy="15.6" r=".9" fill="currentColor" stroke="none" />
            </svg>
          </div>

          {embedded ? (
            <>
              <p className="acnote">
                The key that restores this wallet anywhere — with or without Atara.
                Anyone who reads it can spend your funds, so keep it offline and never
                type it into a website.
              </p>
              {/* 说清楚下一步会发生什么。不说的话，跳出一个别人家的窗口
                  会被当成钓鱼——而这恰恰是最不该被当成钓鱼的一步。 */}
              <p className="acnote">
                It opens in Privy’s own window. We never see it — the key does not pass
                through Atara at any point.
              </p>
              {err ? <p className="acnote" style={{ color: 'var(--warn)' }}>{err}</p> : null}
              <div className="dfoot">
                <button className="btn btn-primary" disabled={busy} onClick={() => void run()}>
                  {busy ? 'Opening…' : 'Reveal my key'}
                </button>
              </div>
            </>
          ) : (
            <>
              {/* 没有密钥可导的那种账户。照实说，不给假词。 */}
              <p className="acnote">
                This account has no key to export. It was opened without an embedded
                wallet, so the address was derived from your login — nothing here can
                sign for it, and there is no phrase that would restore it.
              </p>
              <p className="acnote">
                Sign in over HTTPS with Google or Twitter to get a wallet whose key is
                really yours, or connect an external wallet you already control.
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
