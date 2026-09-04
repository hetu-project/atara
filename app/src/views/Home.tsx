import { useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { IAttach, IBuy, IMic, ISell, ISend } from '../components/icons'
import { go } from '../hooks/useRoute'

/**
 * 首页 = 一张空台面加一句问话。
 *
 * 与 console.html 的 #v-chat 同构：空态标题 → 动作行 → 输入行。
 * 动作不藏在 + 里：藏起来的代价是用户得先猜这里能做什么。
 */
export default function Home() {
  const [text, setText] = useState('')
  const [act, setAct] = useState<'buy' | 'sell' | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const ta = useRef<HTMLTextAreaElement>(null)

  const submit = async () => {
    const q = text.trim()
    if (!q || busy) return
    setBusy(true); setErr('')
    try {
      /* 先撮合后评估：对手方还没出现就跑评估，评的是谁？
         后端扫全池、按成绩排序，顺带把装不下这笔量的挡掉。 */
      const m = await ep.match({
        intent: act ?? (/\bsell\b|卖/i.test(q) ? 'sell' : 'buy'),
        amount: (q.match(/[\d,]+(\.\d+)?/)?.[0] ?? '0').replace(/,/g, ''),
        amount_kind: 'fiat',
        asset: 'USDT',
        fiat: /hkd/i.test(q) ? 'HKD' : 'CNY',
      })
      if (m.violation) { setErr(m.violation.message); return }
      if (!m.candidates?.length) { setErr('No live offers on that side right now'); return }
      go({ view: 'discover' })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="view on" id="v-chat">
      <div id="log">
        <div id="empty"><h3>What would you like to settle?</h3></div>
        {err ? <p className="roempty" style={{ textAlign: 'center' }}>{err}</p> : null}
      </div>

      <div id="say">
        <div id="actions" role="group" aria-label="Actions">
          <button className={'act' + (act === 'buy' ? ' on' : '')}
            onClick={() => setAct(act === 'buy' ? null : 'buy')}>
            <span className="acti"><IBuy /></span>Buy
          </button>
          <button className={'act' + (act === 'sell' ? ' on' : '')}
            onClick={() => setAct(act === 'sell' ? null : 'sell')}>
            <span className="acti"><ISell /></span>Sell
          </button>
        </div>
        <div className="sayrow">
          <textarea id="free" ref={ta} rows={1} aria-label="Describe a payment"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
            }}
            placeholder={'Describe a trade — try “Buy 5,000 USDT with CNY” or “Sell 2,000 USDT for HKD”'} />
          <div className="saytools">
            <button className="sayic" title="Attach" aria-label="Attach"><IAttach /></button>
            <button className="sayic" title="Voice" aria-label="Voice" aria-pressed={false}><IMic /></button>
            <button id="send" title="Compose (Enter)" aria-label="Compose"
              disabled={!text.trim() || busy} onClick={() => void submit()}><ISend /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
