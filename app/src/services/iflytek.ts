/**
 * 科大讯飞实时语音听写（IAT）流式客户端。
 *
 * 链路：后端签一枚带时效的 WSS URL → 浏览器采麦 → 16k 单声道 PCM 转 Base64
 * 逐帧推给讯飞 → 收增量文本写回输入框。音频不过我们的后端，WSS 是浏览器
 * 直连讯飞的；后端存在的唯一理由是密钥不能出站。
 *
 * 麦克风要求安全上下文：localhost 算，别的域名必须 HTTPS。
 */

/** 一次回调。text 始终是**当前完整文本**，不是增量——调用方直接覆盖即可。 */
export interface VoiceResult {
  text: string
  isFinal: boolean
}

/** 起不来的原因分开报：这三种的处置完全不同，混成一句话没法给提示。 */
export type VoiceFailure =
  | 'unsupported' /* 浏览器不支持（没有 getUserMedia / AudioContext） */
  | 'insecure' /* 非安全上下文，浏览器根本不会给麦克风 */
  | 'denied' /* 用户拒绝了麦克风权限 */
  | 'no-token' /* 后端没配密钥或签名接口挂了 */
  | 'service' /* 讯飞返回了错误码 */
  | 'network' /* WebSocket 断了 */

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

/** 采到的每一帧都会推一次；4096 帧 @16k 约 256ms 一帧。 */
const FRAME = 4096
const TARGET_RATE = 16000

/** 讯飞要的帧状态：0 首帧（必须带 common+business）、1 中间帧、2 尾帧。 */
const enum Frame {
  First = 0,
  Middle = 1,
  Last = 2,
}

export interface VoiceOptions {
  /** 讯飞的语种。中文 zh_cn，英文 en_us。 */
  language?: string
  accent?: string
  /** 静音多久算说完（毫秒）。太短会把人说话中间的停顿当结束。 */
  vadEos?: number
}

export class IFlytekStreamer {
  private ws: WebSocket | null = null
  private ctx: AudioContext | null = null
  private stream: MediaStream | null = null
  private node: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null
  private analyser: AnalyserNode | null = null
  /* 显式 <ArrayBuffer>：getFloatTimeDomainData 不收可能指向 SharedArrayBuffer 的视图。 */
  private peek: Float32Array<ArrayBuffer> | null = null

  private frame: Frame = Frame.First
  private appId = ''
  private opts: Required<VoiceOptions>

  /* 已收到的最终片段，按讯飞的 sn 顺序存。动态修正要能回头改某一段，
     所以不能只留一个拼好的字符串。 */
  private segments = new Map<number, string>()
  /* stop() 会被 onclose 再触发一次，用它挡掉重入。 */
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

  /* 回调不在 stop() 里清空：一个实例可能被 start 两次，清了第二次就静默失败。
     实例用完即弃，回调跟着实例一起被回收。 */
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
   * 开录。getSignedUrl 每次都真去后端拿——签名是短时的，缓存复用会握手失败。
   *
   * 先要麦克风再连 WebSocket：顺序反过来的话，用户在权限弹窗上犹豫的十几秒里
   * 连接就空着，讯飞那边会先超时断掉。
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
    /* 权限弹窗可能挂很久，这期间用户完全可能再点一次把它关掉。那时 stop()
       已经跑完了，如果这里照旧往下接管线，麦克风就再也没人去关——标签页上
       那个红点亮到关页面为止。每个 await 之后都要重新确认自己还该活着。 */
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

    /* sampleRate 是**请求**不是保证：Chrome 会照办，Safari 忽略它并给出硬件速率。
       所以下面一律按 ctx.sampleRate 重采样到 16k，不假设拿到的就是 16k——
       按 44.1k 的数据冒充 16k 发过去，讯飞收到的是一段听不懂的慢放。 */
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
        /* 握手阶段失败时 onopen 还没跑，resolve 不会发生——必须 reject，
           否则 start() 永远挂着，界面停在「正在听」。 */
        const err = new VoiceError('network', 'Lost connection to the voice service')
        reject(err)
        this.fail(err)
      }
      ws.onclose = () => this.stop()
    })
  }

  /** 接上音频管线开始推流。 */
  private pump() {
    const ctx = this.ctx
    const stream = this.stream
    if (!ctx || !stream) return

    this.source = ctx.createMediaStreamSource(stream)

    /* 单独一条支路做音量表。不复用下面 ScriptProcessor 的帧是因为那边
       4096 采样 @16k ≈ 256ms 才一帧，一秒四次的波形是抽搐不是呼吸。
       AnalyserNode 让界面按自己的节奏（rAF）去读，两件事各走各的。 */
    this.analyser = ctx.createAnalyser()
    this.analyser.fftSize = 1024
    this.analyser.smoothingTimeConstant = 0.5
    this.peek = new Float32Array(this.analyser.fftSize)
    this.source.connect(this.analyser)

    /* ScriptProcessorNode 已废弃，AudioWorklet 是正路。这里仍用它是因为
       Worklet 要单独一个模块文件、构建产物里多一条入口，而这一版只要把
       链路跑通。换 Worklet 时只有这一个方法要改。 */
    this.node = ctx.createScriptProcessor(FRAME, 1, 1)
    this.source.connect(this.node)
    /* 必须连到 destination，否则 Chrome 不会驱动 onaudioprocess。
       接的是原始麦克风信号，会造成回授——所以中间不能有任何增益，
       实际听不到（浏览器不会把 ScriptProcessor 的输出真的放出来）。 */
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
        /* 动态修正：讯飞会回头改写已经发过的片段（「我要卖」→「我要买」）。
           开了之后必须处理 pgs/rg，见 receive()。不开的话说错一个字
           就再也改不回来了。 */
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

      /* 动态修正：pgs=rpl 表示「把 rg 圈住的那几段换成这一段」。
         只做追加的实现在这里会把改写前后两份都留下——这就是那种
         「说一句话出来一句半」的现象。 */
      if (r.pgs === 'rpl' && r.rg) {
        const [from, to] = r.rg
        for (let i = from; i <= to; i++) this.segments.delete(i)
      }
      this.segments.set(r.sn ?? this.segments.size, piece)

      this.onResultCb?.({ text: this.text(), isFinal: res.data?.status === 2 })
    }

    /* status=2 是讯飞说完了（VAD 判定静音够久，或我们发了尾帧）。
       它之后不会再发任何东西，连接留着也没用。 */
    if (res.data?.status === 2) this.stop()
  }

  private text(): string {
    return [...this.segments.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(e => e[1])
      .join('')
  }

  /**
   * 当前音量，0–1。给波形用。
   *
   * 取 RMS 而不是峰值：峰值被一次咳嗽就顶满，之后正常说话全贴着顶，
   * 波形反而不动了。开三次方是为了把人声常处的 0.02–0.2 这一段拉开——
   * 线性映射的话说话和不说话在视觉上差不了几个像素。
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

  /** 停录。可重复调用——onclose 会再触发一次，这里挡掉。 */
  stop() {
    if (this.done) return
    this.done = true

    /* 尾帧要在关麦之前发：先关麦的话 ScriptProcessor 立刻停，
       最后那几百毫秒的音频永远送不出去，尾字会被吞。 */
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.frame = Frame.Last
      this.ws.send(
        JSON.stringify({
          data: { status: Frame.Last, format: `audio/L16;rate=${TARGET_RATE}`, encoding: 'raw', audio: '' },
        }),
      )
    }

    this.release()

    /* 给讯飞留时间把最后一段文字发回来再关连接。直接 close 的话
       尾帧白发了——收不到它的回应。 */
    const ws = this.ws
    this.ws = null
    if (ws) {
      ws.onclose = null
      setTimeout(() => ws.close(), 1500)
    }

    this.onStopCb?.()
  }

  /** 放开麦克风和音频节点。麦克风不显式 stop，浏览器标签页上那个红点不会灭。 */
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

// ── 音频转换 ──

/**
 * 线性重采样到 16k。
 *
 * 只在 Safari 那类忽略 sampleRate 的浏览器上真的做事——Chrome 给的就是 16k，
 * from===to 时直接原样返回。线性插值对语音听写足够：讯飞自己的识别前端
 * 会再做一次处理，这里要的是采样率对得上，不是音质。
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

/** Float32 [-1,1] → 16 位小端 PCM。正负满量程不对称，分开缩放不然会削顶。 */
function toPcm16(f: Float32Array): Int16Array {
  const out = new Int16Array(f.length)
  for (let i = 0; i < f.length; i++) {
    const s = Math.max(-1, Math.min(1, f[i] ?? 0))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** 分块转 Base64。整段 apply 在长音频上会爆调用栈。 */
function toBase64(pcm: Int16Array): string {
  const bytes = new Uint8Array(pcm.buffer)
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

// ── 讯飞返回的形状 ──

interface IatResponse {
  code: number
  message?: string
  data?: {
    status: number
    result?: {
      ws: { cw: { w: string }[] }[]
      /* 动态修正：pgs='apd' 追加、'rpl' 替换 rg 圈住的 sn 区间 */
      pgs?: 'apd' | 'rpl'
      rg?: [number, number]
      sn?: number
    }
  }
}
