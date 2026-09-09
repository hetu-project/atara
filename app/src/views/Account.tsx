import { useState } from 'react'
import * as ep from '../api/endpoints'
import { CHIP, IArrow, ICheck, ICopy, IFlip, IPen, IPower } from '../components/icons'
import { useApi } from '../hooks/useApi'
import { useKycGate } from '../hooks/useKycGate'
import { AllowanceModal, PayeesModal, ReceiveModal, SendModal } from '../components/WalletModals'
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
export default function Account({ identity }: { identity: string }) {
  const kyc = useKycGate()
  const [tab, setTab] = useState<Tab>('assets')
  /* 钱包那三个按钮和「新建额度」原来是空的——没有 onClick，点了什么都不发生。 */
  const [sheet, setSheet] = useState<'' | 'receive' | 'send' | 'payees' | 'allowance'>('')
  const [editing, setEditing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draft, setDraft] = useState('')
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
    if (!v || v === me?.display_name) return
    try { await ep.rename(v, identity); reloadMe() } catch { /* 后端会说原因，这里不吞成静默失败 */ }
  }

  const cards = allow ?? []
  const card = cards.find(c => c.id === pick) ?? cards[0]
  const assets = w?.assets ?? []
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
                  <input className="pname" autoFocus value={draft}
                    onChange={e => setDraft(e.target.value)}
                    onBlur={() => void saveName()}
                    onKeyDown={e => {
                      if (e.key === 'Enter') void saveName()
                      if (e.key === 'Escape') setRenaming(false)
                    }} />
                ) : (
                  <>
                    <span className="pname">{me?.display_name ?? 'Demo'}</span>
                    <button className="pedit" title="Rename" aria-label="Edit nickname"
                      onClick={() => { setDraft(me?.display_name ?? ''); setRenaming(true) }}>
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
                <button className="lnk" type="button" onClick={kyc.openMaker}>Verify identity →</button>
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
              <button className="btn btn-secondary" onClick={() => setSheet('payees')}>Addresses</button>
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
                onRevoke={async () => { await ep.revokeAllowance(card.id, identity); reload() }}
                onEdit={() => { setEditing(true); setSheet('allowance') }} />
            ) : <p className="rnote">No allowances yet.</p>}
          </section>
        </div>

        {/* 三个分栏：三段内容各自都不多，并排会把页面拉长，叠着又都长一个样 */}
        <div className="rsec">
          <div className="atabs" role="tablist">
            {([['assets', `Assets`], ['listings', `Listings${mine?.length ? ` · ${mine.length}` : ''}`],
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
                {mine?.length ? (
                  <div className="alist2">
                    {mine.map(o => (
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
                ) : <p className="rnote">No listings. Post one from Discover.</p>}
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
        {sheet === 'payees' && <PayeesModal identity={identity} onClose={() => setSheet('')} />}
        {sheet === 'send' && (
          <SendModal identity={identity} assets={assets}
            onClose={() => setSheet('')} onDone={() => {}} />
        )}
        {sheet === 'allowance' && (
          <AllowanceModal identity={identity} asset={w?.assets?.[0]?.asset ?? 'USDT'}
            edit={editing ? card : undefined}
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
              <em>{a.networks?.[0] ?? ''}{locked ? ` · ${fmtAmt(locked)} locked` : ''}</em></span>
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
  c, all, flip, onFlip, onPick, asset, onRevoke, onEdit,
}: {
  c: Allowance; all: Allowance[]; flip: boolean; onFlip: () => void
  onPick: (id: string) => void; asset: string; onRevoke: () => void; onEdit: () => void
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
        <div className="ccsway"><div className={'ccard' + (flip ? ' flip' : '')}>
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
        <span className="cacts">
          {/* 翻面按钮的文案是「翻到哪一面」，不是「翻面」——参照里正面叫
              Conditions、背面叫 Front。写死成 Flip 就不知道翻过去是什么。 */}
          <button className="btn btn-ghost btn-sm" onClick={onFlip}>
            <IFlip /><span className="fliplbl">{flip ? 'Front' : 'Conditions'}</span>
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onEdit}><IPen />Edit</button>
          {/* 「Me」那张是自己的支出策略，没有可撤销的对象 */}
          {c.spender !== 'Me' && (
            <button className={`btn btn-${live ? 'danger' : 'ghost'} btn-sm`} onClick={onRevoke}>
              <IPower />{live ? 'Revoke' : 'Re-issue'}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}
