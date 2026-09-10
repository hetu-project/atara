import { useState } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { LOCK_IDLE, PwSetup, readPw } from '../components/SessionLock'

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
  const [setup, setSetup] = useState(false)
  const [, bump] = useState(0)
  const pw = readPw()
  const ext = (me?.wallet_kind ?? 'ext') === 'ext'
  const span = LOCK_IDLE >= 60000
    ? `${Math.round(LOCK_IDLE / 60000)} minutes`
    : `${Math.round(LOCK_IDLE / 1000)} seconds`

  /* 文案取自参照的 Security 段，改了两处：
     - 写死的「15 minutes」换成实际的闲置阈值（?lock=N 能改它，写死就成了假话）
     - 参照会把演示密码原样印出来，这里不印。密码是用来挡人的，印在屏幕上
       就挡不住任何人；而且这行字在真环境里会跟着一起上线。 */
  const lockSub = pw
    ? `The console locks after ${span} idle · unlock with ${
      ext ? 'this password' : 'your passkey, or this password'}`
    : ext
      ? 'Not set — your wallet approves the transfers; a password here only keeps the console from sitting open.'
      : 'Not set, and no passkey on this device — set a password so the console can lock at all.'

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
                    <em>Non-custodial — the key is yours and Atara cannot move funds</em></span>
                </div>
              )}
              <div className="secrow">
                <span className="seci">🔒</span>
                <span className="sectxt"><b>Session lock</b><em>{lockSub}</em></span>
                <button className={'btn btn-' + (pw ? 'secondary' : 'primary') + ' btn-sm'}
                  onClick={() => setSetup(true)}>{pw ? 'Change' : 'Set password'}</button>
              </div>
            </div>
          </div>
        </div>
      </div>
      {setup && (
        <PwSetup onClose={() => setSetup(false)}
          /* 设完把这一页重画一次：那句副文案要从「Not set」变成带演示密码的
             那一句，不重画的话人以为没设上。 */
          onDone={() => { setSetup(false); bump(n => n + 1) }} />
      )}
    </div>
  )
}
