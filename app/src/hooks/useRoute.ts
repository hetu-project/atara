import { useEffect, useState } from 'react'

export type Route =
  | { view: 'market' }
  | { view: 'tasks' }
  | { view: 'discover' }
  | { view: 'people' }
  | { view: 'money' }
  | { view: 'account' }
  | { view: 'order'; id: string }

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
  if (head === 'tasks') return { view: 'tasks' }
  if (head === 'discover') return { view: 'discover' }
  if (head === 'people') return { view: 'people' }
  if (head === 'money') return { view: 'money' }
  if (head === 'account') return { view: 'account' }
  return { view: 'market' }
}

export function go(r: Route): void {
  location.hash = r.view === 'order' ? `/order/${r.id}` : `/${r.view}`
}
