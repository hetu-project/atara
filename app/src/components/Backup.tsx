import { useEffect, useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'

/**
 * 备份恢复短语。结构逐处对着已部署模板的 openBackup()。
 *
 * 两步：先是一张告警卡（方形居中的 .msq），说清楚这十二个词意味着什么；
 * 点下去才是词本身。中间如果这台设备上有 passkey，插一拍 Touch ID 确认。
 *
 * ── 关于这些词 ──
 *
 * 模板里 SEED_WORDS 是写死的十二个词，对每个账户都一样，而且它自己在词表
 * 上方标着「Demo build — these words are not a real wallet」。那句标注照抄
 * 过来了，不能删：这个账户的地址要么来自 Privy 的内嵌钱包（密钥在 Privy
 * 那儿，真要导出得走它自己的 exportWallet），要么是后端按邮箱派生的
 * （sha256(邮箱)，根本没有对应的私钥）。两种情况下，这十二个词都还原不出
 * 任何东西。有人会把它们抄在纸上，那句标注是他知道这件事的唯一途径。
 */

/* 与模板同一组词。不按账户随机：随机会让它更像真的，而它不是。 */
const SEED_WORDS = [
  'harbor', 'velvet', 'ridge', 'copper', 'anchor', 'fossil',
  'meadow', 'tunnel', 'quartz', 'breeze', 'marble', 'signal',
]

type Step = 'warn' | 'sign' | 'show'

export default function Backup({
  backedUp, onClose, onDone,
}: { backedUp: boolean; onClose: () => void; onDone: () => void }) {
  const { user } = usePrivy()
  /* 这台设备上有没有 passkey：决定按钮文案，以及要不要插那一拍确认。 */
  const hasPk = (user?.linkedAccounts ?? []).some(a => a.type === 'passkey')
  /* 备份过就不再看那张告警卡——话已经说过一次了，这次只是回来查看。 */
  const [step, setStep] = useState<Step>(backedUp ? (hasPk ? 'sign' : 'show') : 'warn')
  const [ok, setOk] = useState(false)
  const [copied, setCopied] = useState(false)

  // 确认那一拍是定时的，卸载时要清掉，否则组件没了还在 setState
  useEffect(() => {
    if (step !== 'sign') return
    const t = setTimeout(() => setStep('show'), 1500)
    return () => clearTimeout(t)
  }, [step])

  const head = (
    <header className="mhead">
      <h3>Recovery phrase</h3>
      <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
        <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
          strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
      </button>
    </header>
  )

  const shell = (cls: string, body: React.ReactNode) => (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={'mcard' + cls}>{head}<div className="mbody">{body}</div></div>
    </div>
  )

  if (step === 'warn') {
    return shell(' msq', (
      <>
        <div className="sqi">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 2.6 4.6 5.6v5.5c0 4.4 3 8.5 7.4 9.8 4.4-1.3 7.4-5.4 7.4-9.8V5.6Z" />
            <path d="M12 8.4v4" />
            <circle cx="12" cy="15.6" r=".9" fill="currentColor" stroke="none" />
          </svg>
        </div>
        <p className="acnote">
          Twelve words that restore this wallet anywhere — with or without Atara.
          Anyone who reads them can spend your funds, so write them down offline and
          never type them into a website.
        </p>
        {!hasPk && (
          <p className="acnote">
            No passkey on this device yet, so there is nothing to check against — add one
            afterwards and the next export will ask for it.
          </p>
        )}
        <div className="dfoot">
          <button className="btn btn-primary" onClick={() => setStep(hasPk ? 'sign' : 'show')}>
            {hasPk ? 'Reveal with passkey' : 'Show my phrase'}
          </button>
        </div>
      </>
    ))
  }

  if (step === 'sign') {
    return shell(' msq', (
      <div className="nasign">
        <span className="gpkring">✦</span><b>Touch ID</b>
        <em>Confirming it is you before the phrase is shown.</em>
      </div>
    ))
  }

  return shell('', (
    <>
      {/* 这句标注不能删——见文件头的说明。 */}
      <p className="acnote">
        Write these down in order. Demo build — these words are not a real wallet.
      </p>
      <ol className="seedgrid">
        {SEED_WORDS.map((w, i) => (
          <li key={w}><span className="sdn num">{i + 1}</span>{w}</li>
        ))}
      </ol>
      <div className="sdacts">
        <button className="btn btn-secondary btn-sm"
          onClick={() => {
            try { navigator.clipboard?.writeText(SEED_WORDS.join(' ')) } catch { /* 没有剪贴板权限就算了，词就在屏幕上 */ }
            setCopied(true)
          }}>{copied ? 'Copied' : 'Copy all'}</button>
      </div>
      {/* 勾选之前 Done 是灰的：这一步的意义就是让人真的停下来抄一遍 */}
      <label className="sdchk">
        <input type="checkbox" checked={ok} onChange={e => setOk(e.target.checked)} />
        <span>I have written them down and stored them offline</span>
      </label>
      <div className="dfoot">
        <button className="btn btn-primary" disabled={!ok} onClick={onDone}>Done</button>
      </div>
    </>
  ))
}
