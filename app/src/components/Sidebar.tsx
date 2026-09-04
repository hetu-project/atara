import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import Avatar from './Avatar'
import {
  IApi, IChart, IContacts, IDiscover, IGo, INewOrder, IPanel, IPayments,
} from './icons'
import type { Icon } from './icons'
import type { Route } from '../hooks/useRoute'

/** 导航四项 + 两条外链，顺序与 console.html 一致。 */
const NAVS: { view: Route['view']; label: string; icon: Icon }[] = [
  { view: 'home', label: 'New order', icon: INewOrder },
  { view: 'discover', label: 'Discover', icon: IDiscover },
  { view: 'contacts', label: 'Contacts', icon: IContacts },
  { view: 'payments', label: 'Payments', icon: IPayments },
]

export default function Sidebar({
  route, go, identity, folded, onFold, signed, onSignIn, onSignOut,
}: {
  route: Route
  go: (r: Route) => void
  identity: string
  folded: boolean
  onFold: (v: boolean) => void
  signed: boolean
  onSignIn: () => void
  onSignOut: () => void
}) {
  const [menu, setMenu] = useState(false)
  const row = useRef<HTMLDivElement>(null)

  // 点外面或 Esc 关掉菜单
  useEffect(() => {
    if (!menu) return
    const away = (e: MouseEvent) => { if (!row.current?.contains(e.target as Node)) setMenu(false) }
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenu(false) }
    const t = setTimeout(() => addEventListener('mousedown', away), 0)
    addEventListener('keydown', key)
    return () => { clearTimeout(t); removeEventListener('mousedown', away); removeEventListener('keydown', key) }
  }, [menu])
  const { data: me } = useApi(() => ep.me(identity), [identity])
  const { data: allow } = useApi(() => ep.allowances(identity), [identity])
  // 会话列表就是左栏下半区。没有会话时整块（连标题）都不出现——
  // 空标题比没有标题更让人以为是加载失败。
  const { data: threads } = useApi(() => ep.threads(identity), [identity])

  const addr = me?.address ?? ''
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
  /* 新建的钱包没有名字，后端就拿短地址当展示名——那时再拼一次地址
     会写成「Tc72vq…tnhc · Tc72vq…tnhc」。名字就是地址时不重复。 */
  const named = !!me?.display_name && me.display_name !== short
  const chats = threads ?? []

  return (
    <nav id="left" aria-label="Navigation">
      <div className="lbrandrow">
        {/* 折叠态：logo 的位置就是展开按钮 */}
        <button className="lfold" title="Expand sidebar" aria-label="Expand sidebar"
          aria-expanded={!folded} onClick={() => onFold(false)}>
          <span className="lmark" aria-hidden><i /></span>
          <span className="lfi"><IPanel /></span>
        </button>
        <a className="lbrand" href="../index.html" aria-label="Back to site">
          <span className="lmark" aria-hidden><i /></span><b>Atara</b>
        </a>
        <span className="demo">DEMO</span>
        <button className="sayic lfoldx" title="Collapse sidebar" aria-label="Collapse sidebar"
          aria-expanded={!folded} onClick={() => onFold(true)}><IPanel /></button>
      </div>

      <div className="lpane" id="lp-ai">
        <div className="navs">
          {NAVS.map(n => {
            const Icon = n.icon
            return (
              <button key={n.view} className={'nav' + (route.view === n.view ? ' on' : '')}
                title={n.label} onClick={() => go({ view: n.view } as Route)}>
                <span className="ni"><Icon /></span>{n.label}
              </button>
            )
          })}
          <div className="navsep" aria-hidden />
          <a className="nav" id="navapi" href="../api.html" target="_blank" rel="noopener"
            title="Atara API — developer reference">
            <span className="ni"><IApi /></span>Atara API
            <span className="navgo" aria-hidden><IGo /></span>
          </a>
          {/* 同一套多 agent 辩论用在另一种判断上：那边评一支股票，这边评一个对手方 */}
          <a className="nav" id="navloka" href="https://www.loka.cash/app" target="_blank"
            rel="noopener" title="Investment Analysis — multi-agent research">
            <span className="ni"><IChart /></span>Investment Analysis
            <span className="navgo" aria-hidden><IGo /></span>
          </a>
        </div>

        <div className="lsec" id="tasksec" hidden={!chats.length}>Chats</div>
        <div id="tasklist">
          {chats.map(t => (
            <button key={t.peer_id} className="cp" title={t.peer_name}
              onClick={() => go({ view: 'thread', peer: t.peer_id })}>
              <Avatar name={t.peer_name} cls="cpav" />
              <span className="n">
                <em>{t.peer_name}</em>
                <i>{t.last}</i>
              </span>
              <span className="cpt">{fmtClock(t.last_at)}</span>
            </button>
          ))}
        </div>
      </div>

      {/* 未登录时账户位就是登录入口——那一格本来就在讲「你是谁」；
          登录后它是账户菜单，退出也在这里。 */}
      <div className="luserrow" ref={row}>
        <button className="luser" aria-haspopup="menu" aria-expanded={menu}
          onClick={() => (signed ? setMenu(m => !m) : onSignIn())}>
          <span className="lav">{signed ? (me?.display_name || 'D').charAt(0).toUpperCase() : '+'}</span>
          <span className="lutxt">
            {signed ? (
              <>
                <em className="lun">{named ? `${me!.display_name} · ${short}` : short}</em>
                <em className="lsub">
                  Personal account · <span className="num">{allow?.length ?? 0}</span> allowances
                </em>
              </>
            ) : <em className="lun">Sign in</em>}
          </span>
        </button>

        {menu && signed && (
          <div className="ddmenu umenu" role="menu"
            style={{ left: folded ? 10 : 8, bottom: 'calc(100% - 6px)' }}>
            <div className="umhead">
              <span className="umav">{(me?.display_name || 'D').charAt(0).toUpperCase()}</span>
              <span><b>{me?.display_name ?? 'Demo'}</b><em className="num">{short}</em></span>
            </div>
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); go({ view: 'account' }) }}>
              <IUser />Profile
            </button>
            <div className="umsep" />
            {/* 退出 = 回到未登录的控制台：能看不能动。
                后端没有会话可以作废——这里清的是本机的身份选择。 */}
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); onSignOut() }}>
              <IOut />Log out
            </button>
          </div>
        )}
      </div>
    </nav>
  )
}

const IUser = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <circle cx="8" cy="5" r="2.6" /><path d="M2.8 13.5a5.2 5.2 0 0 1 10.4 0" /></svg>
)
const IOut = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M10 2.5H4.5a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1H10" />
    <path d="M7 8h7M11.5 5.5 14 8l-2.5 2.5" /></svg>
)

/** 会话行右上角只给时分——日期在会话里，列表上不重复。 */
function fmtClock(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
