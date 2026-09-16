import { useEffect, useRef } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import * as ep from '../api/endpoints'
import { authChanged, setTokenSource } from '../api/client'

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
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  /* 记住这一轮已经拿哪个地址换过账户了。不记的话，后端一旦报错，
     effect 会随每次 render 重试，变成一场自己打自己的请求风暴。 */
  const tried = useRef('')
  /* 正在退出。Privy 的 logout 是异步的，在它完成之前 authenticated 仍然是
     true，而我们这边的 signed 已经是 false 了——下面那个 effect 看到的正是
     「Privy 登着、本地没登」，于是立刻又把人登回来。表现就是第一次点退出
     没反应，第二次才退得掉。 */
  const signingOut = useRef(false)

  /* Hand the API client a way to read the current access token. It cannot use
     the hook itself — it is plain functions, not a component — so the getter is
     installed here rather than every call site learning about Privy.

     During render, not in an effect. Effects run child-first, so anything a
     child fetches on mount goes out before a parent's effect has run: the
     sidebar's one-shot /me left without a token, came back 401, and — useApi
     does not retry — stayed empty for the rest of the session while every later
     page loaded fine. Installing it here means it is in place before any child
     effect fires. It is idempotent and touches nothing React owns. */
  setTokenSource(() => getAccessToken())

  useEffect(() => {
    if (!ready || !authenticated || signed || signingOut.current) return
    const w = user?.wallet
    const email = user?.email?.address ?? user?.google?.email ?? ''

    /* The dedup key used to be the address, falling back to the Privy id. That
       flipped the moment the wallet landed — same session, same person, a new
       key — so the effect ran a second time and the backend, which keyed on the
       address, made a second account. The identity is the Privy id; the address
       is a fact about it that can arrive later, so it belongs in the value we
       send, not in the key that decides whether to send at all. */
    const key = user?.id
    if (!key) return
    /* Re-send when the wallet finally shows up: the backend matches on the id
       and writes the address onto the same account. */
    const stamp = key + '|' + (w?.address ?? '')
    if (tried.current === stamp) return

    /* 登录方式如实上报，不要拿 google 顶替 twitter——login_method 是要
       写进账户表的，糊弄一下，以后查「这个人当初怎么进来的」就查不出来了。 */
    const method = w && w.walletClientType !== 'privy' ? 'wallet'
      : user?.google ? 'google'
      : user?.twitter ? 'twitter'
      : 'email'

    /* An external wallet must bring its own address — we never hold its key, so
       there is nothing to provision later. Every other method can sign in
       without one: the account is created with no wallet, reads and chats
       normally, and refuses anything that moves money until Privy provisions
       one. That beats the old behaviour of inventing an address from the email,
       which looked like an account but was a place funds went to die. */
    if (!w?.address && method === 'wallet') return
    tried.current = stamp

    void ep.connect({
      method,
      privy_id: user.id,
      address: w?.address,
      email,
      name: user?.google?.name ?? user?.twitter?.username ?? '',
    }).then(r => {
      signIn(r.address)
      /* Now, not before: this is the first moment a token is guaranteed to
         resolve to an account. Anything that fetched during the sign-in and got
         a 401 refetches here. */
      authChanged()
    }).catch(() => { tried.current = '' })
  }, [ready, authenticated, user, signed, signIn])

  /* 登出要两边一起清：只清我们这边，Privy 的会话还在，
     下次点登录会直接静默登回来，看着像退不出去。
     
     去重键要等 Privy 真的退完再清。提前清掉的话，上面那个 effect 在
     「Privy 还登着、本地已登出」的空档里就没有任何东西拦得住它，会当场
     把人登回来——第一次点退出没反应就是这么来的。 */
  const signOutAll = (localSignOut: () => void) => {
    signingOut.current = true
    localSignOut()
    /* Announce it immediately, not after Privy finishes: the screen is already
       showing the previous account's balances and orders, and those should stop
       being displayed the moment the person asked to leave. */
    authChanged()
    void logout().finally(() => {
      tried.current = ''
      signingOut.current = false
      // Again once the session is really gone, so anything that refetched during
      // the wind-down and still succeeded gets asked one more time.
      authChanged()
    })
  }

  return { ready, login, signOutAll }
}
