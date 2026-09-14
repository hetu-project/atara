import { useEffect, useMemo, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import ActionBar, { type Act, type ActKind } from '../components/ActionBar'
import { liveParse } from '../components/actlang'
import { IBuy, IMic, ISell, ISend } from '../components/icons'
import Thinking from '../components/Thinking'
import VoiceBar from '../components/VoiceBar'
import { useApi } from '../hooks/useApi'
import { useAssessment } from '../hooks/useAssessment'
import { useKycGate } from '../hooks/useKycGate'
import { go } from '../hooks/useRoute'
import { IFlytekStreamer, VoiceError, type VoiceFailure } from '../services/iflytek'
import type { MatchCandidate } from '../api/types'

/** 语音起不来的几种原因，各自能做的事不同——所以不共用一句话。 */
const VOICE_MSG: Record<VoiceFailure, string> = {
  insecure: 'Voice needs a secure page — open this over HTTPS or on localhost',
  unsupported: 'This browser cannot record audio — try Chrome',
  denied: 'Microphone access was refused — allow it in the address bar and try again',
  'no-token': 'Voice is not switched on for this server',
  service: 'The voice service refused the request',
  network: 'Lost connection to the voice service',
}

/**
 * 首页 = 一张空台面加一句问话。
 *
 * 打字的时候句子就长出来：说到的槽实心，没说到的按合理猜测填上并标虚线。
 * 与「把示例文本塞进输入框再让人回车」的差别是——用户不必先读懂一句
 * 自己没写过的话，再猜哪几个词能改；胶囊自己说明哪里能改。
 */
const a0 = (a: { coin: string } | null) => a?.coin ?? 'USDT'

/** 把说的接在打的后面。已经有空白结尾就不再补一个，不然会越接越松。 */
const join = (had: string, said: string) => {
  if (!had) return said
  if (!said) return had
  return /\s$/.test(had) ? had + said : had + ' ' + said
}

export default function Home({ identity }: { identity: string; onNeedSignIn?: () => void }) {
  const [text, setText] = useState('')
  const [act, setAct] = useState<Act | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cands, setCands] = useState<MatchCandidate[]>([])
  const [chosen, setChosen] = useState<MatchCandidate | null>(null)
  /* 语音：mic 是「正在听」，同时驱动按钮的 .on 和 aria-pressed。
     streamer 放 ref 不放 state——它不参与渲染，进 state 只会让每一帧
     音频回调都触发一次重绘。 */
  const [mic, setMic] = useState(false)
  const voice = useRef<IFlytekStreamer | null>(null)
  /* before：开录那一刻的输入框内容，× 要退回到这里。
     dropped：这次已经被取消了，之后再回来的识别结果一律丢掉。 */
  const before = useRef('')
  const dropped = useRef(false)

  const { run, start } = useAssessment()
  const kyc = useKycGate()
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

  /**
   * 麦克风开关。
   *
   * 转写出来的文字走 onType 而不是 setText——说出来的和打出来的走同一条路，
   * 下面那排胶囊才会跟着长出来。语音要是绕开它，同一句话打出来有反应、
   * 说出来没有。
   */
  const toggleMic = async () => {
    if (voice.current) { voice.current.stop(); return }

    /* 开录前把输入框存一份。× 的语义是「当我没说过」——边说边写的界面里，
       不把文字退回去的取消等于什么都没取消。 */
    before.current = text
    dropped.current = false

    const s = new IFlytekStreamer({ language: 'zh_cn' })
    /* 接在原文后面，不是覆盖整个框。覆盖有两处会咬人：框里本来打了半句的
       会被说话吞掉；而讯飞那一包识别为空时（停录瞬间常有），整个框会被清空。
       接着写则两种情况都退化成「原文没动」。
       点了 × 之后讯飞还会把最后一包发回来，dropped 挡住它飘回输入框。 */
    s.onResult(r => { if (!dropped.current) onType(join(before.current, r.text)) })
    s.onError(e => setErr(VOICE_MSG[e.kind]))
    /* onStop 是唯一的回到 idle 的路径：用户点停、讯飞判定说完、出错，
       三条最后都汇到这里，界面状态只在一个地方改。 */
    s.onStop(() => { voice.current = null; setMic(false) })

    voice.current = s
    setMic(true)
    setErr('')
    try {
      await s.start(() => ep.iflytekToken(identity))
    } catch (e) {
      /* start 抛出时 onStop 还没接上音频管线，得自己收尾。 */
      voice.current = null
      setMic(false)
      setErr(e instanceof VoiceError ? VOICE_MSG[e.kind] : 'Could not start voice input')
    }
  }

  /** × 丢弃这次录音，输入框退回开录前。 */
  const cancelMic = () => {
    dropped.current = true
    voice.current?.stop()
    onType(before.current)
    setErr('')
  }

  /* 离开首页时把麦克风关掉。不然标签页上那个录音红点会一直亮着，
     而界面上已经没有任何东西表示还在录。 */
  useEffect(() => () => voice.current?.stop(), [])

  const submit = async () => {
    if (busy) return
    const a = act
    if (!a) { setErr('Say what you want to trade, or pick Buy / Sell'); return }
    /* 身份门在最前面：撮合、评估都跑完了才说「你还没验身份」，
       那十几秒就白等了。 */
    if (kyc.require()) return
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
      /* 指名了就用指名的，没指名交给撮合的头名——成绩最好的排在前面，
         所以排序本身就是默认选择。 */
      const pick = (a.peer && m.candidates.find(c => c.name === a.peer)) || m.candidates[0]
      if (!pick) { setErr('No live offers on that side right now'); return }
      setCands(m.candidates)
      setChosen(pick)
      // 评估当着面跑完，再开工单——不评就下单，那张卡就成了既成事实
      await start(pick.offer_id, pick.name)
      const ord = await ep.take(pick.offer_id, {
        amount: pick.coin_amount, amount_kind: 'coin', network: '',
      })
      go({ view: 'order', id: ord.id })
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Request failed')
    } finally { setBusy(false) }
  }

  return (
    <div className="view on" id="v-chat">
      <div id="log">
        {/* 准入向导：参照里它是 Atara AI 这个会话里的一张卡片，不是弹窗。
            所以带上那条线程头，位置和外观都跟参照一致。 */}
        {kyc.maker ? (
          <>
            {/* 样式挂在 #thhead 上，而且要 .show 才 display:flex——
                写成 class 的话头像会掉到文字上面一行。 */}
            <div id="thhead" className="show">
              <span className="thav deskav" aria-hidden><i /></span>
              <span className="thwho"><b>Atara AI</b><span>Verification and listing desk</span></span>
            </div>
            {kyc.maker}
          </>
        ) : null}
        {/* 评估一开始就撤掉空态标题：界面在提交那一刻就切进对话态，
            中间那十几秒不该还挂着一句「你想结算什么」。 */}
        {cands.length ? (
          /* 先给候选再评估：直接跳评估是逻辑倒置——对手方还没出现，评的是谁？ */
          <div className="msg sys"><div className="matchcard">
            <div className="mcl">
              {chosen ? <>Matched · <b>{chosen.name}</b> — running the assessment</>
                      : 'Matching a counterparty…'}
            </div>
            <div className="mcs">
              {cands.map(c => (
                <button type="button" key={c.offer_id} disabled
                  className={'mcand' + (chosen?.offer_id === c.offer_id ? ' on' : '')}>
                  <span className="mcn"><b>{c.name}</b>
                    <em>score {c.trust_score} · {c.deals} trades · {c.unit_price} {c.fiat}/{a0(act)}</em>
                  </span>
                </button>
              ))}
            </div>
          </div></div>
        ) : null}
        {run ? <Thinking /> : (!cands.length && !kyc.maker &&
          <div id="empty"><h3>What would you like to settle?</h3></div>)}
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
            /* 在 Atara AI 这条对话里，输入框问的是这条对话的事——参照的
               setPlaceholder() 就是按当前线程换这句话的。 */
            placeholder={kyc.maker
              ? 'Message Atara AI — ask about the account, timing or documents'
              : 'Describe a trade — try “Buy 5,000 USDT with CNY” or “Sell 2,000 USDT for HKD”'} />
          <div className="saytools">
            {/* 录音中整条工具行换成波形胶囊：正在录的时候，能做的事只有
                「丢掉」和「说完了」——把麦克风和发送留在那里只是多两个
                此刻按了会出错的东西。 */}
            {mic && voice.current ? (
              <VoiceBar streamer={voice.current} onCancel={cancelMic}
                onConfirm={() => voice.current?.stop()} />
            ) : (
              <>
                {/* 附件按钮按产品要求隐藏：它在参照里会走一段文档识别的演示，
                    我们这边没有对应实现，留一个点了没反应的按钮不如不给。 */}
                <button className="sayic" title="Voice" aria-label="Voice"
                  aria-pressed={false} onClick={() => void toggleMic()}><IMic /></button>
                <button id="send" title="Compose (Enter)" aria-label="Compose"
                  disabled={busy || (!act && !text.trim())} onClick={() => void submit()}><ISend /></button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
