import { useMemo, useState } from 'react'
import * as ep from '../api/endpoints'
import ActionBar, { type Act, type ActKind } from '../components/ActionBar'
import { liveParse } from '../components/actlang'
import { IAttach, IBuy, IMic, ISell, ISend } from '../components/icons'
import Thinking from '../components/Thinking'
import { useApi } from '../hooks/useApi'
import { useAssessment } from '../hooks/useAssessment'
import { go } from '../hooks/useRoute'

/**
 * 首页 = 一张空台面加一句问话。
 *
 * 打字的时候句子就长出来：说到的槽实心，没说到的按合理猜测填上并标虚线。
 * 与「把示例文本塞进输入框再让人回车」的差别是——用户不必先读懂一句
 * 自己没写过的话，再猜哪几个词能改；胶囊自己说明哪里能改。
 */
export default function Home({ identity }: { identity: string; onNeedSignIn?: () => void }) {
  const [text, setText] = useState('')
  const [act, setAct] = useState<Act | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const { run } = useAssessment()
  const { data: cdata } = useApi(() => ep.contacts(identity), [identity])
  const contacts = cdata?.contacts ?? []
  const peers = useMemo(() => contacts.map(c => ({ name: c.name })), [contacts])

  const blank = (k: ActKind): Act => ({
    k, amt: k === 'buy' ? 5000 : 3000, coin: 'USDT', fiat: 'CNY', peer: '', conds: [],
  })

  /** 点胶囊入口：手动开的面板一律实心，打字不去抢。 */
  const toggle = (k: ActKind) => {
    setErr('')
    setAct(a => (a && a.k === k && !a.auto ? null : { ...blank(k), auto: false }))
  }

  /** 边打字边填句。清空输入就把自动开出来的句子收起。 */
  const onType = (q: string) => {
    setText(q)
    setErr('')
    if (act && !act.auto) return               // 用户手动开的面板，打字不去抢
    if (!q.trim()) { setAct(a => (a?.auto ? null : a)); return }
    const r = liveParse(q, peers) as null | {
      k: string; amt?: number; coin?: string; fiat?: string; peer?: string
      src: Record<string, 1>; amtCoin?: boolean
    }
    if (!r || (r.k !== 'buy' && r.k !== 'sell')) return
    setAct(prev => {
      const base = prev && prev.k === r.k ? prev : blank(r.k as ActKind)
      return {
        ...base,
        auto: true,
        parseSrc: r.src,
        amt: r.amt ?? base.amt,
        amtKind: r.amtCoin ? 'coin' : null,
        coin: r.coin ?? base.coin,
        fiat: r.fiat ?? base.fiat,
      }
    })
  }

  const submit = async () => {
    if (busy) return
    const a = act
    if (!a) { setErr('Say what you want to trade, or pick Buy / Sell'); return }
    setBusy(true); setErr('')
    try {
      /* 先撮合后评估：对手方还没出现就跑评估，评的是谁？
         后端扫全池、按成绩排序，顺带把装不下这笔量的挡掉。 */
      const m = await ep.match({
        intent: a.k, amount: String(a.amt), amount_kind: 'coin',
        asset: a.coin, fiat: a.fiat,
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
        {/* 评估一开始就撤掉空态标题：界面在提交那一刻就切进对话态，
            中间那十几秒不该还挂着一句「你想结算什么」。 */}
        {run ? <Thinking /> : <div id="empty"><h3>What would you like to settle?</h3></div>}
        {err ? <p className="roempty" style={{ textAlign: 'center' }}>{err}</p> : null}
      </div>

      <div id="say" className={act ? 'actopen' : ''}>
        <div id="actions" role="group" aria-label="Actions">
          <button className={'act' + (act?.k === 'buy' ? ' on' : '')} onClick={() => toggle('buy')}>
            <span className="acti"><IBuy /></span>Buy
          </button>
          <button className={'act' + (act?.k === 'sell' ? ' on' : '')} onClick={() => toggle('sell')}>
            <span className="acti"><ISell /></span>Sell
          </button>
        </div>
        <div className="sayrow">
          {act && (
            <ActionBar act={act} onChange={setAct} onClose={() => setAct(null)}
              contacts={contacts} />
          )}
          <textarea id="free" rows={1} aria-label="Describe a payment"
            value={text}
            onChange={e => onType(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void submit() }
            }}
            placeholder={'Describe a trade — try “Buy 5,000 USDT with CNY” or “Sell 2,000 USDT for HKD”'} />
          <div className="saytools">
            <button className="sayic" title="Attach" aria-label="Attach"><IAttach /></button>
            <button className="sayic" title="Voice" aria-label="Voice" aria-pressed={false}><IMic /></button>
            <button id="send" title="Compose (Enter)" aria-label="Compose"
              disabled={busy || (!act && !text.trim())} onClick={() => void submit()}><ISend /></button>
          </div>
        </div>
      </div>
    </div>
  )
}
