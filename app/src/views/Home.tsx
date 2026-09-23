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
 * The home page = an empty desk plus one question.
 *
 * The sentence grows as you type: slots that were named are solid, ones that were not are filled by reasonable
 * guess and marked dashed. The difference from "drop example text into the input and make them press enter" is
 * that the user does not first have to parse a sentence they never wrote and then guess which words are editable;
 * the pills explain for themselves where the edit points are.
 */
const a0 = (a: { coin: string } | null) => a?.coin ?? 'USDT'

/** Message timestamp. The format matches Thread.tsx -- one visual language, and the two places must not each invent their own. */
const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })

/* Milliseconds in, the integer shown on screen out.
   Under one second returns 0, from which the caller omits the whole line -- "Thought for 0 seconds" says nothing,
   and at half a second nobody felt they waited at all. */
const secsOf = (ms?: number) => (ms && ms >= 1000 ? Math.round(ms / 1000) : 0)

export default function Home({ identity }: { identity: string; onNeedSignIn?: () => void }) {
  const [text, setText] = useState('')
  const [act, setAct] = useState<Act | null>(null)
  const [busy, setBusy] = useState(false)
  const [cands, setCands] = useState<MatchCandidate[]>([])
  const [chosen, setChosen] = useState<MatchCandidate | null>(null)

  /* The Atara AI conversation. chat holds finalised messages, streaming holds the piece currently growing --
     kept apart because the latter repaints every few characters, and mixed into chat it would re-render the whole list.
     null means nobody is speaking right now. */
  const [chat, setChat] = useState<
    { id: string; author: 'me' | 'them'; body: string; at: string; thought?: number }[]>([])
  const [streaming, setStreaming] = useState<string | null>(null)

  /* The counter ticking during the wait. Progress only, not a conclusion.
   *
   * The number written on the answer comes from the backend (Message.thought_ms), because it has to be persisted,
   * and a persisted number can only have one source. Measured on both sides, what was seen a moment ago and what
   * is seen after a refresh would differ by a second -- two numbers for one thing, which is worse than one number fewer.
   *
   * This one only answers "how long have I been waiting", during which the backend cannot yet tell us the answer. */
  const askedAt = useRef(0)
  const [waited, setWaited] = useState(0)
  const deskAbort = useRef<AbortController | null>(null)
  /* The last failed message, with its reason. Hung at the end of the message stream with a retry button. */
  const [failed, setFailed] = useState<{ q: string; why: string } | null>(null)

  /* The scroll container. #log is itself the scrolling element (overflow-y:auto), so it is what is referenced,
     not an anchor at the bottom -- deciding "is the user already at the bottom" requires reading its scrollTop,
     which an anchor cannot give. */
  const log = useRef<HTMLDivElement>(null)
  /* Whether to follow new content downwards.
     Only follow when the user was already at the bottom: while they are scrolled up reading old messages, being
     yanked back to the bottom on every character is worse than not scrolling at all. This value is maintained by
     the scroll event rather than computed at render time -- by render time the DOM has already grown taller, and
     at that instant it always computes "not at the bottom". */
  const stick = useRef(true)

  const toBottom = (smooth = false) => {
    const el = log.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : 'auto' })
  }

  useEffect(() => {
    const el = log.current
    if (!el) return
    const onScroll = () => {
      /* An 80px tolerance: requiring an exact bottom to count as "at the bottom" means a little inertial scrolling
         switches following off. */
      stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [])

  /* How many earlier messages are collapsed on screen. 0 = show everything.
   *
   * "New order" literally means opening a fresh desk, but this conversation is persistent -- having said one thing
   * to Atara AI, that string of messages hangs on screen forever and clicking that button changes nothing. So this
   * collapses the existing ones **on screen**, without deleting: the server-side copy is always there, and Atara AI
   * under Chats brings it all back (that fallback is what the sidebar's comment refers to, except at the time the
   * conversation only lived for one session and needed no explicit collapsing).
   *
   * A count rather than a boolean: after collapsing, newly said things must still appear on screen, and they share
   * the array with the history. */
  const [folded, setFolded] = useState(0)
  /* fresh must not depend on chat -- it hangs off an effect that runs on mount, and in deps it would reset the desk
     on every incoming message. */
  const chatLen = useRef(0)
  chatLen.current = chat.length
  const shown = folded ? chat.slice(folded) : chat

  /* Follow to the bottom when new content arrives (provided the user is still at the bottom). A streamed answer
     triggers this on every chunk, so smooth is out -- that would leave the scroll permanently behind the text being generated. */
  useEffect(() => { if (stick.current) toBottom(false) }, [chat.length, streaming])

  /* Tick during the wait. Only while not a single character has arrived (streaming === '') -- once text starts
     arriving it is no longer "thinking", and letting the seconds keep climbing asserts something no longer true.
     A tick every 250ms rather than 1000ms: on whole seconds the first jump lands randomly between 0 and 1 second,
     which looks like a stutter. */
  useEffect(() => {
    if (streaming !== '') return
    const t = setInterval(
      () => setWaited(Math.floor((Date.now() - askedAt.current) / 1000)), 250)
    return () => clearInterval(t)
  }, [streaming])

  /* History. This conversation used to live only for one session: refresh, or switch view and come back, and the
     screen was empty -- while the messages were sitting safely in the database. */
  const { data: hist } = useApi(() => ep.thread(ep.DESK_ID, identity), [identity])
  const loaded = useRef('')

  /* Switching identity has to clear first and then wait for the new history. Without clearing, the instant after
     the switch the screen still shows the previous person's conversation -- and this demo works by switching identity to see both sides. */
  useEffect(() => {
    setChat([])
    setStreaming(null)
    loaded.current = ''
  }, [identity])

  useEffect(() => {
    if (!hist || loaded.current === identity) return
    loaded.current = identity
    /* Only chat is recognised: this thread also carries system / order messages broadcast by the onboarding flow,
       which MakerThread renders itself, and painting them again here would be a double image. */
    const past = hist.messages
      .filter(m => m.kind === 'chat')
      .map(m => ({ id: m.id, author: m.author === 'me' ? 'me' as const : 'them' as const,
                   body: m.body, at: m.created_at, thought: secsOf(m.thought_ms) }))
    /* Do not take over once speaking has begun. History is fetched on mount, and if the user has sent something in
       the meantime, overwriting wholesale with history would swallow it (the server-side copy has not come back yet). */
    setChat(c => (c.length ? c : past))
    /* Collapsed by default: the home page is the "new order" desk, and the conversation only expands when walked
       into from Atara AI under Chats. Without collapsing, one sentence said to it means that "what would you like
       to settle" empty-state heading never appears again -- and that is this page's starting point. */
    setFolded(isDeskOpen() ? 0 : past.length)
    requestAnimationFrame(() => toBottom(false))
  }, [hist, identity])

  const { toast } = useToast()
  /* Order and voice failures report in the corner toast, same as on the
     thread view. The centred grey line they used to occupy read like a
     system notice in the stream rather than a reply to what was just done. */
  const fail = (msg: string) => toast(msg, { kind: 'err' })
  const { run, start, reset } = useAssessment()

  /**
   * Clear the desk.
   *
   * Assessment state hangs off an App-level provider (the right column reads the same copy), so it stays alive
   * across views -- while this page branches on `run ? <Thinking/> : empty-state heading`, so once an assessment
   * has run even once, that "what would you like to settle" never appears again and the previous order's assessment
   * trace hangs on screen forever.
   * The project has always had reset(), and nobody had ever called it.
   *
   * The conversation is not cleared: that is persistent history fetched from the server, unrelated to "this order".
   */
  const fresh = useCallback(() => {
    reset()
    setCands([])
    setChosen(null)
    /* Collapse the screen only, do not touch isDeskOpen: that flag belongs to the sidebar (which stated its intent
       before Home mounted). Changing it here means the click that walked in from Chats is wiped out by this call on
       mount -- having just asked to see the conversation, it is collapsed again a moment later. */
    setFolded(chatLen.current)
  }, [reset])

  /* Both entry points have to be plugged:
     -- walking into home from elsewhere (the component remounts),
     -- clicking New order while already on home (no route change, no remount, only an event gets through). */
  /* Expanding back. Atara AI under Chats and New order both land on #/home, which the route cannot tell apart, so
     each shouts its own signal. */
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

  /* Where the onboarding block sits in the conversation: once it appears, it lands at the conversation's end as it
     was then, and does not move again.
     What is recorded is the message count at the time, not a moment -- a moment would have to be compared against
     the server's created_at, and a one-second clock difference between the two sides would sort a new reply above it.

     Why not keep pinning it to the bottom: pinned, it looks stationary while in fact its position relative to its
     context changes with every new message -- the content around a form being filled in drifts. Once settled, the
     cost becomes "the form gets pushed up and needs scrolling back to", which is scrolling, not reflow.

     Cleared along with the card: next time it opens it is a new to-do and should land at the end as it is then. */
  const [anchor, setAnchor] = useState<number | null>(null)
  useEffect(() => {
    setAnchor(a => (kyc.maker ? a ?? chat.length : null))
  }, [kyc.maker, chat.length])
  /* The landing index has to be converted onto shown: after the history is collapsed, chat's indices no longer
     match shown's. Clamped at both ends -- the collapsed part of the history may already have pushed the landing point ahead of it. */
  const cut = anchor == null ? shown.length
    : Math.max(0, Math.min(shown.length, anchor - folded))
  const { data: cdata } = useApi(() => ep.contacts(identity), [identity])
  const contacts = cdata?.contacts ?? []
  const peers = useMemo(() => contacts.map(c => ({ name: c.name })), [contacts])

  const blank = (k: ActKind): Act => ({
    k, amt: k === 'buy' ? 5000 : 3000, coin: 'USDT', fiat: 'CNY', peer: '', conds: [],
  })

  /** Pill entry point: a manually opened panel is always solid, and typing does not take it over. */
  const toggle = (k: ActKind) => {
    setAct(a => (a && a.k === k && !a.auto ? null : { ...blank(k), auto: false }))
  }

  /** Fill the sentence as you type. Clearing the input collapses an auto-opened sentence.
      Voice transcription goes through here too: what is spoken and what is typed take the same path, which is what makes the pills below grow. */
  const onType = (q: string) => {
    setText(q)
    if (act && !act.auto) return               // A panel the user opened by hand; typing does not take it over
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

  /* Kill the answer still being generated when leaving home. Text nobody will read keeps arriving chunk by chunk, and every chunk costs money.
     The microphone is closed by Composer itself on unmount. */
  useEffect(() => () => { deskAbort.current?.abort() }, [])

  /**
   * Send a sentence to Atara AI and display it as it arrives.
   *
   * The answer is not held back until it is complete -- that is the whole point of this. The streaming state holds
   * "the piece currently growing", and onDone moves it into the message list once it is complete.
   */
  const ask = async (q: string) => {
    setFailed(null)
    setText('')
    /* Paint your own message first. Waiting for the backend to confirm means that on a slow network the input has
       cleared while nothing is on screen, as if the words were swallowed. */
    setChat(c => [...c, { id: 'local-' + Date.now(), author: 'me', body: q, at: new Date().toISOString() }])
    askedAt.current = Date.now()
    setWaited(0)
    setStreaming('')
    /* Your own send scrolls to the bottom unconditionally, ignoring stick -- they had just scrolled up reading old
       messages and then typed and sent something, which obviously means they want to see it and its answer. */
    stick.current = true
    requestAnimationFrame(() => toBottom(true))
    const ctl = new AbortController()
    deskAbort.current = ctl
    try {
      await ep.deskSend(q, {
        onDelta: t => setStreaming(s => s + t),
        onDone: m => {
          /* The seconds figure comes from the backend, not from this side's timer. Measured in two places, what was
             seen a moment ago and what is seen after a refresh differ by a second -- when they should be the same thing.
             This side's timer only reports progress during the wait. */
          setChat(c => [...c, { id: m.id, author: 'them', body: m.body,
            at: m.created_at, thought: secsOf(m.thought_ms) }])
          setStreaming(null)
        },
      }, identity, ctl.signal)
    } catch (e) {
      setStreaming(null)
      if (ctl.signal.aborted) return   // We cancelled it ourselves; not a fault
      /* The failed message hangs on the message itself, not in a line of grey text floating at the bottom of the
         list -- in a long conversation that line is often off screen, and it does not say which message failed.
         Retry simply resends the same sentence: the user's message is already in the database, so resending adds a
         second record, but that beats making them type it again. */
      setFailed({ q, why: e instanceof Error ? e.message : 'The desk could not answer' })
      toast('The desk could not answer', { kind: 'err', action: { label: 'Retry', onClick: () => void ask(q) } })
    } finally {
      deskAbort.current = null
    }
  }

  /** Kill the answer being generated. Every chunk costs money, and asking the wrong question should not mean waiting it out. */
  const stopAsk = () => {
    deskAbort.current?.abort()
    deskAbort.current = null
    /* Keep the text already emitted -- the backend also stores a half-finished answer, and the two sides stay
       consistent. Discarding it means it reappears on refresh, which is more confusing still. */
    setStreaming(s => {
      if (s) setChat(c => [...c, { id: 'stop-' + Date.now(), author: 'them', body: s, at: new Date().toISOString() }])
      return null
    })
  }

  const submit = async () => {
    if (busy) return
    const a = act
    /* Failing to parse an order means they are talking, not ordering.
       The test is act rather than a guess: once the pills appear, the user can see their sentence was read as a trade.
       This used to report "Say what you want to trade" outright -- the placeholder invites a question, and answering
       a question with a demand to describe a trade is an error message that does not answer what was asked. */
    if (!a) { await ask(text.trim()); return }
    /* The identity door comes first: saying "you have not verified your identity" only after matching and
       assessment have both run wastes those dozen-odd seconds. */
    if (kyc.require()) return
    setBusy(true)
    try {
      /* Match first, assess second: run the assessment before a counterparty exists and who is being assessed?
         The backend scans the whole pool, sorts by record, and drops anyone who cannot take this volume along the way. */
      const m = await ep.match({
        intent: a.k, amount: String(a.amt), amount_kind: 'coin',
        asset: a.coin, fiat: a.fiat,
      })
      if (m.violation) { fail(m.violation.message); return }
      if (!m.candidates?.length) { fail('No live offers on that side right now'); return }
      /* Use the named person when one was named; otherwise hand it to matching's top result -- the best record sorts
         first, so the sort itself is the default choice.

         Stop rather than substitute when the named person is not in the results. This used to fall back to the top
         result, so "buy 500 from Alice" quietly became an order with a stranger -- and ordering is immediate, so by
         the time the name on the card is read, the order is already with that person. */
      const named = a.peer ? m.candidates.find(c => c.name === a.peer) : undefined
      if (a.peer && !named) {
        fail(`${a.peer} has nothing live on that side right now — pick someone else or leave the name out`)
        return
      }
      const pick = named ?? m.candidates[0]
      if (!pick) { fail('No live offers on that side right now'); return }
      setCands(m.candidates)
      setChosen(pick)
      // The assessment finishes in the open before the ticket opens -- ordering without assessing makes that card a fait accompli
      await start(pick.offer_id, pick.name)
      const ord = await ep.take(pick.offer_id, {
        amount: pick.coin_amount, amount_kind: 'coin', network: '',
      })
      go({ view: 'order', id: ord.id })
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Request failed')
    } finally { setBusy(false) }
  }

  /* What a message looks like. Extracted because it now renders twice -- once above the onboarding block and once
     below -- and the two have to look identical. */
  const bubble = (m: { id: string; author: 'me' | 'them'; body: string; at: string; thought?: number }) => (
    <div key={m.id} className={'msg ' + m.author}>
      {/* How long it thought, kept above the answer.
          Printed only at a full second or more: printing "0s" for a half-second reply is noise, and at that speed
          nobody felt they waited at all.
          This one **lives only for this session** -- after a refresh the messages are read back from the database
          without this number, and the line simply stops appearing. Persisting it would mean another column on
          messages, which is not worth it for a line of grey text; it explains "why was that one slow", and after a
          refresh that no longer matters. */}
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
          {/* Time and actions on one line: both are metadata "about this message", and on separate lines the gaps
              between messages would vary. */}
          <span className="mact">
            <span className="mt">{clock(m.at)}</span>
            {/* Copy is offered on their side only: nobody copies the sentence they just typed themselves, and
                offering both would hang a row of buttons under every single message. */}
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
        {/* The conversation with Atara AI. One stream with the onboarding block -- they were always two kinds of
            message on the same desk: one is flow broadcast, the other is you asking and it answering.

            Rendered in two parts with the onboarding block between them: see cut. */}
        {shown.slice(0, cut).map(bubble)}
        {/* The onboarding block lands where it appeared and is no longer pinned to the end of the conversation.

            Pinning it to the end was meant to keep "the button to press, the form to fill" always in view, and the
            cost was written in the comment at the time: later chat messages sorted above it. The real problem was
            that the cost had no end -- long after approval it was no longer a to-do, yet it still sat below every
            new message, so what you had just said appeared **above** the onboarding conversation.

            More importantly: a pinned thing looks stationary while its position relative to its context changes
            with every incoming message, and the content around a form being filled in drifts. Settled, that problem
            is gone, and the cost becomes the form possibly being pushed off screen -- which is one scroll, and lighter than reflow. */}
        {kyc.maker ? (
          <>
            {/* The styles hang off #thhead, and it needs .show to display:flex --
                written as a class, the avatar drops onto the line above the text. */}
            <div id="thhead" className="show mkhead">
              <span className="thav deskav" aria-hidden><i /></span>
              <span className="thwho"><b>Atara AI</b><span>Verification and listing desk</span></span>
            </div>
            {kyc.maker}
          </>
        ) : null}
        {/* Anything said after the landing point. */}
        {shown.slice(cut).map(bubble)}
        {/* A failed message hangs after itself rather than floating to the bottom of the list -- that line is often
            off screen, and it does not say which message failed. */}
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
        {/* The piece currently being generated.
            Dither shows until the first character arrives: that wait is a second or two with an empty bubble, and an
            empty grey rectangle looks exactly like something broken. Once text starts arriving it switches to text
            plus a cursor -- something is now moving, and leaving a loading animation there would say "not started yet". */}
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
        {/* Drop the empty-state heading the moment the assessment starts: the UI switches into conversation mode at
            submission, and those dozen-odd seconds should not still carry "what would you like to settle". */}
        {cands.length ? (
          /* Candidates before assessment: jumping straight to assessment inverts the logic -- with no counterparty yet, who is being assessed? */
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
        {/* The empty-state heading only appears while the desk is really empty.
            The condition has to include the conversation: without it, someone who never opened the onboarding wizard
            and just started chatting sees "what would you like to settle" **below** their own string of messages --
            with things plainly already on the desk, it is still asking whether to begin. */}
        {run ? <Thinking /> : (!cands.length && !kyc.maker && !shown.length && streaming === null &&
          <div id="empty"><h3>What would you like to settle?</h3></div>)}
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
        onVoiceError={fail}
      />
    </div>
  )
}
