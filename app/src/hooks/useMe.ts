import { useEffect, useState } from 'react'
import * as ep from '../api/endpoints'
import { AUTH_CHANGED, PROFILE_CHANGED } from '../api/client'
import type { User } from '../api/types'

/**
 * 当前账户，**全应用只取一次**。
 *
 * 为什么不是每个组件各 useApi 一次：一条会话里有十四张工单卡，每张卡都想知道
 * 这个人用的是托管钱包还是外部钱包——那是这个**人**的属性，不是这一单的。
 * 各问各的结果是十四个一模一样的请求（开发模式下 StrictMode 双挂载还要翻倍），
 * 而浏览器对同一个域名只开六条连接、SSE 那条还永久占着一条。于是它们排起队，
 * 排在后面的那个真正要紧的请求——会话本身——被顶到了两秒半。
 *
 * 后端答那一下只要几毫秒。这件事从头到尾都不是后端慢。
 *
 * 缓存活在模块里而不是 context 里，因为它跨路由、跨组件树，而且独立页面
 * （/order/:id）也要用。换人或改了资料就作废：地址和钱包类型都会变，
 * 而一份过期的答案会让界面对着上一个账户的属性做判断。
 */

let cached: User | null = null
let inflight: Promise<User> | null = null
const subs = new Set<(u: User | null) => void>()

function load(): Promise<User> {
  /* 同一时刻只有一个请求在飞。十四张卡同时挂载时它们拿到的是同一个 promise，
     这正是把 14 个请求收成 1 个的地方。 */
  if (!inflight) {
    inflight = ep.me()
      .then(u => {
        cached = u
        subs.forEach(f => f(u))
        return u
      })
      .finally(() => { inflight = null })
  }
  return inflight
}

function invalidate() {
  cached = null
  // 还有人在看就立刻重取；没人看就等下一个订阅者自己去取。
  if (subs.size) void load().catch(() => {})
  else subs.forEach(f => f(null))
}

addEventListener(AUTH_CHANGED, invalidate)
addEventListener(PROFILE_CHANGED, invalidate)

/** 当前账户。第一个调用方触发请求，其余的等同一个。 */
export function useMe(): User | null {
  const [u, setU] = useState<User | null>(cached)

  useEffect(() => {
    subs.add(setU)
    if (cached) setU(cached)
    else void load().catch(() => { /* 取不到就是 null，调用方各自兜底 */ })
    return () => { subs.delete(setU) }
  }, [])

  return u
}
