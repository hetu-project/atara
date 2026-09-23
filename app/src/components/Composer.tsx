import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import * as ep from '../api/endpoints'
import { IBuy, IMic, ISell, ISend } from './icons'
import VoiceBar from './VoiceBar'
import { IFlytekStreamer, VoiceError, type VoiceFailure } from '../services/iflytek'
import type { ActKind } from './ActionBar'

/** The handful of reasons voice can fail to start, each with a different remedy -- so they do not share one sentence. */
const VOICE_MSG: Record<VoiceFailure, string> = {
  insecure: 'Voice needs a secure page — open this over HTTPS or on localhost',
  unsupported: 'This browser cannot record audio — try Chrome',
  denied: 'Microphone access was refused — allow it in the address bar and try again',
  'no-token': 'Voice is not switched on for this server',
  service: 'The voice service refused the request',
  network: 'Lost connection to the voice service',
}

/** Append what was said to what was typed. Does not add another space if one is already there, or the gap keeps growing. */
const join = (had: string, said: string) => {
  if (!had) return said
  if (!said) return had
  return /\s$/.test(had) ? had + said : had + ' ' + said
}

/**
 * The input bar shared by Home and Thread.
 *
 * The shell is the same: Buy / Sell, input box, voice, send. Attachments are not drawn -- in the
 * reference they lead to a document-recognition demo we have no implementation for, and a button
 * that does nothing when clicked is worse than no button.
 *
 * What the two pages send differs (parse an order / ask the AI vs. send a message / trade with this
 * person), which onSubmit and panel hand back to the caller.
 */
export default function Composer({
  identity,
  text,
  onChange,
  placeholder,
  ariaLabel,
  actOn,
  onToggle,
  panel,
  busy,
  onSubmit,
  sendTitle = 'Send (Enter)',
  sendLabel = 'Send',
  streaming = false,
  onStop,
  onVoiceError,
}: {
  identity: string
  text: string
  onChange: (q: string) => void
  placeholder: string
  ariaLabel: string
  /** Whether the open panel is buy or sell; null when no action panel is open. */
  actOn: ActKind | null
  onToggle: (k: ActKind) => void
  panel?: ReactNode
  busy: boolean
  onSubmit: () => void
  sendTitle?: string
  sendLabel?: string
  /** An answer is being generated: the send key becomes stop. Only Home uses this. */
  streaming?: boolean
  onStop?: () => void
  onVoiceError?: (msg: string) => void
}) {
  /* The input box grows with its content. Starts at 1 row and switches to scrolling at 156px
   * (6 rows) -- that ceiling lives in the CSS.
   *
   * Reset to auto before reading scrollHeight: without the reset the box only ever grows, never
   * shrinks, because scrollHeight is never less than the current height, leaving a band of empty
   * space below after deleting text.
   *
   * useLayoutEffect rather than useEffect: the height is written before the browser paints,
   * otherwise every keystroke paints the old height first and then jumps.
   *
   * The smooth class on #say goes with this: the CSS gives it a flat .15s curve, whereas the
   * default one is the spring used for opening and closing -- a bounce per keystroke, which is
   * exactly what the reference took care to avoid. */
  const box = useRef<HTMLTextAreaElement>(null)
  const [fast, setFast] = useState(false)
  useLayoutEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = el.scrollHeight + 'px'
    setFast(true)
  }, [text])
  /* Panel open/close switches back to the spring. The two kinds of height change cannot share one
     curve: with the spring the box bounces on every keystroke; with the flat curve the panel opens
     by shoving upwards. So switch on "what caused this height change". */
  useLayoutEffect(() => { setFast(false) }, [actOn])

  const [mic, setMic] = useState(false)
  const voice = useRef<IFlytekStreamer | null>(null)
  const before = useRef('')
  const dropped = useRef(false)
  /* The transcription callback has to see the latest onChange; the one from the first render must not be closed over in streamer. */
  const onChangeRef = useRef(onChange)
  onChangeRef.current = onChange
  const onVoiceErrorRef = useRef(onVoiceError)
  onVoiceErrorRef.current = onVoiceError

  const fail = (msg: string) => onVoiceErrorRef.current?.(msg)

  const toggleMic = async () => {
    if (voice.current) { voice.current.stop(); return }

    before.current = text
    dropped.current = false

    const s = new IFlytekStreamer({ language: 'zh_cn' })
    s.onResult(r => { if (!dropped.current) onChangeRef.current(join(before.current, r.text)) })
    s.onError(e => fail(VOICE_MSG[e.kind]))
    s.onStop(() => { voice.current = null; setMic(false) })

    voice.current = s
    setMic(true)
    onVoiceErrorRef.current?.('')
    try {
      await s.start(() => ep.iflytekToken(identity))
    } catch (e) {
      voice.current = null
      setMic(false)
      fail(e instanceof VoiceError ? VOICE_MSG[e.kind] : 'Could not start voice input')
    }
  }

  const cancelMic = () => {
    dropped.current = true
    voice.current?.stop()
    onChangeRef.current(before.current)
  }

  useEffect(() => () => { voice.current?.stop() }, [])

  const go = () => { if (!busy) onSubmit() }

  return (
    <div id="say" className={(fast ? 'smooth' : '') + (actOn ? ' actopen' : '')}>
      <div id="actions" role="group" aria-label="Actions">
        <button className={'act' + (actOn === 'buy' ? ' on' : '')} type="button"
          onClick={() => onToggle('buy')}>
          <span className="acti"><IBuy /></span>Buy
        </button>
        <button className={'act' + (actOn === 'sell' ? ' on' : '')} type="button"
          onClick={() => onToggle('sell')}>
          <span className="acti"><ISell /></span>Sell
        </button>
      </div>
      <div className="sayrow">
        {panel}
        <textarea id="free" rows={1} aria-label={ariaLabel} ref={box}
          value={text}
          onChange={e => onChange(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); go() }
          }}
          placeholder={placeholder} />
        <div className="saytools">
          {mic && voice.current ? (
            <VoiceBar streamer={voice.current} onCancel={cancelMic}
              onConfirm={() => voice.current?.stop()} />
          ) : (
            <>
              <button className="sayic" type="button" title="Voice" aria-label="Voice"
                aria-pressed={false} onClick={() => void toggleMic()}><IMic /></button>
              {streaming && onStop ? (
                <button id="send" className="stopping" type="button" title="Stop generating"
                  aria-label="Stop generating" onClick={onStop}>
                  <span className="stopsq" aria-hidden />
                </button>
              ) : (
                <button id="send" type="button" title={sendTitle} aria-label={sendLabel}
                  disabled={busy || (!actOn && !text.trim())}
                  onClick={go}><ISend /></button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
