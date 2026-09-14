import { useEffect, useRef, useState } from 'react'
import { ICheck, ICopy } from './icons'
import { useToast } from './Toast'

/**
 * 复制按钮：点了图标换成对勾，两秒后换回来。
 *
 * 照 beui 的 Action Swap 那套做法，但用纯 CSS——两个图标叠在一起，
 * 靠 opacity 和一点点位移交换，不需要动画库。
 *
 * 为什么必须有这个反馈：剪贴板是个看不见的地方。点完什么都不变的话，
 * 人只能去别处粘一下才知道成没成——而多数人会选择再点一次。
 *
 * 项目里原来那颗复制按钮（WalletModals 的复制地址）就是这样：
 * `onClick={() => navigator.clipboard?.writeText(addr)}`，点了毫无动静，
 * 而且 clipboard 在非安全上下文里是 undefined——那时连错都不报。
 */
export default function CopyButton({
  text,
  label = 'Copy',
  done = 'Copied',
  className = 'btn btn-secondary btn-sm btn-icon',
}: {
  text: string
  /** 按钮的无障碍名与 tooltip。 */
  label?: string
  /** 复制成功后 toast 里那句话。 */
  done?: string
  className?: string
}) {
  const [ok, setOk] = useState(false)
  const { toast } = useToast()
  const timer = useRef<number | null>(null)

  /* 卸载时清掉定时器：复制完两秒内把这块界面关掉（比如关弹窗），
     回调仍会在一个已经没了的组件上跑。 */
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = async () => {
    try {
      /* clipboard 在非安全上下文（http 的部署）里是 undefined，
         不是「调用失败」而是「根本没有这个 API」——所以要显式检查，
         否则这里抛的是 TypeError，报出去的话没人看得懂。 */
      if (!navigator.clipboard) throw new Error('needs HTTPS')
      await navigator.clipboard.writeText(text)
      setOk(true)
      toast(done)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setOk(false), 2000) as unknown as number
    } catch {
      /* 失败要说得具体。「复制失败」等于没说——人不知道是该重试还是该换个办法。 */
      toast('Could not copy — select the text and press Ctrl+C', { kind: 'err' })
    }
  }

  return (
    <button className={className + ' swapbtn' + (ok ? ' on' : '')}
      type="button" title={ok ? done : label} aria-label={label}
      onClick={() => void copy()}>
      <span className="swapa" aria-hidden><ICopy /></span>
      <span className="swapb" aria-hidden><ICheck /></span>
    </button>
  )
}
