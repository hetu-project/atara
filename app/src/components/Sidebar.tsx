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
  route, go, identity, folded, onFold,
}: {
  route: Route
  go: (r: Route) => void
  identity: string
  folded: boolean
  onFold: (v: boolean) => void
}) {
  const { data: me } = useApi(() => ep.me(identity), [identity])
  const { data: allow } = useApi(() => ep.allowances(identity), [identity])
  // 会话列表就是左栏下半区。没有会话时整块（连标题）都不出现——
  // 空标题比没有标题更让人以为是加载失败。
  const { data: threads } = useApi(() => ep.threads(identity), [identity])

  const addr = me?.address ?? ''
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
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

      <div className="luserrow">
        <button className="luser" aria-haspopup="menu" aria-expanded={false}
          onClick={() => go({ view: 'account' })}>
          <span className="lav">{(me?.display_name || 'D').charAt(0).toUpperCase()}</span>
          <span className="lutxt">
            <em className="lun">{me?.display_name ?? 'Demo'}{short ? ` · ${short}` : ''}</em>
            <em className="lsub">
              Personal account · <span className="num">{allow?.length ?? 0}</span> allowances
            </em>
          </span>
        </button>
      </div>
    </nav>
  )
}

/** 会话行右上角只给时分——日期在会话里，列表上不重复。 */
function fmtClock(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false })
}
