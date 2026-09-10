import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * 会话锁。
 *
 * 控制台上摊着余额、对手方和单据，多数人是在办公室的共用屏幕前用它，
 * 所以离开座位这件事需要一个动作，而且闲置也要自己落锁。
 *
 * 密码只做一件事：把这个界面解开。**它不批准任何东西**——转账和额度
 * 永远走钱包那一侧的签名。演示件：只存在这个浏览器标签里，从不出网。
 */

const PW_KEY = 'atara-pw'

/** 演示开关：?lock=20 把闲置阈值压到 20 秒，好当场看它落锁。 */
export const LOCK_IDLE = (() => {
  const q = Number(new URLSearchParams(location.search).get('lock') || 0)
  return q > 0 ? q * 1000 : 15 * 60 * 1000
})()

export function readPw(): string {
  try { return sessionStorage.getItem(PW_KEY) || '' } catch { return '' }
}
function writePw(v: string) {
  try { sessionStorage.setItem(PW_KEY, v) } catch { /* 隐身窗口 */ }
}

/**
 * 闲置计时。任何真实操作都重新计时；锁着的时候不计。
 */
export function useIdleLock(enabled: boolean, onIdle: () => void) {
  const cb = useRef(onIdle)
  cb.current = onIdle
  useEffect(() => {
    if (!enabled) return
    let t = window.setTimeout(() => cb.current(), LOCK_IDLE)
    const arm = () => { clearTimeout(t); t = window.setTimeout(() => cb.current(), LOCK_IDLE) }
    const evs = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const
    evs.forEach(e => addEventListener(e, arm, { passive: true }))
    return () => {
      clearTimeout(t)
      evs.forEach(e => removeEventListener(e, arm))
    }
  }, [enabled])
}

// ── 设置密码 ────────────────────────────────────────────────────────

export function PwSetup({
  why, onClose, onDone,
}: { why?: string; onClose: () => void; onDone: () => void }) {
  const had = readPw()
  const [old, setOld] = useState('')
  const [a, setA] = useState('')
  const [b, setB] = useState('')
  const [err, setErr] = useState('')

  const save = () => {
    if (had && old !== had) { setErr('Current password does not match'); return }
    if (a.length < 4) { setErr('Use at least 4 characters'); return }
    if (a !== b) { setErr('The two entries do not match'); return }
    writePw(a)
    onDone()
  }

  return (
    <div className="pwmask" onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="pwsheet" role="dialog" aria-modal="true" aria-label="Session lock password">
        <h3>{had ? 'Change lock password' : 'Set a lock password'}</h3>
        {why ? <p className="pwwhy">{why}</p> : null}
        {/* 文案逐字取自参照的 openPwSetup，不改写。 */}
        <p>
          It unlocks this console when the session locks — it does not approve anything.
          Transfers and allowances always go through your passkey. Demo only: it stays in
          this browser tab and is never sent anywhere.
        </p>
        {had && (
          <input type="password" className="pwin" placeholder="Current password" autoComplete="off"
            value={old} onChange={e => { setOld(e.target.value); setErr('') }} />
        )}
        <input type="password" className="pwin" autoFocus autoComplete="off"
          placeholder={had ? 'New password' : 'Lock password'}
          value={a} onChange={e => { setA(e.target.value); setErr('') }} />
        <input type="password" className="pwin" placeholder="Repeat it" autoComplete="off"
          value={b} onChange={e => { setB(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') save() }} />
        <div className="pwerr">{err}</div>
        <div className="pwrow">
          <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={save}>{had ? 'Change' : 'Set password'}</button>
        </div>
      </div>
    </div>
  )
}

// ── 锁屏 ────────────────────────────────────────────────────────────

export function LockScreen({
  name, onUnlock, onSignOut,
}: { name: string; onUnlock: () => void; onSignOut: () => void }) {
  const pw = readPw()
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(0)
  const ini = (name.trim()[0] || 'D').toUpperCase()
  const span = LOCK_IDLE >= 60000
    ? `${Math.round(LOCK_IDLE / 60000)} minutes`
    : `${Math.round(LOCK_IDLE / 1000)} seconds`

  const submit = () => {
    if (v !== pw) {
      setErr(v ? 'Wrong password' : 'Enter your password')
      setShake(n => n + 1)
      return
    }
    setErr(''); setV(''); onUnlock()
  }

  return (
    <div id="lock" className="show" role="dialog" aria-modal="true" aria-label="Session locked">
      <div className="lksheet">
        <span className="lkav">{ini}</span>
        <h3>Enter your password</h3>
        <p>
          For your security, this session locks after {span} of inactivity.
          {' '}Enter your password to continue.
        </p>
        <input type="password" className={'pwin' + (shake ? ' shake' : '')} key={shake}
          autoFocus autoComplete="off" aria-label="Password" value={v}
          onChange={e => { setV(e.target.value); setErr('') }}
          onKeyDown={e => { if (e.key === 'Enter') submit() }} />
        <div className="pwerr">{err}</div>
        <button className="btn btn-primary lkok" onClick={submit}>Unlock</button>
        {/* 共用屏幕的场景下，回到座位的可能不是同一个人 */}
        <button className="lkout" onClick={onSignOut}>Not you? Sign out</button>
      </div>
    </div>
  )
}

/**
 * 把「点了锁」这个意图接住。
 *
 * 没设过密码就先带他去设一把，设好了再替他锁上——**他点这一下的意图不丢**。
 * 直接锁上是不行的：这个账户没有 passkey（钥匙在钱包那一侧，不在我们这儿），
 * 锁完就没有任何东西能打开它，等于把人关在门外。
 */
export function useSessionLock(signed: boolean) {
  const [locked, setLocked] = useState(false)
  const [setup, setSetup] = useState<{ why?: string } | null>(null)

  const lock = useCallback(() => {
    if (!readPw()) {
      setSetup({
        why: 'Set a password first — without one, or a passkey, '
          + 'nothing could unlock the console again.',
      })
      return
    }
    setLocked(true)
  }, [])

  useIdleLock(signed && !locked, () => { if (readPw()) setLocked(true) })

  return {
    locked, setLocked, lock,
    setup, closeSetup: () => setSetup(null),
    /* 设完密码就替他锁上——那本来就是他点那一下要的结果 */
    finishSetup: () => { setSetup(null); setLocked(true) },
  }
}
