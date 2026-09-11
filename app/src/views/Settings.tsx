import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import Backup from '../components/Backup'
import { LOCK_IDLE, PwSetup, readPw } from '../components/SessionLock'

/** 上次备份过密钥的日期。只是一句给人看的提示，存本机就够。 */
const BACKUP_KEY = 'atara-backup-at'
const readBackup = () => {
  try { return localStorage.getItem(BACKUP_KEY) ?? '' } catch { return '' }
}

/**
 * 设置页 = 账户页的另一种模式。
 *
 * 参照里 openAcct('settings') 切的是同一个视图的 ACCT_MODE，只渲染 Security
 * 那一段。原来菜单里的 Settings 直接跳账户页——那不是「不生效」，是把两件
 * 事当成了一件：账户页是资产和挂单，安全设置是另一回事。
 *
 * 这一段的内容随钱包类型变，参照的注释写得很清楚：
 *   Wallet keys —— 只在自建钱包时出现。外部钱包的私钥从来不在我们这儿，
 *                  没有什么可以备份，摆一行「备份」是在暗示我们持有它。
 *   Passkeys    —— 同上，签名在钱包那一侧。
 *   Session lock —— 永远显示。它锁的是这个界面，跟钱包无关。
 *
 * 两步验证和收款地址延迟这一版没有：一个能开关却没人读的安全设置，
 * 比没有更糟。
 */
export default function Settings({ identity }: { identity: string }) {
  const { data: me } = useApi(() => ep.me(identity), [identity])
  const { user, authenticated, linkPasskey } = usePrivy()
  const [setup, setSetup] = useState(false)
  const [backup, setBackup] = useState(false)
  /* 加 passkey 失败的原因。必须显示出来：linkPasskey 的失败是一个异步
     rejection，不接住的话点下去屏幕上什么都不发生——而「没反应」是最难报的
     一类故障，用户没法描述，我们也无从查起。 */
  const [pkErr, setPkErr] = useState('')
  const [, bump] = useState(0)
  const pw = readPw()
  const ext = (me?.wallet_kind ?? 'ext') === 'ext'
  const backedAt = readBackup()
  /* 这个账户上登记了几个 passkey。数来自 Privy，不是我们自己记的一个数字——
     记在自己这边的话，用户在别处删掉一个，我们这儿还显示着。 */
  const keys = (user?.linkedAccounts ?? []).filter(a => a.type === 'passkey')

  /* passkey 是挂在 Privy 账户上的，所以先得有一个 Privy 会话。
     用演示身份（?as=）进来的人没有，这时点下去 Privy 会抛
     「User must be authenticated before linking an account」。 */
  const addPasskey = () => {
    setPkErr('')
    if (!authenticated) {
      setPkErr('This console session was not opened through Privy. '
        + 'Sign in with Google, Twitter or a wallet, then add a passkey to that account.')
      return
    }
    try {
      // 类型上是 () => void，运行时返回的是 promise，失败靠它才看得见
      const r = linkPasskey() as unknown as Promise<unknown> | void
      if (r && typeof (r as Promise<unknown>).catch === 'function') {
        void (r as Promise<unknown>).catch((e: unknown) => {
          setPkErr(e instanceof Error ? e.message : 'Could not add a passkey')
        })
      }
    } catch (e) {
      setPkErr(e instanceof Error ? e.message : 'Could not add a passkey')
    }
  }
  const span = LOCK_IDLE >= 60000
    ? `${Math.round(LOCK_IDLE / 60000)} minutes`
    : `${Math.round(LOCK_IDLE / 1000)} seconds`

  /* 文案取自参照的 Security 段，改了两处：
     - 写死的「15 minutes」换成实际的闲置阈值（?lock=N 能改它，写死就成了假话）
     - 参照会把演示密码原样印出来，这里不印。密码是用来挡人的，印在屏幕上
       就挡不住任何人；而且这行字在真环境里会跟着一起上线。 */
  /* 副文案按「有没有东西能开锁」分三种，而不是只看密码设没设：
     有 passkey 时根本不需要密码，却还写着「Not set」，人会以为锁不上。 */
  const lockSub = keys.length
    ? (pw
      ? `The console locks after ${span} idle · unlock with your passkey, or this password`
      : `The console locks after ${span} idle · unlock with your passkey`)
    : pw
      ? `The console locks after ${span} idle · unlock with this password`
      : ext
        ? 'Not set — your wallet approves the transfers; a password here only keeps the console from sitting open.'
        : 'Not set, and no passkey on this account — add a passkey below, or set a password.'

  return (
    <div className="view on" id="v-rules">
      <div className="vbody">
        <div className="rgroup">
          <div className="rsec"><h3>Security</h3>
            <div className="seclist">
              {/* 外部钱包不显示这一行：钥匙从来不在我们这儿，
                  给一个「备份」按钮等于暗示我们持有它。 */}
              {!ext && (
                <div className="secrow">
                  <span className="seci">🗝</span>
                  <span className="sectxt"><b>Wallet keys</b>
                    <em>Non-custodial — the key is yours and Atara cannot move funds ·{' '}
                      {backedAt ? `recovery phrase backed up ${backedAt}` : 'recovery phrase not backed up'}</em></span>
                  <button className="btn btn-secondary" onClick={() => setBackup(true)}>
                    {backedAt ? 'View phrase' : 'Back up'}
                  </button>
                </div>
              )}
              <div className="secrow">
                <span className="seci">🔒</span>
                <span className="sectxt"><b>Session lock</b><em>{lockSub}</em></span>
                {/* 有 passkey 的时候密码是可选项，不该再用主色按钮催人去设。 */}
                <button className={'btn btn-' + (pw || keys.length ? 'secondary' : 'primary') + ' btn-sm'}
                  onClick={() => setSetup(true)}>{pw ? 'Change' : 'Set password'}</button>
              </div>
            </div>
          </div>

          {/* Passkey 是这台设备上「确认是本人」的凭据。外部钱包不需要——
              那边每一笔都由钱包自己弹窗确认，再叠一层是重复。 */}
          {!ext && (
            <div className="seclist pkcard"><div className="secrow pkgrp">
              <span className="seci">🔑</span>
              <span className="sectxt"><b>Passkeys</b>
                <em>{keys.length
                  ? `${keys.length} device${keys.length > 1 ? 's' : ''} can approve transfers`
                  : 'None on this account — your next transfer will ask you to add one.'}</em></span>
              <button className={'btn btn-' + (keys.length ? 'secondary' : 'primary') + ' btn-sm'}
                onClick={addPasskey}>
                {keys.length ? 'Add a device' : 'Add passkey'}
              </button>
              {pkErr ? (
                <div className="pkrows"><div className="pkrow">
                  <span className="pkname" style={{ color: 'var(--warn)', whiteSpace: 'normal' }}>
                    {pkErr}
                  </span>
                </div></div>
              ) : null}
              {keys.length > 0 && (
                <div className="pkrows">
                  {keys.map(k => (
                    <div className="pkrow" key={k.credentialId}>
                      <span className="pkdev" aria-hidden>🔑</span>
                      <span className="pkname">{k.authenticatorName ?? 'Passkey'}</span>
                      {/* firstVerifiedAt 才是「什么时候加上的」。verifiedAt 被
                          Privy 标了 deprecated，而且它是最近一次验证的时间——
                          拿它当添加时间，每用一次 passkey 那行日期就往前跳。 */}
                      <span className="pkat">
                        {k.firstVerifiedAt
                          ? `Added ${k.firstVerifiedAt.toLocaleDateString('en-US',
                            { month: 'short', day: 'numeric', year: 'numeric' })}`
                          : 'Added'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div></div>
          )}
        </div>
      </div>
      {backup && (
        <Backup backedUp={!!backedAt} onClose={() => setBackup(false)}
          onDone={() => {
            try {
              localStorage.setItem(BACKUP_KEY, new Date().toLocaleDateString('en-US',
                { month: 'short', day: 'numeric', year: 'numeric' }))
            } catch { /* 隐身窗口：那就下次再提示备份 */ }
            setBackup(false); bump(n => n + 1)
          }} />
      )}
      {setup && (
        <PwSetup onClose={() => setSetup(false)}
          /* 设完把这一页重画一次：那句副文案要从「Not set」变成带演示密码的
             那一句，不重画的话人以为没设上。 */
          onDone={() => { setSetup(false); bump(n => n + 1) }} />
      )}
    </div>
  )
}
