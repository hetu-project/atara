import { useState } from 'react'
import Discover from './views/Discover'
import Market from './views/Market'
import Money from './views/Money'
import OrderDetail from './views/OrderDetail'
import People from './views/People'
import Tasks from './views/Tasks'
import Wallet from './views/Wallet'
import { SEED_HANDLES, useIdentity } from './hooks/useIdentity'
import { go, useRoute } from './hooks/useRoute'
import type { Order } from './api/types'

const TABS = [
  { view: 'market', label: 'Trade' },
  { view: 'tasks', label: 'Tasks' },
  { view: 'discover', label: 'Discover' },
  { view: 'people', label: 'People' },
  { view: 'money', label: 'Money' },
  { view: 'account', label: 'Account' },
] as const

export default function App() {
  const { handle, change } = useIdentity()
  const { route } = useRoute()

  return (
    <div className="shell">
      <header className="topbar">
        <span className="brand">Atara</span>
        <nav className="nav">
          {TABS.map(t => (
            <button key={t.view}
              aria-current={route.view === t.view ? 'page' : undefined}
              onClick={() => go({ view: t.view })}>
              {t.label}
            </button>
          ))}
        </nav>
        <span className="spacer" />
        {/*
          后端鉴权是 mock：X-Atara-User 头直接注入身份。
          切身份是演示的必需品——同一张工单，两方看到的阶段互补，
          不能切就看不到「该你核验」这件事。
        */}
        <div className="who">
          <label htmlFor="who">身份</label>
          <select id="who" value={handle} onChange={e => change(e.target.value)}>
            {SEED_HANDLES.map(h => (
              <option key={h.handle} value={h.handle}>{h.label}</option>
            ))}
          </select>
        </div>
        <ThemeToggle />
      </header>

      <main>
        {route.view === 'order' ? (
          <OrderDetail id={route.id} onBack={() => go({ view: 'tasks' })} />
        ) : route.view === 'market' ? (
          <Market onOrder={(o: Order) => go({ view: 'order', id: o.id })} />
        ) : route.view === 'tasks' ? (
          <Tasks identity={handle} onOpen={id => go({ view: 'order', id })} />
        ) : route.view === 'discover' ? (
          <Discover identity={handle} />
        ) : route.view === 'people' ? (
          <People identity={handle} onOpenOrder={id => go({ view: 'order', id })} />
        ) : route.view === 'money' ? (
          <Money identity={handle} />
        ) : (
          <Wallet identity={handle} />
        )}
      </main>
    </div>
  )
}

function ThemeToggle() {
  const [dark, setDark] = useState(
    () => document.documentElement.dataset.theme === 'dark')
  const flip = () => {
    const next = dark ? 'light' : 'dark'
    document.documentElement.dataset.theme = next
    try { localStorage.setItem('atara-theme', next) } catch { /* 隐身窗口 */ }
    setDark(!dark)
  }
  return (
    <button className="btn ghost sm" onClick={flip} aria-label="切换主题">
      {dark ? '浅色' : '深色'}
    </button>
  )
}
