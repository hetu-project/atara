import { useCallback, useState } from 'react'
import { getIdentity, setIdentity } from '../api/client'

const SIGNED = 'atara-signed'

/**
 * 当前身份与登录态。后端鉴权是 mock，X-Atara-User 头直接注入身份。
 *
 * 「已登录」在这里就是「选定了一个身份」——后端没有会话，
 * 所以这个标记只决定界面开不开个人区，不是安全边界。真正的凭证在链上：
 * 动钱要 Passkey 签名，那一步后端会验。
 *
 * 演示一笔交易必须能切到对手方视角——同一张工单，两方看到的 phase 是互补的，
 * 不能切身份就看不到这件事。种子里可用的 handle 见 SEED_HANDLES。
 */
export function useIdentity() {
  // ?as=<handle> 覆盖当前身份并写进 localStorage，同时视为已登录。
  // 演示台的必需品：开两个窗口各带一个 as，就能同时盯住交易的两侧。
  const [handle, setHandle] = useState(() => {
    const as = new URLSearchParams(location.search).get('as')
    if (as) {
      setIdentity(as)
      try { sessionStorage.setItem(SIGNED, '1') } catch { /* 隐身窗口 */ }
      return as
    }
    return getIdentity()
  })
  const [signed, setSigned] = useState(() => {
    if (new URLSearchParams(location.search).get('as')) return true
    try { return sessionStorage.getItem(SIGNED) === '1' } catch { return false }
  })

  const change = useCallback((h: string) => {
    setIdentity(h)
    setHandle(h)
  }, [])

  /** 登录落座：记住身份，并把个人区打开。 */
  const signIn = useCallback((h: string) => {
    setIdentity(h)
    setHandle(h)
    try { sessionStorage.setItem(SIGNED, '1') } catch { /* 隐身窗口 */ }
    setSigned(true)
  }, [])

  const signOut = useCallback(() => {
    try { sessionStorage.removeItem(SIGNED) } catch { /* 隐身窗口 */ }
    setSigned(false)
  }, [])

  return { handle, signed, change, signIn, signOut }
}

/** 种子数据里的身份。UserByHandle 支持按 display_name 匹配。 */
export const SEED_HANDLES = [
  { handle: 'demo', label: 'Demo（你）' },
  { handle: 'CrabWalk Trading', label: 'CrabWalk Trading（做市方 · 卖 USDT/CNY）' },
  { handle: 'Lotus Capital', label: 'Lotus Capital（做市方 · 买 USDT/CNY）' },
  { handle: 'Golden Gate', label: 'Golden Gate（做市方）' },
  { handle: 'reviewer', label: 'Reviewer（审核员）' },
]
