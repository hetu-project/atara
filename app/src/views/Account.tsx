import { useState } from 'react'
import * as ep from '../api/endpoints'
import { CHIP, IArrow, ICheck, ICopy, IPen } from '../components/icons'
import { useApi } from '../hooks/useApi'
import { useKycGate } from '../hooks/useKycGate'
import { AllowanceModal, BankAccountsModal, ReceiveModal, SendModal } from '../components/WalletModals'
import { go } from '../hooks/useRoute'
import type { Allowance, WalletAsset } from '../api/types'

const COIN_HUE: Record<string, number> = { USDT: 158, USDC: 220, BTC: 36, ETH: 250 }
const fmtAmt = (n: number) =>
  n < 1 ? n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') : n.toLocaleString()

type Tab = 'assets' | 'listings' | 'act'

/**
 * 账户页 = 资金全貌。
 *
 * 非托管：余额与托管仓位分开报，因为它们本来就是两个地方——
 * 钱包里的是你的，合约里的是锁着的，加在一起才是总账。
 */
/** 后端给没起名字的账户用的展示名就是这个形状，比对它来判断「没起过名字」。 */
const shortAddr = (a: string) =>
  a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a

export default function Account({ identity }: { identity: string }) {
  const kyc = useKycGate()
  const [tab, setTab] = useState<Tab>('assets')
  /* 钱包那三个按钮和「新建额度」原来是空的——没有 onClick，点了什么都不发生。 */
  const [sheet, setSheet] = useState<'' | 'receive' | 'send' | 'bank' | 'allowance'>('')
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
  /* 进编辑时填进去的是什么。判断「改没改」要跟它比，不能跟展示名比——
     没起过名字的账户展示名是缩写、填进去的是完整地址，跟展示名比永远
     算「改过了」，于是什么都没动、一失焦就把完整地址存成了名字。 */
  const [initial, setInitial] = useState('')
  const [pick, setPick] = useState<string>('')
  const [flip, setFlip] = useState(false)
  const { data: me, reload: reloadMe } = useApi(() => ep.me(identity), [identity])
  const { data: w } = useApi(() => ep.wallet(identity), [identity])
  const { data: allow, reload } = useApi(() => ep.allowances(identity), [identity])
  const { data: mine } = useApi(() => ep.myOffers(identity), [identity])
  const { data: orders } = useApi(() => ep.orders(identity), [identity])

  const saveName = async () => {
    const v = draft.trim()
    setRenaming(false)
    if (!v || v === initial) return
    try { await ep.rename(v, identity); reloadMe() } catch { /* 后端会说原因，这里不吞成静默失败 */ }
  }

  const cards = allow ?? []
  const card = cards.find(c => c.id === pick) ?? cards[0]
  const assets = w?.assets ?? []
  /* 还挂着的单：卖完（filled）和下架（delisted）的不算。它们已经不占着钱、
     也不能被吃，摆在「Your listings」里只会让人以为还在市场上。 */
  const live = (mine ?? []).filter(o => o.status === 'active')
  const avail = Number(w?.on_chain_usd ?? 0)
  const esc = Number(w?.in_escrow_usd ?? 0)
  const escN = assets.filter(a => Number(a.in_escrow) > 0).length
  const addr = w?.address ?? me?.address ?? ''
  const ini = (me?.display_name?.trim()[0] ?? 'D').toUpperCase()
  const closed = (orders ?? []).filter(o => o.terminal)

  return (
    <div className="view on" id="v-rules">
      <div className="vbody" id="rulesbody">
        {/* 身份：地址就是账户，邮箱只是通知渠道 */}
        <div className="rsec">
          <div className="pid">
            <button className="pfav" title="Change avatar" aria-label="Change avatar">{ini}</button>
            <div className="pidmain">
              <div className="pnrow">
                {/* 铅笔原来没有 onClick，点了完全没反应。改名走 POST /me，
                    只改展示名——地址才是账户的唯一键，订单、额度、联系人
                    全挂在地址上，改名不影响它们。 */}
                {renaming ? (
                  /* 样式挂在 `.pname input` 上——参照里 .pname 是外面那个
                     span，输入框在它里面。写成 <input className="pname"> 的话
                     那条规则一条都不匹配，剩下浏览器默认的白底白字。 */
                  <span className="pname">
                    <input autoFocus value={draft} maxLength={64}
                      aria-label="Nickname"
                      /* 11ch 只够放昵称；填进来的可能是 42 个字符的地址 */
                      style={{ width: `${Math.max(11, draft.length + 1)}ch` }}
                      onFocus={e => e.currentTarget.select()}
                      onChange={e => setDraft(e.target.value)}
                      onBlur={() => void saveName()}
                      onKeyDown={e => {
                        if (e.key === 'Enter') void saveName()
                        // Esc 是「算了」——原样退出，不写库
                        if (e.key === 'Escape') { setDraft(initial); setRenaming(false) }
                      }} />
                  </span>
                ) : (
                  <>
                    <span className="pname">{me?.display_name ?? 'Demo'}</span>
                    <button className="pedit" title="Rename" aria-label="Edit nickname"
                      /* 没起过名字的账户，展示名就是地址的缩写（0xFC3d…4443）。
                         把缩写填进输入框等于让人对着省略号改——所以这时填完整
                         地址。真起过名字的照旧填名字。 */
                      onClick={() => {
                        const n = me?.display_name ?? ''
                        const v = n === shortAddr(me?.address ?? '') ? (me?.address ?? '') : n
                        setDraft(v); setInitial(v); setRenaming(true)
                      }}>
                      <IPen />
                    </button>
                  </>
                )}
              </div>
              <div className="pmeta">
                <span className="num" title="Your wallet address is your account">
                  {addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''}
                </span>
                <button className="pcopy" title="Copy address" aria-label="Copy wallet address"
                  onClick={() => navigator.clipboard?.writeText(addr)}><ICopy /></button>
                {me?.email ? <>·<span title="Notification email — codes and notices, not a login">{me.email}</span></> : null}
              </div>
            </div>
            <div className="pstat">
              <b>{me?.kind === 'firm' ? 'Business account' : 'Personal account'}</b>
              {/* 参照里这里是写死的「已验证」——那是个静态 demo，Demo 用户永远验过。
                  搬到真实系统里就成了谎：新开的账户什么都没交，却显示已验证，
                  而下一秒点下单又被身份门拦住，两处自相矛盾。 */}
              {kyc.kycOk ? (
                <span className="pok"><ICheck /> {me?.kind === 'firm' ? 'Business' : 'Individual'} KYC verified</span>
              ) : kyc.kycPending ? (
                <span>Identity in review</span>
              ) : (
                <button className="lnk" type="button" onClick={() => kyc.openMaker()}>Verify identity →</button>
              )}
            </div>
          </div>
        </div>

        <div className="pgrid pg-a">
          <section className="pmod">
            <div className="pmh"><h4>Wallet</h4><span className="ad">Non-custodial</span></div>
            <div className="atot"><b className="av num">${Math.round(avail + esc).toLocaleString()}</b></div>
            <div className="aalloc" title="Available vs in escrow">
              <i className="aa-av" style={{ width: `${(avail / (avail + esc || 1) * 100).toFixed(1)}%` }} />
              <i className="aa-es" style={{ width: `${(esc / (avail + esc || 1) * 100).toFixed(1)}%` }} />
            </div>
            <div className="asplit">
              <div><span className="al">In your wallet</span>
                <b className="num">${Math.round(avail).toLocaleString()}</b></div>
              <div><span className="al">In escrow contracts</span>
                <b className="num">${Math.round(esc).toLocaleString()}</b>
                <span className="ad">{escN} trades locked ·{' '}
                  <a href="#/payments" className="lnk">View ›</a></span></div>
            </div>
            <div className="aacts">
              <button className="btn btn-secondary" onClick={() => setSheet('receive')}>Receive</button>
              <button className="btn btn-secondary" onClick={() => setSheet('send')}>Send</button>
              {/* 「Fiat accounts」而不是「Addresses」：这一格管的是法币腿的落点，
                  而链上地址在 Send 里当场填、按网络校验，从来不需要先登记。
                  一个含糊的「Addresses」把两件事盖在一起，点进去才知道是哪一件。 */}
              <button className="btn btn-secondary" onClick={() => setSheet('bank')}>Fiat accounts</button>
            </div>
          </section>

          <section className="pmod">
            <div className="pmh">
              <h4>Allowances
                <i className="info" tabIndex={0} data-tip="A spending rule your wallet signed — the contract enforces spender, per-payment cap, window total and expiry; revoking takes effect next block.">i</i>
              </h4>
              <button className="btn btn-ghost btn-sm"
                onClick={() => setSheet('allowance')}>+ New allowance</button>
            </div>
            {card ? (
              <Card c={card} all={cards} flip={flip} onFlip={() => setFlip(f => !f)}
                onPick={setPick} asset={w?.assets?.[0]?.asset ?? 'USDT'}
                /* 撤销在编辑弹窗里，不在卡片下面——见 Card 里的注释。 */
                onEdit={() => { setEditing(true); setSheet('allowance') }} />
            ) : <p className="rnote">No allowances yet.</p>}
          </section>
        </div>

        {/* 三个分栏：三段内容各自都不多，并排会把页面拉长，叠着又都长一个样 */}
        <div className="rsec">
          <div className="atabs" role="tablist">
            {([['assets', `Assets`], ['listings', `Listings${live.length ? ` · ${live.length}` : ''}`],
               ['act', 'Activity']] as [Tab, string][]).map(([k, n]) => (
              <button key={k} className={'atab ' + (tab === k ? 'on' : '')} role="tab"
                aria-selected={tab === k} onClick={() => setTab(k)}>{n}</button>
            ))}
          </div>
          <section className="pmod">
            {tab === 'assets' && (
              <>
                <div className="pmh"><h4>Assets · {assets.length}</h4>
                  <button className="h3go" onClick={() => go({ view: 'payments' })}>Statement <IArrow /></button></div>
                <Assets rows={assets} />
                <p className="rnote">
                  Digital assets only — <b>fiat never enters the account</b>.
                  <i className="info" tabIndex={0} data-tip="The fiat leg of an OTC trade settles bank-to-bank between the two parties. We verify the receipt but never hold the funds.">i</i>
                </p>
              </>
            )}
            {tab === 'listings' && (
              <>
                <div className="pmh"><h4>Your listings</h4></div>
                {live.length ? (
                  <div className="alist2">
                    {live.map(o => (
                      <div className="arow3" key={o.id}>
                        <span className="acoin" style={{ background: `hsl(${COIN_HUE[o.asset] ?? 200} 45% 40%)` }}>
                          {o.asset.slice(0, 1)}
                        </span>
                        <span className="anm"><b>{o.asset}</b><em>{o.side} · {o.status}</em></span>
                        <span className="aright">
                          <b className="num">{Number(o.remaining_qty).toLocaleString()}</b>
                          <em className="num">of {Number(o.qty).toLocaleString()}</em>
                        </span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="rnote">
                    {mine?.length
                      /* 卖完和下架的单不在这儿列——它们已经不占着钱、也吃不了。
                         留在列表里只会让人以为还挂着，而那一行写着 0。 */
                      ? 'Nothing listed right now. Filled and unlisted offers move to Activity.'
                      : 'No listings. Post one from Discover.'}
                  </p>
                )}
              </>
            )}
            {tab === 'act' && (
              <>
                <div className="pmh"><h4>Recent</h4>
                  <button className="h3go" onClick={() => go({ view: 'payments' })}>View all <IArrow /></button></div>
                <div>
                  {closed.slice(0, 6).map(o => (
                    <button className="arow2" key={o.id} onClick={() => go({ view: 'order', id: o.id })}>
                      <span className={'adot' + (o.terminal === 'completed' ? '' : o.terminal === 'disputed' ? ' dis' : ' ref')} />
                      <span className="atx"><b>{o.ref}</b>
                        <em>{o.counterparty_name} · {o.terminal === 'completed' ? 'Released' : 'Refunded'}</em></span>
                      <span className="aamt">
                        <b className="num">{Number(o.amount.amount).toLocaleString()} {o.amount.asset}</b>
                        <em className="num">{new Date(o.created_at).toLocaleDateString([], { month: '2-digit', day: '2-digit' })}</em>
                      </span>
                    </button>
                  ))}
                  {!closed.length && <p className="rnote">Nothing settled yet.</p>}
                </div>
              </>
            )}
          </section>
        </div>
        {sheet === 'receive' && <ReceiveModal w={w ?? null} onClose={() => setSheet('')} />}
        {sheet === 'bank' && <BankAccountsModal identity={identity} onClose={() => setSheet('')} />}
        {sheet === 'send' && (
          <SendModal identity={identity} assets={assets}
            onClose={() => setSheet('')} onDone={() => {}} />
        )}
        {sheet === 'allowance' && (
          <AllowanceModal identity={identity} asset={w?.assets?.[0]?.asset ?? 'USDT'}
            walletKind={me?.wallet_kind ?? 'ext'}
            edit={editing ? card : undefined}
            onRevoke={card ? async () => {
              await ep.revokeAllowance(card.id, identity)
              reload(); setSheet(''); setEditing(false)
            } : undefined}
            onClose={() => { setSheet(''); setEditing(false) }}
            onDone={() => { reload(); setSheet(''); setEditing(false) }} />
        )}
      </div>
    </div>
  )
}

function Assets({ rows }: { rows: WalletAsset[] }) {
  const tot = rows.reduce((s, x) => s + Number(x.usd_value), 0) || 1
  return (
    <div className="alist2">
      {rows.map(a => {
        const usd = Number(a.usd_value)
        const pct = usd / tot * 100
        const hue = COIN_HUE[a.asset] ?? 200
        const locked = Number(a.in_escrow)
        return (
          <div className="arow3" key={a.asset}>
            <span className="acoin" style={{ background: `hsl(${hue} 45% 40%)` }}>{a.asset.slice(0, 1)}</span>
            <span className="anm"><b>{a.asset}</b>
              <em>{a.network}{locked ? ` · ${fmtAmt(locked)} locked` : ''}</em></span>
            <span className="aright">
              <b className="num">${Math.round(usd).toLocaleString()}</b>
              <em className="num">{fmtAmt(Number(a.on_chain))} available</em>
              <span className="ashare" title={`${pct < 1 ? '<1' : Math.round(pct)}% of the account`}>
                <i style={{ width: `${Math.max(2, pct).toFixed(1)}%`, background: `hsl(${hue} 50% 48%)` }} />
              </span>
            </span>
          </div>
        )
      })}
    </div>
  )
}

/**
 * 额度卡。条件写在卡面上——这张卡能付给谁、按什么条件付，本来就是它的「面额」。
 * 翻面看完整条件，包括到期与执行方式。
 */
function Card({
  c, all, flip, onFlip, onPick, asset, onEdit,
}: {
  c: Allowance; all: Allowance[]; flip: boolean; onFlip: () => void
  onPick: (id: string) => void; asset: string; onEdit: () => void
}) {
  const q = Number(c.window_cap)
  const u = Number(c.used)
  const per = Number(c.per_payment)
  const live = c.status === 'live'
  const pct = Math.min(100, q ? u / q * 100 : 0)
  const suf = ` ${c.asset || asset}`

  return (
    <div className={`card ${live ? '' : 'off'} ${c.kind === 'agent' ? 'kagent' : ''}`}>
      <div className="cdeck">
        {/* 卡片本身就是翻面的开关（参照的 .ccard 也是 cursor:pointer + data-p="flip"）。
            原来是底下一个「Conditions」按钮——那一排本该只有卡片缩略图，
            挤进三个动作之后，一张额度看上去像有四个东西要选。 */}
        <div className="ccsway"><div className={'ccard' + (flip ? ' flip' : '')}
          role="button" tabIndex={0} aria-pressed={flip}
          aria-label={flip ? 'Show the front' : 'Show the limits'}
          onClick={onFlip}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onFlip() }
          }}>
          <div className="ccface front">
            <div className="cctop"><span className="cchip2"><CHIP /></span>
              {c.kind === 'agent' ? <span className="cctag">Agent</span> : null}
              {live ? null : <span className="cctag">Off</span>}</div>
            <div className="ccnum"><b className="cq num">{u.toLocaleString()}</b>
              <span className="cqt num">/ {q.toLocaleString()}{suf} · {c.cycle}</span></div>
            <div className="ccbar"><i style={{ width: `${pct}%` }} /></div>
            <div className="cccond">
              <span>Up to <b className="num cper">{per ? per.toLocaleString() + suf : 'any amount'}</b> per payment</span>
              <span>To <b>{c.recipients}</b></span>
            </div>
            <div className="ccfoot"><span className="ccn">{c.spender}</span></div>
          </div>
          <div className="ccface back">
            <div className="cctop"><span className="cctag" style={{ marginLeft: 0 }}>Conditions</span></div>
            <div className="ccb">
              <div className="ccbrow"><span className="ccbk">Release</span><b>{c.template || 'Any'}</b></div>
              <div className="ccbrow"><span className="ccbk">Recipients</span><b>{c.recipients}</b></div>
              <div className="ccbrow"><span className="ccbk">Per payment</span>
                <b className="num">{per ? per.toLocaleString() + suf : 'Any amount'}</b></div>
              <div className="ccbrow"><span className="ccbk">Expires</span>
                <b>{c.expires_at ? new Date(c.expires_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Not set'}</b></div>
              {/* 执行方式随钱包类型分叉：外部钱包是 approve，内置是账户合约策略 */}
              <div className="ccbrow"><span className="ccbk">Enforced</span>
                <b>{c.wallet_kind === 'ext' ? 'On-chain · by the contract' : 'Policy · account contract'}</b></div>
            </div>
            <div className="ccfoot"><span className="ccn">{c.spender}</span>
              <span className="ccy">{c.note}</span></div>
          </div>
        </div></div>
      </div>
      <div className="cthumbs">
        {all.map(r => (
          <button key={r.id} className={`cthumb ${r.id === c.id ? 'on' : ''} ${r.status === 'live' ? '' : 'off'}`}
            style={{ ['--ch' as string]: r.kind === 'agent' ? 190 : 221 }}
            title={r.spender} aria-label={`Show ${r.spender}`} aria-pressed={r.id === c.id}
            onClick={() => onPick(r.id)}>
            {/* 缩略卡里要有名字。空着的话一排小方块彼此没有区别，
                「点哪个换到上面」就成了盲猜。 */}
            <i /><span>{r.spender}</span>
          </button>
        ))}
      </div>
      {/* 动作单独一行，而且只有一个。缩略图那一排回答「看哪一张」，
          这一行回答「拿这一张怎么办」——混在一起时，一张额度看上去像有
          四个东西要选。撤销搬进了编辑弹窗：它跟改额度是同一件事的两头，
          而且是不可逆的那一头，不该跟「看一眼」摆在同一排。 */}
      <div className="cinfo">
        <div className="cfoot">
          <span className="cacts">
            <button className="btn btn-ghost btn-sm" onClick={onEdit}><IPen />Edit</button>
          </span>
        </div>
      </div>
    </div>
  )
}
