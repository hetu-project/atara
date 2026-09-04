import { Component, type ReactNode } from 'react'

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
  { msg: string }
> {
  state = { msg: '' }

  static getDerivedStateFromError(e: unknown) {
    return { msg: e instanceof Error ? e.message : String(e) }
  }

  render() {
    if (!this.state.msg) return this.props.children
    return (
      <div style={{
        padding: '48px 32px', maxWidth: 640, margin: '0 auto',
        fontFamily: 'ui-sans-serif, system-ui', color: '#f4f4f5',
      }}>
        <h1 style={{ fontSize: 20, margin: '0 0 12px' }}>控制台没能启动</h1>
        <p style={{ color: '#a1a1aa', lineHeight: 1.6, margin: '0 0 16px' }}>
          页面在初始化时抛了异常，下面是原因。刷新通常没用——多半是配置问题。
        </p>
        <pre style={{
          background: '#1b1c21', border: '1px solid #33343a', borderRadius: 8,
          padding: 16, overflowX: 'auto', fontSize: 13, color: '#f87171',
        }}>{this.state.msg}</pre>
      </div>
    )
  }
}
