import { useEffect, useRef, useState } from 'react'

/**
 * 数字滚动。余额变了不是瞬间跳过去，而是滚上去。
 *
 * 为什么值得做：这几个数变化的那一刻，恰恰是用户最想确认「刚才那笔成了吗」
 * 的时刻。硬切过去的话，没盯着看的人根本不知道它变过——而滚动本身就是
 * 「这个数刚刚动了」的说明。
 *
 * 首次渲染不滚：刚打开页面时从 0 数到三万五，那不是反馈，是表演。
 * 只有「已经显示过一个数、而它变了」才滚。
 */
export default function CountUp({
  value,
  format = n => Math.round(n).toLocaleString(),
  ms = 600,
  className,
}: {
  value: number
  /** 怎么把数变成字。默认取整加千分位。 */
  format?: (n: number) => string
  ms?: number
  className?: string
}) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  const raf = useRef(0)

  useEffect(() => {
    /* 数值没变就别动。父组件每次重渲染都跑一遍动画的话，
       轮询刷新（这个项目里到处是 3 秒轮询）会让数字一直在抖。 */
    if (from.current === value) return

    /* 系统开了减少动效就直接落位。这类偏好下「数字自己在跑」正是要避免的
       那种东西——它一直在动，读的人没法把视线停住。 */
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
      from.current = value
      setShown(value)
      return
    }

    const a = from.current
    const t0 = performance.now()
    cancelAnimationFrame(raf.current)
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms)
      /* ease-out：开头快、结尾慢。匀速的计数看起来像机器在读秒，
         而这里要的是「落定」。 */
      setShown(a + (value - a) * (1 - Math.pow(1 - k, 3)))
      if (k < 1) raf.current = requestAnimationFrame(tick)
      else from.current = value
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [value, ms])

  /* tabular-nums 让每个数位等宽：不等宽的话滚动过程中整行会左右晃，
     旁边的东西跟着抖。 */
  return <span className={className} style={{ fontVariantNumeric: 'tabular-nums' }}>{format(shown)}</span>
}
