import { Component, type ErrorInfo, type ReactNode } from 'react'

/**
 * 兜住渲染期的异常。
 *
 * 起因是 Privy 在明文 HTTP 下初始化时直接抛异常，整棵树挂掉，
 * 屏幕全黑、界面上一个字都没有——只有打开控制台才知道发生了什么。
 * 演示的时候这是最糟的失败方式：看的人只会以为整个系统坏了。
 *
 * 所以不管以后是谁抛的，至少把原因显示出来。
 */
export default class Boundary extends Component<
  { children: ReactNode },
  { msg: string; where: string }
> {
  state = { msg: '', where: '' }

  static getDerivedStateFromError(e: unknown) {
    return { msg: e instanceof Error ? e.message : String(e) }
  }

  /**
   * 记下是**哪个组件**抛的。
   *
   * 光有一句 message 常常不够用，最典型的就是 "Rendered fewer hooks than
   * expected"：它报的是 hook 数量对不上，而真正的原因往往是另一个 hook 的
   * 回调在渲染中途抛了——那条真错误被这一条盖住了。没有组件栈的时候，
   * 唯一的线索是一句放之四海皆准的话，只能靠猜。
   *
   * 也进一次 console.error：屏幕上那份是给人看的，控制台那份带完整堆栈，
   * 是给来查的人看的。
   */
  componentDidCatch(err: unknown, info: ErrorInfo) {
    console.error('Boundary caught:', err, info.componentStack)
    this.setState({ where: (info.componentStack ?? '').trim() })
  }

  render() {
    if (!this.state.msg) return this.props.children
    const box = {
      background: '#1b1c21', border: '1px solid #33343a', borderRadius: 8,
      padding: 16, overflowX: 'auto' as const, fontSize: 13,
      whiteSpace: 'pre-wrap' as const, wordBreak: 'break-word' as const,
    }
    return (
      <div style={{
        padding: '48px 32px', maxWidth: 640, margin: '0 auto',
        fontFamily: 'ui-sans-serif, system-ui', color: '#f4f4f5',
      }}>
        <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>控制台没能启动</h1>
        <p style={{ color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 16px' }}>
          页面在初始化时抛了异常，下面是原因。刷新通常没用——多半是配置问题。
        </p>
        <pre style={{ ...box, color: '#f87171' }}>{this.state.msg}</pre>
        {this.state.where && (
          <>
            {/* 组件栈是最上面那几行就够用了——再往下是 Provider 和布局容器，
                每次崩溃都一样，对判断「是谁坏了」没有帮助。完整的那份在
                浏览器控制台里。 */}
            <p style={{ color: '#a1a1aa', margin: '16px 0 8px', fontSize: 13 }}>
              抛在这里（完整堆栈见浏览器控制台）：
            </p>
            <pre style={{ ...box, color: '#a1a1aa' }}>
              {this.state.where.split('\n').slice(0, 8).join('\n')}
            </pre>
          </>
        )}
      </div>
    )
  }
}
