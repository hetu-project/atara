import type { ReactNode } from 'react'
import CopyButton from './CopyButton'

/**
 * 四个原语,页面里反复出现的那几种块。
 *
 * 为什么要有这个文件:付款卡一张卡上就有八种各自定义的行——`.payrow`、
 * `.rcpick`、`.payproof`、`.paywarn`、`.payto`、`.dhead`、`.dfoot`、`.dpay`,
 * 每一种都有自己那几行 CSS,间距、字号、颜色各定各的。看着像拼出来的,
 * 因为确实是:每加一块就新写一段样式,从没停下来问「这个和上面那个是不是
 * 同一种东西」。
 *
 * 边界取自 shadcn/ui 的 Item / Input Group / Alert / Empty——不是搬代码
 * （那一套要 Radix 加 Tailwind,我们两样都没有）,是**借它给每一块起的名字**。
 * 有了名字,回执页和收款行就不会再长成两个样子。
 */

/**
 * 一行东西:左边标识、中间内容、右边动作。
 *
 * 列表里的一项长什么样,由这里定一次。回执页、收款账户、资产行都是它。
 */
export function Row({
  lead, title, sub, trail, className = '',
}: {
  lead?: ReactNode
  title: ReactNode
  /** 标题下面那行小字。没有就不占高度。 */
  sub?: ReactNode
  trail?: ReactNode
  className?: string
}) {
  return (
    <div className={'uirow ' + className}>
      {lead ? <span className="uilead">{lead}</span> : null}
      <span className="uibody">
        <span className="uititle">{title}</span>
        {sub ? <span className="uisub">{sub}</span> : null}
      </span>
      {trail ? <span className="uitrail">{trail}</span> : null}
    </div>
  )
}

/**
 * 一组要被抄走的值。
 *
 * **不画框。** 上一版给它套了一个带内分隔线的盒子,而它本来就装在 payblk
 * 里、payblk 又装在卡片里——三层边框,里面只有三个字符串,而深色主题里
 * 这三层的底色差不到一档,于是全是灰压灰。
 *
 * 层次改由留白和字号建立:标签压到 11px 大写字母、值抬到 15px,标签在
 * 值上面而不是旁边。少一层框,多一档对比。
 */
export function ValueGroup({ children }: { children: ReactNode }) {
  return <div className="uivg">{children}</div>
}

/**
 * 一个要被抄走的值:标签在上,值在下,复制键贴着值。
 *
 * 标签上置是因为值才是主角——并排时标签占掉一列固定宽度,把值挤到中间,
 * 而值是唯一要被读、被抄的东西。
 *
 * `copyText` 存在是因为**读的和抄的不总是同一个字符串**:金额读作
 * ¥14,680,抄走要是 14680——带符号带千分位的粘进银行的金额框,不是被拒
 * 就是被静默截断。
 *
 * `big` 给这一组里的主角用。一笔转账真正会抄错的是账号,它该比旁边的
 * 金额更显眼。
 */
export function Value({
  label, children, copyText, copied, note, big,
}: {
  label: string
  children: ReactNode
  /** 真正进剪贴板的那一份。默认就是显示的内容。 */
  copyText?: string
  copied?: string
  /** 值后面那个小标记,比如「必填」。 */
  note?: string
  big?: boolean
}) {
  const text = copyText ?? String(children)
  return (
    <div className={'uival' + (big ? ' big' : '')}>
      <span className="uivk">{label}{note ? <em>{note}</em> : null}</span>
      <span className="uivrow">
        <span className="uivv">{children}</span>
        <CopyButton text={text} label={`Copy ${label.toLowerCase()}`}
          done={copied ?? `${label} copied`} className="uivc" />
      </span>
    </div>
  )
}

/**
 * 一句要被读到的话,按分量分三档。
 *
 * `warn` 那档是给「不做会怎样」用的。它原来跟普通说明一个字号,而它是
 * 整张卡最重的一句——代价要以代价的分量出现。
 */
export function Note({
  kind = 'info', children,
}: { kind?: 'info' | 'warn' | 'neg' | 'ok'; children: ReactNode }) {
  const icon = { info: 'ⓘ', warn: '⚠', neg: '⚠', ok: '✓' }[kind]
  return (
    <p className={'uinote uinote-' + kind}>
      <span className="uiicon" aria-hidden>{icon}</span>
      <span>{children}</span>
    </p>
  )
}

/**
 * 该有东西而没有的地方。
 *
 * 留白会被读成「还在加载」,而这两件事要人做的动作正好相反:一个是等,
 * 一个是别等了、去问。所以缺了什么、接下来该干什么,都要写出来。
 */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="uiempty">
      <b>{title}</b>
      {children ? <span>{children}</span> : null}
    </div>
  )
}
