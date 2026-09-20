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

/**
 * 「开一张新台面」的信号。
 *
 * 光靠 go({view:'home'}) 不够：人本来就在首页时点 New order，路由没变化，
 * Home 不会重挂，上一单留下的评估和撮合卡片就一直挂在那儿。
 * 所以侧栏那一下除了切路由，还要明确地喊一声「重新开始」。
 */
export const NEW_ORDER = 'atara:new-order'

/**
 * 「把 Atara AI 那条对话打开」的信号。
 *
 * 和 NEW_ORDER 是一对：两个入口都落在 #/home，路由分不开它们，只能各喊各的。
 * New order 收起已有的对话开一张新台面，Chats 里的 Atara AI 把它展开回来——
 * 收起的只是屏幕，服务端那份历史一直都在。
 */
export const OPEN_DESK = 'atara:open-desk'

/* 进首页时要不要展开那条对话。
 *
 * 放模块变量而不是 React state：两个入口都要在 Home 还**没挂载**的时候
 * 就表态——从别的视图点 New order，事件发出去那一刻首页还不存在，监听器
 * 收不到。事件只解决「人已经在首页」那一半，这个变量解决另一半。 */
let deskOpen = false
export const setDeskOpen = (v: boolean): void => { deskOpen = v }
export const isDeskOpen = (): boolean => deskOpen

export function go(r: Route): void {
  location.hash =
    r.view === 'order' ? `/order/${r.id}`
    : r.view === 'thread' ? `/thread/${encodeURIComponent(r.peer)}`
    : `/${r.view}`
}
