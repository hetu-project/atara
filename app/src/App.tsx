import { useEffect, useState } from 'react'
import RightPanel from './components/RightPanel'
import Gate from './components/Gate'
import Sidebar from './components/Sidebar'
import Home from './views/Home'
import Contacts from './views/Contacts'
import Thread from './views/Thread'
import Payments from './views/Payments'
import Pool from './views/Pool'
import OrderDetail from './views/OrderDetail'
import Account from './views/Account'
import { AssessmentProvider } from './hooks/useAssessment'
import { useIdentity } from './hooks/useIdentity'
import { go, useRoute } from './hooks/useRoute'

/**
 * 三栏骨架，结构与 console.html 的 <main> 一致：
 * #left 导航 / #mid 唯一工作面 / #right 评估与订单状态。
 *
 * 样式表用的是 id 选择器，所以这里的 id 不是装饰——改名就没样式了。
 */
export default function App() {
  const { handle, signed, signIn, signOut } = useIdentity()
  const [gate, setGate] = useState(false)
  const { route } = useRoute()
  const [folded, setFolded] = useState(
    () => { try { return localStorage.getItem('atara-fold') === '1' } catch { return false } })

  /* 未登录不是白屏：大厅照常渲染，个人区（会话列表、右栏）收起，
     动手那一下才弹登录门。CSS 认的是 :root[data-locked]。 */
  useEffect(() => {
    if (signed) delete document.documentElement.dataset.locked
    else document.documentElement.dataset.locked = '1'
  }, [signed])

  useEffect(() => {
    document.documentElement.classList.toggle('lfolded', folded)
    try { localStorage.setItem('atara-fold', folded ? '1' : '0') } catch { /* 隐身窗口 */ }
  }, [folded])

  return (
    <AssessmentProvider>
    <main>
      <Sidebar route={route} go={go} identity={handle} folded={folded} onFold={setFolded}
        signed={signed} onSignIn={() => setGate(true)}
        onSignOut={() => { signOut(); go({ view: 'discover' }) }} />

      <section id="mid">
        {/* 未登录的起点是市场：能看的东西在这儿，下单页留给登录后 */}
        {route.view === 'home' && (signed
          ? <Home identity={handle} />
          : <Pool identity={handle} onNeedSignIn={() => setGate(true)} />)}
        {route.view === 'discover' && (
          <Pool identity={handle} onNeedSignIn={signed ? undefined : () => setGate(true)} />
        )}
        {route.view === 'contacts' && <Contacts identity={handle} />}
        {route.view === 'payments' && <Payments identity={handle} />}
        {route.view === 'account' && <Account identity={handle} />}
        {route.view === 'order' && (
          <div className="view on"><div className="vbody">
            <OrderDetail id={route.id} onBack={() => go({ view: 'payments' })} />
          </div></div>
        )}
        {route.view === 'thread' && <Thread identity={handle} peer={route.peer} />}
      </section>

      <RightPanel identity={handle} onOpen={id => go({ view: 'order', id })} />

      <Gate open={gate} onClose={() => setGate(false)}
        onDone={addr => { signIn(addr); setGate(false) }} />
    </main>
    </AssessmentProvider>
  )
}
