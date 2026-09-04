import { useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import * as ep from '../api/endpoints'

/**
 * Privy 与后端账户之间的那一座桥。
 *
 * Privy 只负责证明「这个地址是他的」。开户是后端的事——所以 Privy 一登上，
 * 就拿它给的地址去 /auth/connect 换我们自己的账户，再把身份落座。
 *
 * 两种钱包要分开报给后端，因为 wallet_kind 决定额度怎么签发：
 *   外部钱包（MetaMask / Phantom / OKX / 扫码）→ ext，额度走 approve
 *   Privy 托管钱包（Google / Twitter 进来的人）→ 按登录方式报，wallet_kind 是 atara
 */
export function usePrivyAuth(signed: boolean, signIn: (address: string) => void) {
  const { ready, authenticated, user, login, logout } = usePrivy()
  /* 记住这一轮已经拿哪个地址换过账户了。不记的话，后端一旦报错，
     effect 会随每次 render 重试，变成一场自己打自己的请求风暴。 */
  const tried = useRef('')

  useEffect(() => {
    if (!ready || !authenticated || signed) return
    const w = user?.wallet
    if (!w?.address || tried.current === w.address) return
    tried.current = w.address

    const embedded = w.walletClientType === 'privy'
    const email = user?.email?.address ?? user?.google?.email ?? ''
    /* 登录方式如实上报，不要拿 google 顶替 twitter——login_method 是要
       写进账户表的，糊弄一下，以后查「这个人当初怎么进来的」就查不出来了。 */
    const method = !embedded ? 'wallet'
      : user?.google ? 'google'
      : user?.twitter ? 'twitter'
      : 'email'

    void ep.connect({
      method,
      address: w.address,
      email,
      name: user?.google?.name ?? user?.twitter?.username ?? '',
    }).then(r => signIn(r.address))
      .catch(() => { tried.current = '' })
  }, [ready, authenticated, user, signed, signIn])

  /* 登出要两边一起清：只清我们这边，Privy 的会话还在，
     下次点登录会直接静默登回来，看着像退不出去。 */
  const signOutAll = (localSignOut: () => void) => {
    tried.current = ''
    localSignOut()
    void logout()
  }

  return { ready, login, signOutAll }
}
