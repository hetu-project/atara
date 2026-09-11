import { useEffect, useState } from 'react'
import RightPanel from './components/RightPanel'
import Sidebar from './components/Sidebar'
import Home from './views/Home'
import Contacts from './views/Contacts'
import Thread from './views/Thread'
import Payments from './views/Payments'
import Pool from './views/Pool'
import OrderDetail from './views/OrderDetail'
import Account from './views/Account'
import Settings from './views/Settings'
import { IDENTITY_GONE } from './api/client'
import { IPanel } from './components/icons'
import { LockScreen, PwSetup, useSessionLock } from './components/SessionLock'
import { AssessmentProvider } from './hooks/useAssessment'
import { KycProvider } from './hooks/useKycGate'
import { useIdentity } from './hooks/useIdentity'
import { usePrivy } from '@privy-io/react-auth'
import { usePrivyAuth } from './hooks/usePrivyAuth'
import { go, useRoute } from './hooks/useRoute'

/**
 * 三栏骨架，结构与 console.html 的 <main> 一致：
 * #left 导航 / #mid 唯一工作面 / #right 评估与订单状态。
 *
 * 样式表用的是 id 选择器，所以这里的 id 不是装饰——改名就没样式了。
 */
export default function App() {
  const { handle, signed, signIn, signOut } = useIdentity()
  const { login, signOutAll } = usePrivyAuth(signed, signIn)
  const { route } = useRoute()
  /* 右栏是用户自己收起来的——和「这个视图本来就没有右栏」(rout) 分开记，
     否则从 Discover 切回新建单，右栏会莫名其妙地不见。 */
  const [rfold, setRfold] = useState(false)
  /* 会话锁。密码只解开这个界面，不批准任何东西——转账和额度永远走钱包
     那一侧的签名。没设过密码就先带他去设，设好再替他锁上，那一下的意图不丢。 */
  /* 有 passkey 就不必再设密码：锁上之后那把钥匙能打开它。 */
  const { user: privyUser } = usePrivy()
  const hasPasskey = (privyUser?.linkedAccounts ?? []).some(a => a.type === 'passkey')
  const lk = useSessionLock(signed, hasPasskey)
  const [folded, setFolded] = useState(
    () => { try { return localStorage.getItem('atara-left') === '1' } catch { return false } })

  /* 后端换过库、或账户被删之后，本机存的身份就指向一个不存在的人。
     那时所有请求都是 401——退回未登录并弹门，而不是让界面一直重试。 */
  useEffect(() => {
    const gone = () => { signOutAll(signOut); login() }
    addEventListener(IDENTITY_GONE, gone)
    return () => removeEventListener(IDENTITY_GONE, gone)
  }, [signOut, signOutAll, login])

  /* 未登录不是白屏：大厅照常渲染，个人区（会话列表、右栏）收起，
     动手那一下才弹登录门。CSS 认的是 :root[data-locked]。 */
  useEffect(() => {
    if (signed) delete document.documentElement.dataset.locked
    else document.documentElement.dataset.locked = '1'
  }, [signed])

  /* 折叠状态记在 <main class="lout"> 上——参照就是这么做的，整套收起样式
     （68px 图标条、隐藏文字、logo 变展开按钮）都挂在 main.lout 下面。
     之前写的是 documentElement 上的 lfolded，那个类在样式表里根本不存在，
     所以按钮点了什么都不发生。 */
  useEffect(() => {
    try { localStorage.setItem('atara-left', folded ? '1' : '0') } catch { /* 隐身窗口 */ }
  }, [folded])

  return (
    <AssessmentProvider>
    <KycProvider identity={handle}>
    {/* 右栏属于「有对话的那两个视图」：新建一单，以及某个人的会话。
    
        参照是 main.classList.toggle('rout', v!=='chat')——它那边只有一个 chat
        视图，composer 和会话都在里面。我们拆成了 home 和 thread 两个，所以
        条件要写成这两个的并集。原来只判 home，于是从大厅点 Buy 落到会话之后，
        右栏被 rout 压成 1px，那一单的七票共识一个字都看不见。
    
        其他视图收起它，中栏才拿到整条剩余宽度；.view 的 max-width:960px +
        align-self:center 这时才起作用，卡片是居中的。 */}
    <main className={[(route.view === 'home' || route.view === 'thread') && signed
      ? '' : 'rout', folded ? 'lout' : '',
      rfold ? 'rfold' : ''].filter(Boolean).join(' ') || undefined}>
      <Sidebar route={route} go={go} identity={handle} folded={folded} onFold={setFolded}
        signed={signed} onSignIn={login}
        onSignOut={() => { signOutAll(signOut); go({ view: 'discover' }) }}
        onLock={lk.lock} />

      <section id="mid">
        {/* 未登录的起点是市场：能看的东西在这儿，下单页留给登录后 */}
        {route.view === 'home' && (signed
          ? <Home identity={handle} />
          : <Pool identity={handle} onNeedSignIn={login} />)}
        {route.view === 'discover' && (
          <Pool identity={handle} onNeedSignIn={signed ? undefined : login} />
        )}
        {route.view === 'contacts' && <Contacts identity={handle} />}
        {route.view === 'payments' && <Payments identity={handle} />}
        {route.view === 'account' && <Account identity={handle} />}
        {route.view === 'settings' && <Settings identity={handle} />}
        {route.view === 'order' && (
          <div className="view on"><div className="vbody">
            <OrderDetail id={route.id} onBack={() => go({ view: 'payments' })} />
          </div></div>
        )}
        {route.view === 'thread' && <Thread identity={handle} peer={route.peer} />}
      </section>

      <RightPanel identity={handle}
        /* 没有对手方的单（还没撮合上）只能去工单页——没有会话可进。 */
        onOpen={o => (o.counterparty_id
          ? go({ view: 'thread', peer: o.counterparty_id })
          : go({ view: 'order', id: o.id }))}
        onFold={() => setRfold(true)} />

      {/* 收起之后要能还原。参照里这颗按钮只在「用户收起了、而且这个视图
          本来有右栏」时出现——视图本来就没有右栏时给一颗展开按钮，
          点了什么也不会发生。 */}
      <button className="rshow" type="button" title="Show panel" aria-label="Show panel"
        hidden={!rfold || !(route.view === 'home' && signed)}
        onClick={() => setRfold(false)}>
        <IPanel mirror />
      </button>
      {/* 登录弹窗由 Privy 自己渲染，挂在 body 上——这里不需要留位置 */}
    </main>

    {lk.setup && (
      <PwSetup why={lk.setup.why} onClose={lk.closeSetup} onDone={lk.finishSetup} />
    )}
    {lk.locked && (
      <LockScreen hasPasskey={hasPasskey} name={handle}
        onUnlock={() => lk.setLocked(false)}
        onSignOut={() => { lk.setLocked(false); signOutAll(signOut); go({ view: 'discover' }) }} />
    )}
    </KycProvider>
    </AssessmentProvider>
  )
}
