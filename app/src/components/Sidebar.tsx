import { useEffect, useRef, useState } from 'react'
import * as ep from '../api/endpoints'
import { PROFILE_CHANGED } from '../api/client'
import { useApi } from '../hooks/useApi'
import Avatar from './Avatar'
import { IApi, IChart, IContacts, IDiscover, IGear, IGo, ILock, INewOrder, IPanel, IPayments } from './icons'
import { useKycGate } from '../hooks/useKycGate'
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
  route, go, identity, folded, onFold, signed, onSignIn, onSignOut, onLock,
}: {
  route: Route
  go: (r: Route) => void
  identity: string
  folded: boolean
  onFold: (v: boolean) => void
  signed: boolean
  onSignIn: () => void
  onSignOut: () => void
  onLock: () => void
}) {
  const [menu, setMenu] = useState(false)
  const kyc = useKycGate()
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
  const { data: me, reload: reloadMe } = useApi(() => ep.me(identity), [identity])
  const { data: allow, reload: reloadAllow } = useApi(() => ep.allowances(identity), [identity])
  // 会话列表就是左栏下半区。没有会话时整块（连标题）都不出现——
  // 空标题比没有标题更让人以为是加载失败。
  /* 轮询：会话列表要跟着两件事变——我刚下的单会新开一条会话，对方发来的
     消息会顶起一条旧会话。不轮询的话，下完单落到聊天里，左栏却没有这一行，
     得刷新整页才出现；对方说了话也一样，安安静静地什么都不发生。 */
  const { data: threads } = useApi(() => ep.threads(identity), [identity], 3000)

  /* 改完名要立刻变。这份 /me 是左栏自己的，账户页那边 reload 的是它那一份——
     不听这个广播的话，左下角会一直停在改名前：新账户那就是一串地址，
     而用户刚刚明明给自己起了名字。 */
  useEffect(() => {
    const again = () => { reloadMe(); reloadAllow() }
    addEventListener(PROFILE_CHANGED, again)
    return () => removeEventListener(PROFILE_CHANGED, again)
  }, [reloadMe, reloadAllow])

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
        <button className="sayic lfoldx" title="Collapse sidebar" aria-label="Collapse sidebar"
          aria-expanded={!folded} onClick={() => onFold(true)}><IPanel /></button>
      </div>

      <div className="lpane" id="lp-ai">
        <div className="navs">
          {NAVS.map(n => {
            const Icon = n.icon
            return (
              <button key={n.view} className={'nav' + (route.view === n.view ? ' on' : '')}
                title={n.label}
                /* 未登录时，除了 Discover 都要先登录。原来点 New order 会
                   落到 Discover——那是「未登录的起点是市场」那条规则的副作用，
                   但从用户看就是「我点了 A，你给我 B」。直接弹登录门。 */
                onClick={() => {
                  if (!signed && n.view !== 'discover') { onSignIn(); return }
                  /* 「New order」就是开一张新台面：准入那条对话得先收起来，
                     不然点了它还停在原来那串消息上，看着像没反应。
                     回得去——Chats 里的 Atara AI 一直在。 */
                  if (n.view === 'home') kyc.closeMaker()
                  go({ view: n.view } as Route)
                }}>
                <span className="ni"><Icon /></span>{n.label}
              </button>
            )
          })}
          <div className="navsep" aria-hidden />
          {/* 指向公开站点上的那份，跟旧版部署一致。参照里写的是相对路径
              href="api.html"——那是因为 console.html 当时就挂在 loka.cash 上，
              相对路径正好落到同一个域。控制台搬到自己的服务器之后，
              相对路径就指不到那份文档了，所以这里写绝对地址。 */}
          <a className="nav" id="navapi" href="https://www.loka.cash/api.html"
            target="_blank" rel="noopener"
            title="Atara API — developer reference">
            <span className="ni"><IApi /></span>Atara API
            <span className="navgo" aria-hidden><IGo /></span>
          </a>
          {/* 同一套多 agent 辩论用在另一种判断上：那边评一支股票，这边评一个对手方 */}
          <a className="nav" id="navloka" href="https://trade.loka.cash/app" target="_blank"
            rel="noopener" title="Investment Analysis — multi-agent research">
            <span className="ni"><IChart /></span>Investment Analysis
            <span className="navgo" aria-hidden><IGo /></span>
          </a>
        </div>

        <div className="lsec" id="tasksec" hidden={!signed}>Chats</div>
        <div id="tasklist">
          {/* Atara AI 是常驻的第一条会话——准入、审核这些事都在它里面发生。
              参照里它一直在列表上；我们原来只在开向导时临时显示一个标题，
              流程走完就找不回去了，「我的申请审到哪了」没有入口。 */}
          {signed && (
            <button className={'cp chatrow' + (route.view === 'home' ? ' on' : '')} title="Atara AI"
              onClick={() => { go({ view: 'home' }); kyc.openMaker() }}>
              <span className="cpav deskav" aria-hidden><i /></span>
              {/* 参照里这一行只有名字。别的会话那行小字是「最后一条消息」，
                  这里塞一句固定副标题会把名字挤到截断。 */}
              <span className="n"><em>Atara AI</em></span>
            </button>
          )}
          {chats.map(t => (
            /* chatrow 不是装饰：头像那条规则是 `#tasklist .chatrow .cpav`，
               少这个类名，选择器不命中，头像退回 .cpav 的 20px——而设计稿
               这里是 34px。折叠侧栏时藏名字的那条规则也挂在它上面。
               CSS 是照参照抄过来的，JSX 没把选择器要求的结构一起抄，
               于是样式静悄悄地不生效。 */
            <button key={t.peer_id} className="cp chatrow" title={t.peer_name}
              onClick={() => go({ view: 'thread', peer: t.peer_id })}>
              <Avatar name={t.peer_name} cls="cpav" />
              <span className="n">
                <em>{t.peer_name}</em>
                <i>{t.last}</i>
              </span>
              {/* .cpt 在两边的 CSS 里都不存在，这个时间一直是没样式的裸文本。
                  参照用的是 .chmeta 包一个 <time>，未读角标也在这一格里。 */}
              <span className="chmeta">
                <time>{fmtClock(t.last_at)}</time>
                {/* 角标印条数而不是一个圆点：「有新消息」和「攒了七条没看」
                    是两件事，后者才会让人决定现在就点进去。
                    侧栏收起时 CSS 会把它变成头像角上的一点（.chatrow:has(.unread)）。 */}
                {!!t.unread && t.unread > 0 && (
                  <span className="v dot unread num"
                    aria-label={`${t.unread} unread`}>{t.unread > 99 ? '99+' : t.unread}</span>
                )}
              </span>
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
            {/* 参照里 Settings 切的是账户页的另一种模式（ACCT_MODE），
                只显示 Security 那一段。原来这里直接跳账户页——那不是
                「不生效」，是把两件事当成了一件：账户页是资产和挂单，
                安全设置是另一回事。 */}
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); go({ view: 'settings' }) }}>
              <IGear />Settings
            </button>
            <div className="umsep" />
            {/* 锁屏：把界面盖住，回来要点一下。参照里还带一道演示密码，
                那是演示件——这里不做假的凭据校验，只做「离开座位」这件事。 */}
            <button className="umitem" role="menuitem"
              onClick={() => { setMenu(false); onLock() }}>
              <ILock />Lock session
            </button>
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
