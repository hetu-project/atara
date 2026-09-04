import { useEffect, useRef } from 'react'
import { RISK_AGENTS } from './agents'
import { consensusNet, consensusRing } from './rings'

/**
 * 共识环。空闲态就是一圈灰刻度——「还没开始」和「0 分」看起来必须不一样，
 * 所以空闲时不给起跑延时，环只画不扫。
 *
 * runId 是重建的唯一依据：环自己会逐扇区点亮并把分数走到终值，
 * 每落一票就重建一次会把动画打回开头，分数永远停在中间值。
 */
export function Ring({
  score = 0, runId, stepMs = 620,
}: { score?: number; runId?: string; stepMs?: number }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    if (!ref.current) return
    consensusRing(ref.current, RISK_AGENTS, runId ? 0 : null, stepMs, score, null)
    // score 刻意不进依赖：它在动画期间会一路变到终值，进依赖就等于每帧重建
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId])
  return (
    <canvas ref={ref} className={'arring' + (runId ? '' : ' dim')}
      width={220} height={220}
      aria-label={runId ? 'Assessment running' : 'No assessment running'} />
  )
}

/**
 * 星座。七个 agent 在轨道上慢转，不表态——「候命」看得见，
 * 比七个灰胶囊有说服力。
 */
export function Constellation() {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const c = ref.current
    const box = c?.parentElement?.parentElement   // #rs-table，星盘按这个格子定高
    if (!c || !box) return
    let built = 0
    /* 高度量实际格子：写死一个数在矮格子里会被 overflow:hidden 把底下那排球裁掉。
       挂载那一拍格子高度还是 0，量早了整张图会缩成一条——所以等布局稳定，
       并且跟着尺寸变化重建。canvas 自带的 _refit 只管宽，改高必须整张重画。 */
    const build = () => {
      const h = Math.max(150, Math.min(300, (box.clientHeight || 244) - 8))
      if (Math.abs(h - built) < 4) return
      built = h
      consensusNet(c, RISK_AGENTS, 0, 1050, null, true, h)
    }
    const ro = new ResizeObserver(build)
    ro.observe(box)
    return () => ro.disconnect()
  }, [])
  return (
    <div className="rtnetw">
      <canvas ref={ref} className="rtnet" aria-label="Seven risk agents" />
    </div>
  )
}
