import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import ActionBar, { type Act, type ActKind } from '../components/ActionBar'
import { liveParse } from '../components/actlang'
import { IRetry } from '../components/icons'
import Composer from '../components/Composer'
import CopyButton from '../components/CopyButton'
import Dither from '../components/Dither'
import Thinking from '../components/Thinking'
import { useToast } from '../components/Toast'
import { useApi } from '../hooks/useApi'
import { useAssessment } from '../hooks/useAssessment'
import { useKycGate } from '../hooks/useKycGate'
import { NEW_ORDER, OPEN_DESK, go, isDeskOpen, setDeskOpen } from '../hooks/useRoute'
import type { MatchCandidate } from '../api/types'
import { scoreText } from '../api/types'

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

/* 毫秒进来，屏幕上那个整数出去。
   不满一秒返回 0，调用方据此整行不印——「Thought for 0 seconds」是句废话，
   而且半秒回来的时候根本没人觉得等过。 */
const secsOf = (ms?: number) => (ms && ms >= 1000 ? Math.round(ms / 1000) : 0)

export default function Home({ identity }: { identity: string; onNeedSignIn?: () => void }) {
  const [text, setText] = useState('')
  const [act, setAct] = useState<Act | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const [cands, setCands] = useState<MatchCandidate[]>([])
  const [chosen, setChosen] = useState<MatchCandidate | null>(null)

  /* Atara AI 这条对话。chat 是已经定稿的消息，streaming 是正在长出来的那一段——
     分开存是因为后者每收到几个字就要重画一次，混进 chat 会让整段列表跟着重渲染。
     null 表示此刻没有人在说话。 */
  const [chat, setChat] = useState<
    { id: string; author: 'me' | 'them'; body: string; at: string; thought?: number }[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)

  /* 等待期间的走秒。只是进度，不是结论。
   *
   * 写在回答上的那个数字由后端给（Message.thought_ms），因为它要落库，而落库
   * 的数只能有一个来源。两边各量一份的话，刚才看到的和刷新之后看到的会差一
   * 秒——同一件事说出两个数，比少说一个更糟。
   *
   * 这里这个只回答「已经等了几秒」，等的过程中后端还没法告诉我们答案。 */
  const askedAt = useRef(0)
  const [waited, setWaited] = useState(0)
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

  /* 屏幕上收起了前面多少条。0 = 全都显示。
   *
   * 「New order」按字面意思是开一张新台面，可这条对话是持久化的——只要跟
   * Atara AI 说过一句话，屏幕上就永远挂着那串消息，那颗按钮点下去什么也
   * 不会变。所以这里把已有的那些**从屏幕上**收起来，不是删：服务端那份
   * 一直在，Chats 里的 Atara AI 点回来就全看得到（侧栏那条注释说的就是
   * 这条退路，只是当时对话还只活在一次会话里，不需要专门收）。
   *
   * 记条数而不是记一个布尔：收起之后新说的话要照常出现在屏幕上，
   * 而它们和历史在同一个数组里。 */
  const [folded, setFolded] = useState(0)
  /* fresh 不能依赖 chat——它挂在一个 mount 就跑的 effect 上，
     进 deps 会变成每来一条消息就重置一次台面。 */
  const chatLen = useRef(0)
  chatLen.current = chat.length
  const shown = folded ? chat.slice(folded) : chat

  /* 新内容到了就跟到底（前提是用户还在底部）。流式回答每来一段都会触发，
     所以不能用 smooth——那会让滚动永远追不上正在生成的文字。 */
  useEffect(() => { if (stick.current) toBottom(false) }, [chat.length, streaming])

  /* 等待期间走秒。只在一个字都还没来的时候走（streaming === ''）——字一开始
     来就不是「在想」了，再让秒数往上跳是在说一件已经不成立的事。
     250ms 一跳而不是 1000ms：整秒走的话，第一次跳变在 0 到 1 秒之间随机，
     看起来像卡了一下。 */
  useEffect(() => {
    if (streaming !== '') return
    const t = setInterval(
      () => setWaited(Math.floor((Date.now() - askedAt.current) / 1000)), 250)
    return () => clearInterval(t)
  }, [streaming])

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
                   body: m.body, at: m.created_at, thought: secsOf(m.thought_ms) }))
    /* 已经开始说话了就不接管。历史是在挂载时拉的，要是这期间用户已经发出
       一句，拿历史整个覆盖会把那句吞掉（服务端那份还没回来）。 */
    setChat(c => (c.length ? c : past))
    /* 默认收起：首页就是「新建一单」那张台面，对话是从 Chats 里的 Atara AI
       走进来才展开的。不收的话，只要跟它说过一句话，「你想结算什么」那句
       空态标题就再也不出现——而那正是这个页面的起点。 */
    setFolded(isDeskOpen() ? 0 : past.length)
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
    /* 只收屏幕，不碰 isDeskOpen：那个标志归侧栏所有（它在 Home 挂载之前就
       表过态了）。这里跟着改的话，从 Chats 点进来的那一下会被 mount 时的
       这次调用抹掉——刚说要看对话，转头又被收起来。 */
    setFolded(chatLen.current)
  }, [reset])

  /* 两个入口都要堵：
     —— 从别处走进首页（组件重挂），
     —— 人已经在首页时点 New order（路由不变、不重挂，只有事件能通知到）。 */
  /* 展开回来。Chats 里的 Atara AI 和 New order 都落在 #/home，路由分不开
     它们，所以各喊各的信号。 */
  const openDesk = useCallback(() => { setDeskOpen(true); setFolded(0) }, [])

  useEffect(() => {
    fresh()
    addEventListener(NEW_ORDER, fresh)
    addEventListener(OPEN_DESK, openDesk)
    return () => {
      removeEventListener(NEW_ORDER, fresh)
      removeEventListener(OPEN_DESK, openDesk)
    }
  }, [fresh, openDesk])
  const kyc = useKycGate()

  /* 准入那块在对话里的位置：它一出现，就落在当时对话的末尾，然后不再动。
     记的是当时的条数，不是时刻——时刻要拿服务器给的 created_at 去比，
     两边的钟差一秒就会把一条新回复排到它上面。

     为什么不继续钉在最底下：钉住的话它看着不动，实际上每来一条新消息，
     它和上下文的相对位置就变一次——正在填的表单周围的内容在漂。落定之后
     代价换成了「表单会被顶上去、要往回滚一点」，那是滚动，不是重排。

     卡片收掉时一起清空：下次再打开它是一件新的待办，该重新落在那时的末尾。 */
  const [anchor, setAnchor] = useState<number | null>(null)
  useEffect(() => {
    setAnchor(a => (kyc.maker ? a ?? chat.length : null))
  }, [kyc.maker, chat.length])
  /* 落点要换算到 shown 上：收起历史之后 chat 的下标和 shown 的对不上。
     夹在两端之间——历史被收掉的那部分可能已经把落点甩到了前面。 */
  const cut = anchor == null ? shown.length
    : Math.max(0, Math.min(shown.length, anchor - folded))
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

  /** 边打字边填句。清空输入就把自动开出来的句子收起。
      语音转写也走这里：说出来的和打出来的同一条路，下面那排胶囊才会跟着长。 */
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

  /* 离开首页时掐掉还在生成的回答。没人看的字还在一段一段地生成，每一段都在花钱。
     麦克风由 Composer 自己在卸载时关掉。 */
  useEffect(() => () => { deskAbort.current?.abort() }, [])

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
    askedAt.current = Date.now()
    setWaited(0)
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
          /* 秒数用后端给的，不用这边计时器读到的那个。两处各量一份的话，
             刚才看到的和刷新之后看到的会差一秒——而它们本该是同一件事。
             这边那个计时器只负责等待期间的进度。 */
          setChat(c => [...c, { id: m.id, author: 'them', body: m.body,
            at: m.created_at, thought: secsOf(m.thought_ms) }])
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

  /* 一条消息长什么样。提出来是因为它现在要渲染两遍——准入那块上面一段、
     下面一段——而两段必须长得一模一样。 */
  const bubble = (m: { id: string; author: 'me' | 'them'; body: string; at: string; thought?: number }) => (
    <div key={m.id} className={'msg ' + m.author}>
      {/* 想了多久，留在回答上面。
          只在满一秒时印：半秒回来的时候印「0s」是噪音，而且那种时候根本
          没人觉得等过。
          这一条**活在这次会话里**——刷新之后消息从库里读回来，没有这个数，
          那一行就不再出现。落库要给 messages 加一列，为一行灰字不值当；
          它交代的是「刚才那一下为什么慢」，而那件事刷新之后已经不重要了。 */}
      {m.author === 'them' && (m.thought ?? 0) >= 1 && (
        <span className="thought">✦ Thought for {m.thought} seconds</span>
      )}
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
  )

  return (
    <div className="view on" id="v-chat">
      <div id="log" ref={log}>
        {/* 和 Atara AI 的对话。和准入那块同一条流——它们本来就是同一个台面上
            的两种消息：那边是流程播报，这边是你问它答。

            分成两段渲染，中间夹着准入那块：见 cut。 */}
        {shown.slice(0, cut).map(bubble)}
        {/* 准入那块落在它出现时的位置，不再钉在对话最后。

            钉在最后是为了让「要按的按钮、要填的表单」永远在眼皮底下，代价写
            在当时的注释里：后来的聊天记录排在它上面。真正的毛病是那个代价没有
            尽头——通过之后它早就不是待办了，却还压在每一句新消息下面，于是你
            刚发的话出现在准入对话的**上方**。

            更要紧的是：钉住的东西看着不动，其实每来一条消息，它和上下文的相对
            位置就变一次,正在填的表单周围的内容在漂。落定之后这件事没了,换来的
            代价是表单可能被顶出屏幕——那是滚一下,比重排轻。 */}
        {kyc.maker ? (
          <>
            {/* 样式挂在 #thhead 上，而且要 .show 才 display:flex——
                写成 class 的话头像会掉到文字上面一行。 */}
            <div id="thhead" className="show mkhead">
              <span className="thav deskav" aria-hidden><i /></span>
              <span className="thwho"><b>Atara AI</b><span>Verification and listing desk</span></span>
            </div>
            {kyc.maker}
          </>
        ) : null}
        {/* 落点之后说的话。 */}
        {shown.slice(cut).map(bubble)}
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
                {streaming ? (
                  <>{streaming}<i className="tcur" aria-hidden /></>
                ) : (
                  <>
                    {/* Seconds sit on top of the grid. Beside it they read as a
                        caption for the row; above it they caption the wait. */}
                    {waited >= 1 && (
                      <span className="waited" aria-live="off">{waited}s</span>
                    )}
                    <Dither />
                  </>
                )}
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
                    <em>{scoreText(c.trust_score)} · {c.deals} trades · {c.unit_price} {c.fiat}/{a0(act)}</em>
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
        {run ? <Thinking /> : (!cands.length && !kyc.maker && !shown.length && streaming === null &&
          <div id="empty"><h3>What would you like to settle?</h3></div>)}
        {err ? <p className="roempty" style={{ textAlign: 'center' }}>{err}</p> : null}
      </div>

      <Composer
        identity={identity}
        text={text}
        onChange={onType}
        ariaLabel="Describe a payment"
        placeholder={kyc.maker
          ? 'Message Atara AI — ask about the account, timing or documents'
          : 'Describe a trade — try “Buy 5,000 USDT with CNY” or “Sell 2,000 USDT for HKD”'}
        actOn={act?.k ?? null}
        onToggle={toggle}
        panel={act ? (
          <ActionBar act={act} onChange={setAct} onClose={() => setAct(null)}
            contacts={contacts} />
        ) : null}
        busy={busy}
        onSubmit={() => void submit()}
        sendTitle="Compose (Enter)"
        sendLabel="Compose"
        streaming={streaming !== null}
        onStop={stopAsk}
        onVoiceError={setErr}
      />
    </div>
  )
}
