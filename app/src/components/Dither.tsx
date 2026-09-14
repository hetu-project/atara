/**
 * Dither 加载动画：4×4 的格子按有序抖动的顺序此起彼伏地亮。
 *
 * 移植自 beui.dev 的 Loader（docs/loading.md 里的 `dither` 变体）。原版用
 * motion/react + Tailwind，这里改成纯 CSS——整个动画只动 opacity，为它引一个
 * 动画库不划算，而且 CSS 动画跑在合成线程上，主线程正忙着接流式文本时也不会卡。
 */

/**
 * 4×4 Bayer 有序抖动矩阵，逐行展开。
 *
 * 它决定每一格的相位。这串数不是随便排的：Bayer 矩阵让相邻格子的值尽量拉开，
 * 所以亮起来是散点式的，不会像从左到右扫过去那样有明显的方向感——
 * 换成 0..15 顺序排就变成一道扫描线了，那是另一种动画。
 */
const BAYER_4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]

export default function Dither({
  size = 22,
  speed = 1.1,
  label = 'Atara AI is replying',
}: {
  /** 整块的边长（px）。格子和间隙都按它算。 */
  size?: number
  /** 一个完整呼吸周期的秒数。 */
  speed?: number
  label?: string
}) {
  const gap = Math.max(1, size * 0.05)
  const cell = (size - gap * 3) / 4

  return (
    <span className="dither" role="status" aria-label={label}
      style={{ gap: `${gap}px`, gridTemplateColumns: `repeat(4, ${cell}px)` }}>
      {BAYER_4.map((order, i) => (
        <i key={i} style={{
          width: cell, height: cell,
          animationDuration: `${speed}s`,
          /* 负延迟：动画从「已经跑了一段」的位置起步，所以第一帧就是稳态。
             用正延迟的话，相位靠后的格子要等将近一整个周期才第一次亮——
             而这个加载态经常只出现一两秒，那些格子从头到尾是暗的，
             看起来像是坏了几块。 */
          animationDelay: `${-(order / BAYER_4.length) * speed}s`,
        }} />
      ))}
    </span>
  )
}
