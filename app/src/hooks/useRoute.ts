import { useEffect, useState } from 'react'

/* 视图与左栏导航一一对应（见 console.html 的 #left）。
   home 是默认态：新建一单，不是某个列表。 */
export type Route =
  | { view: 'home' }
  | { view: 'discover' }
  | { view: 'contacts' }
  | { view: 'payments' }
  | { view: 'account' }
  /* 设置是账户页的另一种模式，不是另一页——参照的 openAcct('settings') 就是
     切同一个视图的 ACCT_MODE。给它一条自己的路由是为了能直接链过去、
     刷新之后还停在这儿。 */
  | { view: 'settings' }
  | { view: 'order'; id: string }
  | { view: 'thread'; peer: string }

/**
 * 哈希路由。刷新不丢页、浏览器后退可用、工单可深链分享。
 * 不引 react-router——只有四条路径，一个 hashchange 监听就够了。
 */
export function useRoute() {
  const [route, setRoute] = useState<Route>(parse)

  useEffect(() => {
    const on = () => setRoute(parse())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])

  return { route, go }
}

function parse(): Route {
  const h = location.hash.replace(/^#\/?/, '')
  const [head, id] = h.split('/')
  if (head === 'order' && id) return { view: 'order', id }
  if (head === 'thread' && id) return { view: 'thread', peer: decodeURIComponent(id) }
  if (head === 'discover') return { view: 'discover' }
  if (head === 'contacts') return { view: 'contacts' }
  if (head === 'payments') return { view: 'payments' }
  if (head === 'account') return { view: 'account' }
  if (head === 'settings') return { view: 'settings' }
  return { view: 'home' }
}

export function go(r: Route): void {
  location.hash =
    r.view === 'order' ? `/order/${r.id}`
    : r.view === 'thread' ? `/thread/${encodeURIComponent(r.peer)}`
    : `/${r.view}`
}
