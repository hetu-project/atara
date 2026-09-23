import { Fragment, useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { LIVE_CHANGED } from '../api/events'
import ActionBar, { type Act, type ActKind } from '../components/ActionBar'
import { useAssessment } from '../hooks/useAssessment'
import AssessCard from '../components/AssessCard'
import Thinking from '../components/Thinking'
import Avatar from '../components/Avatar'
import Composer from '../components/Composer'
import { useToast } from '../components/Toast'
import { useApi } from '../hooks/useApi'
import { useKycGate } from '../hooks/useKycGate'
import { go } from '../hooks/useRoute'
import OrderDetail from './OrderDetail'
import { scoreText } from '../api/types'
import type { Message, Order } from '../api/types'
import { Failed, Pending } from '../components/Loading'

/**
 * One thread per counterparty.
 *
 * Chat, order cards and system announcements share one stream -- messages belong to the person, states
 * belong to the events, but they appear in the same place. Split across two pages, "he says he shipped"
 * and "this order is still waiting on proof" would never line up.
 */
export default function Thread({ identity, peer }: { identity: string; peer: string }) {
  /* 15s, not 3s: the live stream is what makes a new message appear now, and
     this is the net under it. If the stream is up the timer almost never fires
     first; if it is down — a proxy that strips streaming, an old backend — the
     conversation still updates, just at the old speed. Removing it outright
     would make one broken connection look like a broken product. */
  const { data, error, reload } = useApi(() => ep.thread(peer, identity), [peer, identity], 15000)

  /* Refetch the moment the server says this account has something new. The
     stream deliberately carries no message body, so there is nothing to merge:
     the same endpoint that filled this view fills it again. */
  useEffect(() => {
    addEventListener(LIVE_CHANGED, reload)
    return () => removeEventListener(LIVE_CHANGED, reload)
  }, [reload])
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  /* Place an order directly inside this person's conversation. In the reference the composer and the
     conversation were always the same view, so this row was always present in the conversation; we split
     it into two views and dropped it in the process. And "currently talking to this person" is exactly
     where placing an order should be most direct. */
  const [act, setAct] = useState<Act | null>(null)
  /* Order failures go to the corner toast, not a grey line above the composer.

     That line sat between the last bubble and the input, centred like a system
     notice, so "only 308 CNY is available on this listing" read as something
     the counterparty's side had said — and it stayed there until the next
     keystroke. The toast is where every other action in the console reports
     its outcome; this one was the odd one out. */
  const { toast } = useToast()
  const fail = (msg: string) => toast(msg, { kind: 'err' })
  const { start } = useAssessment()
  /* Same identity gate as Home and the Pool. This was the one place a take
     could be placed without it — the fiat leg is bank-to-bank between two
     people, and the payer has to be someone. */
  const kyc = useKycGate()
  const { data: cdata } = useApi(() => ep.contacts(identity), [identity])
  /* Read once here, hand to every card. Neither of these varies per order —
     one is which chain the backend is on, the other is whose money this is —
     and a thread renders one card per order. */
  const { data: chains } = useApi(() => ep.chainInfo(), [])
  const { data: myWallet } = useApi(() => ep.wallet(identity), [identity])

  /* The counterparty is prefilled as "the person being talked to" -- placing an order in their conversation should not require picking them again. */
  const mk = (k: ActKind): Act => ({
    k, amt: k === 'buy' ? 5000 : 3000, coin: 'USDT', fiat: 'CNY', peer: name, conds: [],
  })
  const end = useRef<HTMLDivElement>(null)
  const msgs = data?.messages ?? []
  const name = data?.peer?.display_name ?? peer
  const m = data?.merchant
  const orders = data?.orders ?? []

  /* Messages and ticket cards interleave chronologically in one stream.
  
     The reference does it this way: the ticket card (.deal) hangs directly under #log, not on a separate
     page. Split apart, "he says the money is sent" and "this order is still waiting on proof" never line
     up -- and those two are two sides of the same thing. */
  const stream: ({ t: number } & ({ msg: Message } | { order: Order }))[] = [
    ...msgs.map(x => ({ t: Date.parse(x.created_at), msg: x })),
    ...orders.map(o => ({ t: Date.parse(o.created_at), order: o })),
  ].sort((a, b) => a.t - b.t)

  useEffect(() => { end.current?.scrollIntoView({ block: 'nearest' }) }, [msgs.length])

  /* The counterparty is fixed -- you are talking to them. Home has to match someone first; here that is
     unnecessary, and the user should not be asked to pick again. */
  const order = async (a: Act) => {
    if (kyc.require()) return
    setBusy(true)
    try {
      const m = await ep.match({
        intent: a.k, amount: String(a.amt), amount_kind: 'coin',
        asset: a.coin, fiat: a.fiat, counterparty_id: peer,
      })
      if (m.violation) { fail(m.violation.message); return }
      const pick = m.candidates?.[0]
      if (!pick) { fail(`${name} has nothing live on that side right now`); return }
      const ord = await ep.take(pick.offer_id, {
        amount: pick.coin_amount, amount_kind: 'coin', network: '',
      })
      // The right column replays the assessment stored with this order -- see the note on useAssessment.start
      void start(pick.offer_id, pick.name, ord.id)
      setAct(null); reload()
    } catch (e) {
      fail(e instanceof Error ? e.message : 'Could not open that order')
    } finally { setBusy(false) }
  }

  const send = async () => {
    const b = text.trim()
    if (!b || busy) return
    setBusy(true)
    try { await ep.postChat(peer, b, identity); setText(''); reload() }
    catch (e) {
      /* The draft stays in the box — it was not sent, so it is still theirs
         to send. What must not happen is silence: a message that vanished
         from the input and never arrived, or one still sitting there with no
         word on why. */
      fail(e instanceof Error ? e.message : 'Could not send that message')
    }
    finally { setBusy(false) }
  }

  return (
    <div className="view on" id="v-chat">
      <div id="thhead" className="show">
        <Avatar name={name} cls="thav" />
        <span className="thwho">
          <b>{name}</b>
          {/* In the reference this row is the counterparty's scorecard: how many trades, what score.
              "N orders together" is how many trades I have done with them, which is a different number,
              and it is already in the stream below. */}
          <span>
            {m ? `${m.deals} trades · ${scoreText(m.trust_score)}` : 'No trades yet'}
          </span>
        </span>
      </div>

      <div id="log">
        <div className="tfeed">
          {/* The live trace, which until now only the desk (Home) rendered. Placing an order from inside a
              conversation runs an assessment just the same, and without this the run happened with nothing on
              screen to say so -- on a phone, where the right column is not rendered, nothing at all. It removes
              itself when there is no run. */}
          <Thinking />
          {stream.map(x => ('msg' in x
            ? <Bubble key={x.msg.id} m={x.msg} peer={name} />
            /* The ticket card gets no page shell, it goes straight into the stream. onBack is meaningless
               here -- the card is in the conversation, there is no "back".
               The risk card sits before the ticket card: the assessment ran at the moment the order was
               placed, so the judgement precedes the order; reversed, it would read as "settle first, review after". */
            : (
              <Fragment key={x.order.id}>
                {x.order.assessment && <AssessCard a={x.order.assessment} peer={name} />}
                {/* Hand the card the order this stream already fetched. Left to
                    itself it polls once a second for a row that arrives here
                    anyway, three seconds at a time, from the same endpoint.

                    Same for the chain config and the wallet: neither varies
                    per order, and a thread of twenty-one orders used to ask
                    for each of them twenty-one times. */}
                <OrderDetail id={x.order.id} bare identity={identity} onBack={() => {}}
                  order={x.order} onChanged={reload}
                  chains={chains} myWallet={myWallet} />
              </Fragment>
            )))}
          {/* Three different silences: still loading, failed, genuinely empty.
              Drawn as one they all read "nothing here", and the first two are
              not that. */}
          {!stream.length && (data === null
            ? (error ? <Failed error={error} onRetry={reload} /> : <Pending rows={3} />)
            : (
              <div className="msg sys"><span className="bub">
                Nothing here yet. Orders and messages with {name} land in this stream.
              </span></div>
            ))}
          <div ref={end} />
        </div>
      </div>

      <Composer
        identity={identity}
        text={text}
        onChange={setText}
        ariaLabel={`Message ${name}`}
        placeholder={act
          ? `Press Enter to place this order with ${name}`
          : `Message ${name}`}
        actOn={act?.k ?? null}
        onToggle={k => setAct(a => (a?.k === k ? null : mk(k)))}
        panel={act ? (
          <ActionBar act={act} onChange={setAct} onClose={() => setAct(null)}
            contacts={cdata?.contacts ?? []} />
        ) : null}
        busy={busy}
        onSubmit={() => { if (act) void order(act); else void send() }}
        sendTitle={act ? 'Place this order (Enter)' : 'Send (Enter)'}
        sendLabel={act ? 'Place this order' : 'Send'}
        onVoiceError={fail}
      />
    </div>
  )
}

function Bubble({ m, peer }: { m: Message; peer: string }) {
  /* A system announcement is nobody's utterance: centred, no bubble; order cards stay clickable. */
  if (m.kind === 'system' || m.kind === 'order') {
    const body = (
      <span className="bub">{m.body}</span>
    )
    return m.order_id ? (
      <div className="msg sys" role="button" tabIndex={0}
        style={{ cursor: 'pointer' }}
        onClick={() => go({ view: 'order', id: m.order_id! })}
        onKeyDown={e => { if (e.key === 'Enter') go({ view: 'order', id: m.order_id! }) }}>
        {body}
      </div>
    ) : <div className="msg sys">{body}</div>
  }
  const at = new Date(m.created_at)
    .toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
  /* Their messages carry an avatar, mine do not -- that is how the reference splits it, and the split is
     right: a stream has only one "other side", and who I am does not need repeating on every line.
     .mrow aligns avatar and bubble to the bottom; without it the avatar stretches with a multi-line bubble. */
  if (m.author === 'me') {
    return (
      <div className="msg me">
        <span className="bub">{m.body}</span>
        <span className="mt">{at}</span>
      </div>
    )
  }
  return (
    <div className="msg them">
      <span className="mrow">
        <Avatar name={peer} cls="mav" />
        <span className="bub">{m.body}</span>
      </span>
      <span className="mt">{at}</span>
    </div>
  )
}
