import { useEffect, useRef, useState, type ReactNode } from 'react'
import * as ep from '../api/endpoints'
import { IBuy, IMic, ISell, ISend } from './icons'
import VoiceBar from './VoiceBar'
import { IFlytekStreamer, VoiceError, type VoiceFailure } from '../services/iflytek'
import type { ActKind } from './ActionBar'

/** 语音起不来的几种原因，各自能做的事不同——所以不共用一句话。 */
const VOICE_MSG: Record<VoiceFailure, string> = {
  insecure: 'Voice needs a secure page — open this over HTTPS or on localhost',
  unsupported: 'This browser cannot record audio — try Chrome',
  denied: 'Microphone access was refused — allow it in the address bar and try again',
  'no-token': 'Voice is not switched on for this server',
  service: 'The voice service refused the request',
  network: 'Lost connection to the voice service',
}

/** 把说的接在打的后面。已经有空白结尾就不再补一个，不然会越接越松。 */
const join = (had: string, said: string) => {
  if (!had) return said
  if (!said) return had
  return /\s$/.test(had) ? had + said : had + ' ' + said
}

/**
 * Home 与 Thread 共用的输入条。
 *
 * 壳是同一套：Buy / Sell、输入框、语音、发送。附件不画——参照里它会走
 * 文档识别演示，这边没有对应实现，留一个点了没反应的按钮不如不给。
 *
 * 两页发出去的事不同（解析下单 / 问 AI vs 发消息 / 跟这个人下单），
 * 由 onSubmit 和 panel 交给调用方。
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
  /** 当前开着的是买还是卖；没有动作面板时为 null。 */
  actOn: ActKind | null
  onToggle: (k: ActKind) => void
  panel?: ReactNode
  busy: boolean
  onSubmit: () => void
  sendTitle?: string
  sendLabel?: string
  /** 正在生成回答：发送键换成停止。只有 Home 会用。 */
  streaming?: boolean
  onStop?: () => void
  onVoiceError?: (msg: string) => void
}) {
  const [mic, setMic] = useState(false)
  const voice = useRef<IFlytekStreamer | null>(null)
  const before = useRef('')
  const dropped = useRef(false)
  /* 转写回调要读到最新的 onChange，不能把第一次 render 的那份封进 streamer。 */
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
    <div id="say" className={actOn ? 'actopen' : ''}>
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
        <textarea id="free" rows={1} aria-label={ariaLabel}
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
