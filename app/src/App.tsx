import { useEffect, useState } from 'react'
import RightPanel from './components/RightPanel'
import Sidebar from './components/Sidebar'
import Home from './views/Home'
import Discover from './views/Discover'
import Money from './views/Money'
import OrderDetail from './views/OrderDetail'
import People from './views/People'
import Wallet from './views/Wallet'
import { useIdentity } from './hooks/useIdentity'
import { go, useRoute } from './hooks/useRoute'

/**
 * 三栏骨架，结构与 console.html 的 <main> 一致：
 * #left 导航 / #mid 唯一工作面 / #right 评估与订单状态。
 *
 * 样式表用的是 id 选择器，所以这里的 id 不是装饰——改名就没样式了。
 */
export default function App() {
  const { handle } = useIdentity()
  const { route } = useRoute()
  const [folded, setFolded] = useState(
    () => { try { return localStorage.getItem('atara-fold') === '1' } catch { return false } })

  useEffect(() => {
    document.documentElement.classList.toggle('lfolded', folded)
    try { localStorage.setItem('atara-fold', folded ? '1' : '0') } catch { /* 隐身窗口 */ }
  }, [folded])

  return (
    <main>
      <Sidebar route={route} go={go} identity={handle} folded={folded} onFold={setFolded} />

      <section id="mid">
        {route.view === 'home' && <Home identity={handle} />}
        {route.view === 'discover' && (
          <div className="view on" id="v-market"><div className="vbody"><Discover identity={handle} /></div></div>
        )}
        {route.view === 'contacts' && (
          <div className="view on" id="v-contacts"><div className="vbody">
            <People identity={handle} onOpenOrder={id => go({ view: 'order', id })} />
          </div></div>
        )}
        {route.view === 'payments' && (
          <div className="view on" id="v-recs"><div className="vbody"><Money identity={handle} /></div></div>
        )}
        {route.view === 'account' && (
          <div className="view on" id="v-rules"><div className="vbody" id="rulesbody">
            <Wallet identity={handle} />
          </div></div>
        )}
        {route.view === 'order' && (
          <div className="view on"><div className="vbody">
            <OrderDetail id={route.id} onBack={() => go({ view: 'payments' })} />
          </div></div>
        )}
        {route.view === 'thread' && (
          <div className="view on"><div className="vbody">
            <People identity={handle} onOpenOrder={id => go({ view: 'order', id })} />
          </div></div>
        )}
      </section>

      <RightPanel identity={handle} onOpen={id => go({ view: 'order', id })} />
    </main>
  )
}
