import { useState } from 'react'

/**
 * 可过渡的折叠块。
 *
 * 替掉原生 `<details>`：那个是瞬间弹开的，没有高度过渡——一段 25 个字段的
 * 提交内容「啪」地展开，下面的东西全部瞬移，读的人要重新找位置。
 *
 * 用 grid-template-rows 从 0fr 到 1fr 撑开，而不是 max-height 猜一个值：
 * max-height 要么猜小了裁掉内容，要么猜大了让收起动画前半段是空走的。
 * 这个写法对任意高度都准，代价是多一层包裹元素。
 */
export default function Fold({
  summary,
  children,
  className = '',
  defaultOpen = false,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  className?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={'fold ' + className + (open ? ' on' : '')}>
      <button type="button" className="foldsum" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <span className="foldmk" aria-hidden />
        {summary}
      </button>
      {/* 两层是必须的：外层动 grid-template-rows，内层 overflow:hidden 把
          超出的部分裁掉。合成一层的话内容会在收起过程中溢出来。 */}
      <div className="foldwrap">
        <div className="foldin">{children}</div>
      </div>
    </div>
  )
}
