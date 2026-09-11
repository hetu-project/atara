import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

/**
 * 备份恢复短语。
 *
 * 第一步是模板里那张方形告警卡（.msq）：说清楚这十二个词意味着什么。
 * 第二步交给 Privy 的 exportWallet —— 它在**独立域名的 iframe** 里显示这个
 * 内嵌钱包真正的助记词，我们的代码碰不到，也不该碰。
 *
 * ── 为什么不是我们自己画那个十二格 ──
 *
 * 要在自己的界面里印出助记词，就得先拿到它。而 Privy 的 SDK 根本不暴露
 * （类型定义里没有 mnemonic / seedPhrase 这类东西），跨域 iframe 正是为了
 * 让应用永远读不到。
 *
 * 也不能「从私钥反推」：BIP-39 是单向的——
 *   助记词 --PBKDF2(HMAC-SHA512, 2048 轮)--> 种子 --BIP-32--> 私钥 --> 地址
 * PBKDF2 那一步就是为了不可逆而设计的。拿私钥反推助记词，等于要求把哈希
 * 反算回原文。
 *
 * 所以只有两种可能：要么显示 Privy 的真窗口（这里选的），要么自己生成钱包、
 * 自己扛密钥。中间那条「画一个十二格、填十二个编出来的词」是最坏的一种：
 * 用户会把它抄在纸上当成资产的控制权。
 */
export default function Backup({
  backedUp, onClose, onDone,
}: { backedUp: boolean; onClose: () => void; onDone: () => void }) {
  const { user, exportWallet } = usePrivy()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  /* 只有 Privy 自己发的内嵌钱包导得出来。外部钱包（MetaMask 之类）的密钥
     从来不在这条链路上，Privy 也导不了它。 */
  const w = user?.wallet
  const embedded = w?.walletClientType === 'privy' ? w.address : ''

  const reveal = async () => {
    setBusy(true); setErr('')
    try {
      // promise 在用户关掉 Privy 那个窗口之后 resolve
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
              {/* 先说会跳出别人家的窗口。不说的话那一跳会被当成钓鱼——
                  而这恰恰是最不该被当成钓鱼的一步。 */}
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
              {/* 没有内嵌钱包的账户：没有可导出的东西，照实说。 */}
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
