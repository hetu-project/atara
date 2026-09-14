import { useEffect, useRef } from 'react'
import type { IFlytekStreamer } from '../services/iflytek'

/** 波形柱数。够密才像波形，太密在 400px 宽的手机上会挤成一块灰。 */
const BARS = 28

/**
 * 录音中的那条胶囊：波形 + 取消 + 完成。
 *
 * 波形是**真实音量**，不是循环动画。差别在麦克风坏了、系统静音了、
 * 或者根本没对着说的时候——假动画照跳，真波形是平的，一眼看得出来。
 */
export default function VoiceBar({
  streamer,
  onCancel,
  onConfirm,
}: {
  streamer: IFlytekStreamer
  onCancel: () => void
  onConfirm: () => void
}) {
  const wave = useRef<HTMLDivElement>(null)

  useEffect(() => {
    /* 音量直接写进 DOM，不进 state：60fps 的 setState 会把整棵输入框
       每秒重渲染六十次，而变的只是 28 根柱子的高度。 */
    const bars = Array.from(wave.current?.children ?? []) as HTMLElement[]
    /* 右进左出的滚动历史。只留一个数组，每帧整体左移一格。 */
    const hist = new Array<number>(BARS).fill(0)
    let raf = 0
    let last = 0

    const tick = (t: number) => {
      raf = requestAnimationFrame(tick)
      /* 屏幕是 120Hz 也只走 ~24 格/秒：每帧都推一格的话，波形快得看不出
         哪一下对应哪个字。 */
      if (t - last < 42) return
      last = t

      hist.shift()
      hist.push(streamer.level())
      for (let i = 0; i < bars.length; i++) {
        const b = bars[i]
        if (b) b.style.transform = `scaleY(${0.08 + (hist[i] ?? 0) * 0.92})`
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [streamer])

  return (
    <div className="vrec" role="group" aria-label="Recording">
      {/* 波形是装饰：它说的事（在录音）已经由下面两颗按钮的存在说清楚了，
          读屏再念一遍 28 根柱子只是噪音。 */}
      <div className="vwave" ref={wave} aria-hidden="true">
        {Array.from({ length: BARS }, (_, i) => (
          <i key={i} />
        ))}
      </div>
      <button className="vx" title="Cancel" aria-label="Cancel voice input" onClick={onCancel}>
        <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor"
          strokeWidth="1.6" strokeLinecap="round">
          <path d="M4 4l8 8M12 4l-8 8" />
        </svg>
      </button>
      <button className="vok" title="Done" aria-label="Finish voice input" onClick={onConfirm}>
        <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor"
          strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
          <path d="M3.5 8.5l3 3 6-6.5" />
        </svg>
      </button>
    </div>
  )
}
