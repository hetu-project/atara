import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import ActionBar, { type Act, type ActKind } from '../components/ActionBar'
import { liveParse } from '../components/actlang'
import { IBuy, IMic, IRetry, ISell, ISend } from '../components/icons'
import CopyButton from '../components/CopyButton'
import Dither from '../components/Dither'
import Thinking from '../components/Thinking'
import VoiceBar from '../components/VoiceBar'
import { useToast } from '../components/Toast'
import { useApi } from '../hooks/useApi'
import { useAssessment } from '../hooks/useAssessment'
import { useKycGate } from '../hooks/useKycGate'
import { NEW_ORDER, go } from '../hooks/useRoute'
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

/** 消息时间。格式与 Thread.tsx 一致——同一套视觉语言，两处不能各写各的。 */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

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

  /* Atara AI 这条对话。chat 是已经定稿的消息，streaming 是正在长出来的那一段——
     分开存是因为后者每收到几个字就要重画一次，混进 chat 会让整段列表跟着重渲染。
     null 表示此刻没有人在说话。 */
  const [chat, setChat] = useState<
    { id: string; author: 'me' | 'them'; body: string; at: string }[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)
  const deskAbort = useRef<AbortController | null>(null)
  /* 上一次失败的那句，连同原因。挂在消息流末尾，带一颗重试。 */
  const [failed, setFailed] = useState<{ q: string; why: string } | null>(null)

  /* 滚动容器。#log 自己是那个滚动的元素（overflow-y:auto），所以引用它，
     不是引用一个底部的锚点——要判断「用户是不是已经在底部」得读它的
     scrollTop，锚点给不了这个信息。 */
  const log = useRef<HTMLDivElement>(null)
  /* 要不要跟着新内容往下滚。
     只在「用户本来就在底部」时跟：他往上翻着读旧消息的时候，每来一个字
     就把他拽回底部，比不滚还难受。这个值由滚动事件维护，不在渲染时算——
     渲染时 DOM 已经变高了，那一刻永远算出「不在底部」。 */
  const stick = useRef(true)

  const toBottom = (smooth = false) => {
    const el = log.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  useEffect(() => {
    const el = log.current
    if (!el) return
    const onScroll = () => {
      /* 80px 的容差：正好贴底才算「在底部」的话，一点点惯性滑动就会
         把跟随关掉。 */
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  /* 新内容到了就跟到底（前提是用户还在底部）。流式回答每来一段都会触发，
     所以不能用 smooth——那会让滚动永远追不上正在生成的文字。 */
  useEffect(() => { if (stick.current) toBottom(false) }, [chat.length, streaming])

  /* 历史。以前这条对话只活在这一次会话里：刷新、切个视图再回来，屏幕上
     就空了——而消息其实好好地存在库里。 */
  const { data: hist } = useApi(() => ep.thread(ep.DESK_ID, identity), [identity])
  const loaded = useRef('')

  /* 换身份要先清干净再等新的历史。不清的话，切过去的那一瞬间屏幕上还是
     上一个人的对话——而这套演示就是靠切身份看两侧的。 */
  useEffect(() => {
    setChat([])
    setStreaming(null)
    loaded.current = ''
  }, [identity])

  useEffect(() => {
    if (!hist || loaded.current === identity) return
    loaded.current = identity
    /* 只认 chat：这条线程里还混着准入流程播报的 system / order 消息，
       那些由 MakerThread 自己渲染，这里再画一遍就是重影。 */
    const past = hist.messages
      .filter(m => m.kind === 'chat')
      .map(m => ({ id: m.id, author: m.author === 'me' ? 'me' as const : 'them' as const,
                   body: m.body, at: m.created_at }))
    /* 已经开始说话了就不接管。历史是在挂载时拉的，要是这期间用户已经发出
       一句，拿历史整个覆盖会把那句吞掉（服务端那份还没回来）。 */
    setChat(c => (c.length ? c : past))
    requestAnimationFrame(() => toBottom(false))
  }, [hist, identity])

  const { toast } = useToast()
  const { run, start, reset } = useAssessment()

  /**
   * 把台面清空。
   *
   * 评估状态挂在 App 级的 provider 上（右栏也读同一份），所以它跨视图一直活着——
   * 而这个页面用 `run ? <Thinking/> : 空态标题` 分支，只要跑过一次评估，
   * 那句「你想结算什么」就再也不出现，屏幕上永远挂着上一单的评估痕迹。
   * 项目里一直有 reset()，但从来没有人调用过。
   *
   * 不清对话：那是持久化的历史，从服务端拉回来的，和「这一单」无关。
   */
  const fresh = useCallback(() => {
    reset()
    setCands([])
    setChosen(null)
    setErr('')
  }, [reset])

  /* 两个入口都要堵：
     —— 从别处走进首页（组件重挂），
     —— 人已经在首页时点 New order（路由不变、不重挂，只有事件能通知到）。 */
  useEffect(() => {
    fresh()
    addEventListener(NEW_ORDER, fresh)
    return () => removeEventListener(NEW_ORDER, fresh)
  }, [fresh])
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

  /* 离开首页时把麦克风关掉，顺手掐掉还在生成的回答。
     麦克风留着的话标签页上那个录音红点会一直亮；回答留着的话，没人看的字
     还在一段一段地生成，而每一段都在花钱。 */
  useEffect(() => () => {
    voice.current?.stop()
    deskAbort.current?.abort()
  }, [])

  /**
   * 把一句话发给 Atara AI，边收边显示。
   *
   * 回答不等整段到齐再画——那是这次要做的事的全部意义。streaming 这个 state
   * 装的是「正在长出来的那一段」，收完由 onDone 归位到消息列表里。
   */
  const ask = async (q: string) => {
    setErr('')
    setFailed(null)
    setText('')
    /* 自己那句先画出来。等后端确认再画的话，网络慢的时候输入框已经清空、
       屏幕上却什么都没有，像是把话吞了。 */
    setChat(c => [...c, { id: 'local-' + Date.now(), author: 'me', body: q, at: new Date().toISOString() }])
    setStreaming('')
    /* 自己发的这一下无条件滚到底，不看 stick——他刚刚往上翻着读旧消息，
       然后打了一句发出去，那当然是想看这句和它的回答。 */
    stick.current = true
    requestAnimationFrame(() => toBottom(true))
    const ctl = new AbortController()
    deskAbort.current = ctl
    try {
      await ep.deskSend(q, {
        onDelta: t => setStreaming(s => s + t),
        onDone: m => {
          setChat(c => [...c, { id: m.id, author: 'them', body: m.body, at: m.created_at }])
          setStreaming(null)
        },
      }, identity, ctl.signal)
    } catch (e) {
      setStreaming(null)
      if (ctl.signal.aborted) return   // 是我们自己取消的，不是故障
      /* 失败的那句挂在消息上，不是飘到列表底部那行灰字里——长对话里
         那行字经常在屏幕外，而且它不说明是哪一句失败的。
         重试直接重发同一句：用户那句已经进库了，再发一次会多一条记录，
         但比让他自己重新打一遍强。 */
      setFailed({ q, why: e instanceof Error ? e.message : 'The desk could not answer' })
      toast('The desk could not answer', { kind: 'err', action: { label: 'Retry', onClick: () => void ask(q) } })
    } finally {
      deskAbort.current = null
    }
  }

  /** 掐掉正在生成的回答。每一段都在花钱，问错了不该只能干等它说完。 */
  const stopAsk = () => {
    deskAbort.current?.abort()
    deskAbort.current = null
    /* 已经吐出来的字留下——后端那边也会把「答了一半」存进库，
       两边保持一致。丢掉的话刷新页面又会冒出来，更让人困惑。 */
    setStreaming(s => {
      if (s) setChat(c => [...c, { id: 'stop-' + Date.now(), author: 'them', body: s, at: new Date().toISOString() }])
      return null
    })
  }

  const submit = async () => {
    if (busy) return
    const a = act
    /* 解析不出一张单就是在说话，不是在下单。
       判据用 act 而不是猜：胶囊出现了用户就看得见自己这句被当成了交易。
       原来这里直接报「Say what you want to trade」——占位符请人提问，
       提了问却被要求去说一笔交易，那句报错答非所问。 */
    if (!a) { await ask(text.trim()); return }
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
      <div id="log" ref={log}>
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
        {/* 和 Atara AI 的对话。和准入卡片同一条流——它们本来就是同一个台面上
            的两种消息：那边是流程播报，这边是你问它答。 */}
        {chat.map(m => (
          <div key={m.id} className={'msg ' + m.author}>
            {m.author === 'me' ? (
              <>
                <span className="bub">{m.body}</span>
                <span className="mt">{clock(m.at)}</span>
              </>
            ) : (
              <>
                <span className="mrow">
                  <span className="thav deskav mav" aria-hidden><i /></span>
                  <span className="bub">{m.body}</span>
                </span>
                {/* 时间和动作在同一行：两者都是「关于这条消息」的元信息，
                    各占一行会让消息之间的间距忽大忽小。 */}
                <span className="mact">
                  <span className="mt">{clock(m.at)}</span>
                  {/* 只给它那一侧复制：自己刚打的那句没人会去复制，
                      两边都放只会让每一条消息下面都挂一排按钮。 */}
                  <CopyButton text={m.body} label="Copy reply" done="Reply copied"
                    className="mactb" />
                </span>
              </>
            )}
          </div>
        ))}
        {/* 失败的那句挂在它自己后面，不是飘到列表底部——那行字经常在屏幕外，
            而且不说明是哪一句失败的。 */}
        {failed && (
          <div className="msg them">
            <span className="mrow">
              <span className="thav deskav mav" aria-hidden><i /></span>
              <span className="bub bubfail">{failed.why}</span>
            </span>
            <span className="mact">
              <button className="mactb" type="button" onClick={() => void ask(failed.q)}>
                <IRetry /> Retry
              </button>
            </span>
          </div>
        )}
        {/* 正在生成的那一段。
            第一个字到之前放 Dither：那段等待有一两秒，气泡是空的，而一个空的
            灰方块和「坏了」长得一模一样。字一开始来就换成文字 + 光标——
            这时已经有东西在动了，再留着加载动画反而在说「还没开始」。 */}
        {streaming !== null && (
          <div className="msg them">
            <span className="mrow">
              <span className="thav deskav mav" aria-hidden><i /></span>
              <span className={'bub' + (streaming ? '' : ' bubwait')}>
                {streaming ? <>{streaming}<i className="tcur" aria-hidden /></> : <Dither />}
              </span>
            </span>
          </div>
        )}
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
        {/* 空态标题只在台面真的空着时出现。
            条件里必须带上对话：不带的话，没开准入向导就直接开聊的人，会在
            自己那串消息**下面**看到一句「你想结算什么」——台面上明明已经有
            东西了，它还在问你要不要开始。 */}
        {run ? <Thinking /> : (!cands.length && !kyc.maker && !chat.length && streaming === null &&
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
                {/* 正在生成时发送键变成停止键。占同一个位置：那一刻唯一
                    该做的事就是叫停，再摆一颗按不了的发送键只是占地方。 */}
                {streaming !== null ? (
                  <button id="send" className="stopping" title="Stop generating"
                    aria-label="Stop generating" onClick={stopAsk}>
                    <span className="stopsq" aria-hidden />
                  </button>
                ) : (
                  <button id="send" title="Compose (Enter)" aria-label="Compose"
                    disabled={busy || (!act && !text.trim())} onClick={() => void submit()}><ISend /></button>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
