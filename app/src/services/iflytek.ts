/**
 * iFlytek real-time speech dictation (IAT) streaming client.
 *
 * The path: the backend signs a time-limited WSS URL -> the browser captures the mic -> 16k mono PCM is
 * Base64-encoded and pushed frame by frame to iFlytek -> incremental text comes back into the input box. The
 * audio never passes through our backend; the WSS connection is browser-direct to iFlytek, and the only reason
 * the backend exists here is that the secret must not leave the server.
 *
 * The microphone requires a secure context: localhost counts, any other domain must be HTTPS.
 */

/** One callback. text is always the **current complete text**, not a delta -- callers can simply overwrite. */
export interface VoiceResult {
  text: string
  isFinal: boolean
}

/** Failure reasons are reported separately: these three call for completely different responses, and merged into one sentence no useful hint can be given. */
export type VoiceFailure =
  | 'unsupported' /* Browser does not support it (no getUserMedia / AudioContext) */
  | 'insecure' /* Non-secure context; the browser will not grant the microphone at all */
  | 'denied' /* The user denied microphone permission */
  | 'no-token' /* The backend has no secret configured, or the signing endpoint is down */
  | 'service' /* iFlytek returned an error code */
  | 'network' /* The WebSocket dropped */

export class VoiceError extends Error {
  readonly kind: VoiceFailure
  constructor(kind: VoiceFailure, message: string) {
    super(message)
    this.name = 'VoiceError'
    this.kind = kind
  }
}

export interface SignedUrl {
  url: string
  app_id: string
}

/** Fired once per captured frame; a 4096-sample frame @16k is roughly 256ms. */
const FRAME = 4096
const TARGET_RATE = 16000

/** The frame status iFlytek expects: 0 first frame (must carry common+business), 1 intermediate, 2 final. */
const enum Frame {
  First = 0,
  Middle = 1,
  Last = 2,
}

export interface VoiceOptions {
  /** iFlytek's language. Chinese is zh_cn, English en_us. */
  language?: string
  accent?: string
  /** How long a silence counts as finished speaking (milliseconds). Too short and a pause mid-sentence is treated as the end. */
  vadEos?: number
}

export class IFlytekStreamer {
  private ws: WebSocket | null = null
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  /* Explicit <ArrayBuffer>: getFloatTimeDomainData does not accept views that may point at a SharedArrayBuffer. */
  private peek: Float32Array<ArrayBuffer> | null = null

  private frame: Frame = Frame.First
  private appId = ''
  private opts: Required<VoiceOptions>

  /* Final segments received so far, stored in iFlytek's sn order. Dynamic correction has to be able to go back
     and rewrite a segment, so a single concatenated string is not enough. */
  private segments = new Map<number, string>()
  /* stop() gets triggered a second time by onclose; this guards against re-entry. */
  private done = false

  private onResultCb?: (r: VoiceResult) => void
  private onErrorCb?: (e: VoiceError) => void
  private onStopCb?: () => void

  constructor(opts: VoiceOptions = {}) {
    this.opts = {
      language: opts.language ?? 'zh_cn',
      accent: opts.accent ?? 'mandarin',
      vadEos: opts.vadEos ?? 5000,
    }
  }

  /* Callbacks are not cleared inside stop(): one instance may be started twice, and clearing them would make the
     second start fail silently. Instances are single-use, and the callbacks are collected along with the instance. */
  onResult(cb: (r: VoiceResult) => void) {
    this.onResultCb = cb
  }
  onError(cb: (e: VoiceError) => void) {
    this.onErrorCb = cb
  }
  onStop(cb: () => void) {
    this.onStopCb = cb
  }

  /**
   * Start recording. getSignedUrl really does go to the backend each time -- the signature is short-lived, and
   * caching and reusing it fails the handshake.
   *
   * Ask for the microphone before connecting the WebSocket: the other way round, the connection sits idle through
   * the dozen-odd seconds a user hesitates over the permission prompt, and iFlytek times it out first.
   */
  async start(getSignedUrl: () => Promise<SignedUrl>): Promise<void> {
    if (!window.isSecureContext) {
      throw new VoiceError('insecure', 'Voice needs HTTPS (or localhost)')
    }
    const AC: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!navigator.mediaDevices?.getUserMedia || !AC) {
      throw new VoiceError('unsupported', 'This browser cannot record audio')
    }

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      throw new VoiceError('denied', 'Microphone permission was refused')
    }
    /* The permission prompt can hang for a long time, and during it the user may well click again to close it. By
       then stop() has already run, and carrying on to set up the pipeline here leaves the microphone with nobody
       to close it -- that red dot on the tab stays lit until the page is closed. After every await, reconfirm that
       this should still be alive. */
    if (this.done) { stream.getTracks().forEach(t => t.stop()); return }
    this.stream = stream

    let signed: SignedUrl
    try {
      signed = await getSignedUrl()
    } catch (e) {
      this.release()
      throw new VoiceError('no-token', e instanceof Error ? e.message : 'Could not reach the voice service')
    }
    if (this.done) { this.release(); return }
    this.appId = signed.app_id

    /* sampleRate is a **request**, not a guarantee: Chrome honours it, Safari ignores it and gives the hardware
       rate. So everything below resamples to 16k based on ctx.sampleRate rather than assuming 16k was granted --
       sending 44.1k data passed off as 16k gives iFlytek an unintelligible slowed-down recording. */
    this.ctx = new AC({ sampleRate: TARGET_RATE })
    if (this.ctx.state === 'suspended') await this.ctx.resume()
    if (this.done) { this.release(); return }

    await this.connect(signed.url)
  }

  private connect(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(url)
      this.ws = ws

      ws.onopen = () => {
        this.pump()
        resolve()
      }
      ws.onmessage = e => this.receive(e.data as string)
      ws.onerror = () => {
        /* On a handshake-stage failure onopen has not run, so resolve never happens -- this must reject, or
           start() hangs forever and the UI sits on "listening". */
        const err = new VoiceError('network', 'Lost connection to the voice service')
        reject(err)
        this.fail(err)
      }
      ws.onclose = () => this.stop()
    })
  }

  /** Attach the audio pipeline and start streaming. */
  private pump() {
    const ctx = this.ctx
    const stream = this.stream
    if (!ctx || !stream) return

    this.source = ctx.createMediaStreamSource(stream)

    /* A separate branch drives the volume meter. It does not reuse the ScriptProcessor's frames below because
       4096 samples @16k is one frame roughly every 256ms, and a waveform updating four times a second is a
       twitch, not a breath.
       An AnalyserNode lets the UI read at its own rhythm (rAF), keeping the two concerns apart. */
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.5
    this.peek = new Float32Array(this.analyser.fftSize)
    this.source.connect(this.analyser)

    /* ScriptProcessorNode is deprecated and AudioWorklet is the proper path. It is still used here because a
       Worklet needs its own module file and an extra entry point in the build output, while this version only
       needs the path working end to end. Switching to a Worklet touches this one method only. */
    this.node = ctx.createScriptProcessor(FRAME, 1, 1)
    this.source.connect(this.node)
    /* It has to connect to destination or Chrome will not drive onaudioprocess.
       What is connected is the raw microphone signal, which would cause feedback -- so there must be no gain
       anywhere in between, and in practice nothing is audible (the browser does not actually play a
       ScriptProcessor's output). */
    this.node.connect(ctx.destination)

    this.node.onaudioprocess = e => {
      if (this.done || this.frame === Frame.Last) return
      this.send(e.inputBuffer.getChannelData(0), ctx.sampleRate)
    }
  }

  private send(input: Float32Array, rate: number) {
    if (this.ws?.readyState !== WebSocket.OPEN) return

    const pcm = toPcm16(resample(input, rate, TARGET_RATE))
    const body: Record<string, unknown> = {
      data: {
        status: this.frame,
        format: `audio/L16;rate=${TARGET_RATE}`,
        encoding: 'raw',
        audio: toBase64(pcm),
      },
    }
    if (this.frame === Frame.First) {
      body.common = { app_id: this.appId }
      body.business = {
        language: this.opts.language,
        domain: 'iat',
        accent: this.opts.accent,
        vad_eos: this.opts.vadEos,
        /* Dynamic correction: iFlytek goes back and rewrites segments it has already sent ("I want to sell" ->
           "I want to buy"). With it on, pgs/rg must be handled -- see receive(). With it off, one misrecognised
           word can never be corrected. */
        dwa: 'wpgs',
      }
      this.frame = Frame.Middle
    }
    this.ws.send(JSON.stringify(body))
  }

  private receive(raw: string) {
    let res: IatResponse
    try {
      res = JSON.parse(raw) as IatResponse
    } catch {
      return
    }

    if (res.code !== 0) {
      this.fail(new VoiceError('service', `Voice service error ${res.code}: ${res.message ?? ''}`))
      return
    }

    const r = res.data?.result
    if (r?.ws) {
      let piece = ''
      for (const w of r.ws) piece += w.cw.map(c => c.w).join('')

      /* Dynamic correction: pgs=rpl means "replace the segments enclosed by rg with this one".
         An append-only implementation keeps both the before and after versions here -- which is the source of the
         "say one sentence, get one and a half back" effect. */
      if (r.pgs === 'rpl' && r.rg) {
        const [from, to] = r.rg
        for (let i = from; i <= to; i++) this.segments.delete(i)
      }
      this.segments.set(r.sn ?? this.segments.size, piece)

      this.onResultCb?.({ text: this.text(), isFinal: res.data?.status === 2 })
    }

    /* status=2 means iFlytek has finished (VAD judged the silence long enough, or we sent the final frame).
       Nothing more will be sent after it, and keeping the connection is pointless. */
    if (res.data?.status === 2) this.stop()
  }

  private text(): string {
    return [...this.segments.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(e => e[1])
      .join('')
  }

  /**
   * Current volume, 0-1. For the waveform.
   *
   * RMS rather than peak: a peak is pinned by a single cough, after which normal speech all sits against the
   * ceiling and the waveform stops moving. The cube root is there to spread out the 0.02-0.2 band where speech
   * usually sits -- mapped linearly, speaking and not speaking differ by a couple of pixels.
   */
  level(): number {
    if (!this.analyser || !this.peek) return 0
    this.analyser.getFloatTimeDomainData(this.peek)
    let sum = 0
    for (let i = 0; i < this.peek.length; i++) {
      const v = this.peek[i] ?? 0
      sum += v * v
    }
    return Math.min(1, Math.cbrt(Math.sqrt(sum / this.peek.length)) * 1.6)
  }

  /** Stop recording. Safe to call repeatedly -- onclose triggers it again, which is guarded here. */
  stop() {
    if (this.done) return
    this.done = true

    /* The final frame has to go out before the mic is closed: close the mic first and the ScriptProcessor stops
       immediately, the last few hundred milliseconds of audio are never sent, and the trailing words are swallowed. */
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.frame = Frame.Last
      this.ws.send(
        JSON.stringify({
          data: { status: Frame.Last, format: `audio/L16;rate=${TARGET_RATE}`, encoding: 'raw', audio: '' },
        }),
      )
    }

    this.release()

    /* Give iFlytek time to send the last of the text back before closing the connection. Closing outright wastes
       the final frame -- its response never arrives. */
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      setTimeout(() => ws.close(), 1500)
    }

    this.onStopCb?.()
  }

  /** Release the microphone and audio nodes. Without explicitly stopping the mic, that red dot on the browser tab never goes out. */
  private release() {
    if (this.node) {
      this.node.onaudioprocess = null
      this.node.disconnect()
      this.node = null
    }
    this.analyser?.disconnect()
    this.analyser = null
    this.peek = null
    this.source?.disconnect()
    this.source = null
    this.stream?.getTracks().forEach(t => t.stop())
    this.stream = null
    void this.ctx?.close().catch(() => {})
    this.ctx = null
  }

  private fail(e: VoiceError) {
    this.onErrorCb?.(e)
    this.stop()
  }
}

// -- Audio conversion --

/**
 * Linear resampling to 16k.
 *
 * Only does real work on browsers like Safari that ignore sampleRate -- Chrome gives 16k already, and when
 * from===to it returns the input unchanged. Linear interpolation is sufficient for dictation: iFlytek's own
 * recognition front end processes it again, and what matters here is that the sample rate lines up, not audio quality.
 */
function resample(input: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return input
  const ratio = from / to
  const out = new Float32Array(Math.floor(input.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const at = i * ratio
    const lo = Math.floor(at)
    const a = input[lo] ?? 0
    const b = input[Math.min(lo + 1, input.length - 1)] ?? a
    out[i] = a + (b - a) * (at - lo)
  }
  return out
}

/** Float32 [-1,1] -> 16-bit little-endian PCM. Positive and negative full scale are asymmetric, so they are scaled separately to avoid clipping. */
function toPcm16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i] ?? 0))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Base64 in chunks. apply over a whole buffer blows the call stack on long audio. */
function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

// -- Shapes returned by iFlytek --

interface IatResponse {
  code: number
  message?: string
  data?: {
    status: number
    result?: {
      ws: { cw: { w: string }[] }[]
      /* Dynamic correction: pgs='apd' appends, 'rpl' replaces the sn range enclosed by rg */
      pgs?: 'apd' | 'rpl'
      rg?: [number, number]
      sn?: number
    }
  }
}
