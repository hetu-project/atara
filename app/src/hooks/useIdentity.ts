import { useCallback, useState } from 'react'
import { getIdentity, setIdentity } from '../api/client'

/**
 * 当前身份。后端鉴权是 mock，X-Atara-User 头直接注入身份。
 *
 * 演示一笔交易必须能切到对手方视角——同一张工单，两方看到的 phase 是互补的，
 * 不能切身份就看不到这件事。种子里可用的 handle 见 SEED_HANDLES。
 */
export function useIdentity() {
  // ?as=<handle> 覆盖当前身份并写进 localStorage。
  // 演示台的必需品：开两个窗口各带一个 as，就能同时盯住交易的两侧。
  const [handle, setHandle] = useState(() => {
    const as = new URLSearchParams(location.search).get('as')
    if (as) {
      setIdentity(as)
      return as
    }
    return getIdentity()
  })
  const change = useCallback((h: string) => {
    setIdentity(h)
    setHandle(h)
  }, [])
  return { handle, change }
}

/** 种子数据里的身份。UserByHandle 支持按 display_name 匹配。 */
export const SEED_HANDLES = [
  { handle: 'demo', label: 'Demo（你）' },
  { handle: 'CrabWalk Trading', label: 'CrabWalk Trading（做市方 · 卖 USDT/CNY）' },
  { handle: 'Lotus Capital', label: 'Lotus Capital（做市方 · 买 USDT/CNY）' },
  { handle: 'Golden Gate', label: 'Golden Gate（做市方）' },
  { handle: 'reviewer', label: 'Reviewer（审核员）' },
]
