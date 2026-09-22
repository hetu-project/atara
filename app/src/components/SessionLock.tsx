import { useCallback, useEffect, useRef, useState } from 'react'
import { useMe } from '../hooks/useMe'
import { ILock } from './icons'

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
/* Both live in sessionStorage next to the signed-in flag: a reload keeps the
   session, so it has to keep the lock too. */
const LOCK_KEY = 'atara-locked'
const ACTIVE_KEY = 'atara-last-active'

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
 * Idle timer. Any real interaction re-arms it; it does not run while locked.
 *
 * The last interaction is also stamped into sessionStorage (at most once every
 * few seconds — wheel events fire continuously) so that a tab reloaded or
 * restored after sitting idle comes back locked rather than open.
 */
export function useIdleLock(enabled: boolean, onIdle: () => void) {
  const cb = useRef(onIdle)
  cb.current = onIdle
  useEffect(() => {
    if (!enabled) return
    let t = window.setTimeout(() => cb.current(), LOCK_IDLE)
    let stamped = 0
    const stamp = () => {
      const now = Date.now()
      if (now - stamped < 5000) return
      stamped = now
      try { sessionStorage.setItem(ACTIVE_KEY, String(now)) } catch { /* private window */ }
    }
    stamp()
    const arm = () => { clearTimeout(t); t = window.setTimeout(() => cb.current(), LOCK_IDLE); stamp() }
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

/**
 * 让用户用 passkey 证明「是本人」。
 *
 * 走的是浏览器原生的 WebAuthn，不是 Privy 的 MFA——后者是给交易用的，由
 * Privy 在需要时自己发起，没法单独调来开一扇界面上的门。
 *
 * 不带 allowCredentials：让浏览器列出本域名下所有可发现的 passkey。
 * linkPasskey() 是在我们自己的页面里跑的，所以那把钥匙就绑在这个域名上。
 *
 * 这里**没有**服务端校验，断言的结果只用来开会话锁。这个分寸是有意的：
 * 会话锁挡的是「人离开座位、屏幕开着」，不是「有人拿着 devtools」。真正
 * 动钱的那几步各自有自己的确认，不靠这扇门。
 */
export async function assertPasskey(): Promise<void> {
  const challenge = crypto.getRandomValues(new Uint8Array(32))
  const cred = await navigator.credentials.get({
    publicKey: { challenge, userVerification: 'required', timeout: 60_000 },
  })
  if (!cred) throw new Error('Passkey check was dismissed')
}

// ── 锁屏 ────────────────────────────────────────────────────────────

export function LockScreen({
  hasPasskey, onUnlock, onSignOut,
}: {
  /**
   * Whether this account has a passkey. If so, no password is asked for — the
   * key is the stronger of the two. `null` while Privy has not answered yet:
   * after a reload this screen mounts before that, and guessing "no" would
   * flash a password field that vanishes a moment later.
   */
  hasPasskey: boolean | null
  onUnlock: () => void
  onSignOut: () => void
}) {
  /* Whose session this is. On a shared screen the person coming back may not be
     the one who left, and "Not you? Sign out" only makes sense if the screen
     says who "you" is — the same avatar and name as the sidebar, not the first
     digit of a wallet address. */
  const me = useMe()
  const addr = me?.address ?? ''
  const short = addr ? `${addr.slice(0, 6)}…${addr.slice(-4)}` : ''
  const named = !!me?.display_name && me.display_name !== short
  const pw = readPw()
  const [v, setV] = useState('')
  const [err, setErr] = useState('')
  const [shake, setShake] = useState(0)
  const [busy, setBusy] = useState(false)
  /* 先给哪一种。passkey 更好用，但它可能在这个域名上根本不存在——
     见下面 byPasskey 的注释——所以这是个可以退的选择，不是定局。 */
  /* null = not decided yet, because hasPasskey is not known yet. The choice is
     made once, from the first real answer; after that the person switches it
     with the buttons below, not Privy. */
  const [byPw, setByPw] = useState<boolean | null>(hasPasskey === null ? null : !hasPasskey)
  useEffect(() => {
    if (hasPasskey !== null) setByPw(cur => cur === null ? !hasPasskey : cur)
  }, [hasPasskey])
  const ini = (me?.display_name || addr || '·').charAt(0).toUpperCase()
  const span = LOCK_IDLE >= 60000
    ? `${Math.round(LOCK_IDLE / 60000)} minutes`
    : `${Math.round(LOCK_IDLE / 1000)} seconds`

  const byPasskey = async () => {
    setBusy(true); setErr('')
    try {
      await assertPasskey()
      onUnlock()
    } catch (e) {
      /* 失败就退回密码，别把人关在门外。

         hasPasskey 读的是 Privy 账户上登记的那一把，而 WebAuthn 的钥匙是
         **绑在域名上**的。同一个账户换一个部署地址——本地、IP、vercel.app、
         自己的域名——账户上还写着「有 passkey」，浏览器这边却一把都找不到。
         那时屏幕上只剩一颗按不动的按钮和「签出」，而人什么都没做错。 */
      /* The browser **deliberately** reports "the user cancelled" and "there is no
         such key here" as one and the same NotAllowedError — telling them apart
         would let a page learn whether an account is registered. So both
         possibilities are named, together with the one way in that always works.
         The browser's own message stays in the console: it is a spec citation
         written for developers, not for the person at the screen. */
      const denied = e instanceof DOMException && e.name === 'NotAllowedError'
      if (denied) console.warn('passkey assertion refused:', e.message)
      const why = denied
        ? 'The passkey check was cancelled, or no passkey for this account is available on this device.'
        : e instanceof Error ? e.message : 'Could not verify your passkey.'
      setErr(pw ? why : why + ' Signing out and back in will let you in.')
      if (pw) setByPw(true)
    } finally { setBusy(false) }
  }

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
        <span className="lkav" aria-hidden>{ini}<i><ILock /></i></span>
        {(named || short) && (
          <em className="lkwho">{named ? `${me!.display_name} · ${short}` : short}</em>
        )}
        {/* 标题跟着屏上真正摆着的东西走：没有密码框就别叫人输密码。 */}
        <h3>{byPw ? 'Enter your password' : 'Session locked'}</h3>
        <p>
          For your security, this session locks after {span} of inactivity.
          {byPw === null ? ''
            : byPw ? ' Enter your password to continue.'
            : ' Unlock with your passkey to continue.'}
        </p>
        {byPw === null ? (
          /* Privy has not said yet how this account can unlock. Hold the sheet's
             shape with a disabled button rather than guess a field. */
          <button className="btn btn-primary lkok" disabled>Checking your account…</button>
        ) : byPw ? (
          <>
            <input type="password" className={'pwin' + (shake ? ' shake' : '')} key={shake}
              autoFocus autoComplete="off" aria-label="Password" value={v}
              onChange={e => { setV(e.target.value); setErr('') }}
              onKeyDown={e => { if (e.key === 'Enter') submit() }} />
            <div className="pwerr">{err}</div>
            <button className="btn btn-primary lkok" onClick={submit}>Unlock</button>
            {/* 有 passkey 的话留一条回去的路：刚才那次失败可能只是点错了取消 */}
            {hasPasskey && (
              <button className="lkalt" onClick={() => { setErr(''); setByPw(false) }}>
                Use your passkey instead
              </button>
            )}
          </>
        ) : (
          <>
            <div className="pwerr">{err}</div>
            <button className="btn btn-primary lkok" disabled={busy}
              onClick={() => void byPasskey()}>
              {busy ? 'Waiting for your passkey…' : 'Unlock with passkey'}
            </button>
            {/* 这一把可能是在另一个域名上注册的，在这里找不到。没设过密码
                就没有这条路——那时只剩签出，所以上面那句错误必须说清楚。 */}
            {pw && (
              <button className="lkalt" onClick={() => { setErr(''); setByPw(true) }}>
                Use your password instead
              </button>
            )}
          </>
        )}
        {/* 共用屏幕的场景下，回到座位的可能不是同一个人 */}
        <button className="lkout" onClick={onSignOut}>Not you? Sign out</button>
      </div>
    </div>
  )
}

/**
 * 把「点了锁」这个意图接住。
 *
 * 锁之前必须先确认「有东西能再打开它」，否则就是把人关在门外。能打开它的
 * 有两样：账户上的 passkey，或者本机设的密码。有 passkey 就直接锁，不再
 * 多问一道密码——那把钥匙本来就比密码强，再要一个只是多一件要记的事。
 * 两样都没有才带他去设一把，设好了再替他锁上，他点那一下的意图不丢。
 */
/** Was the console locked when this tab last rendered, or idle past the threshold? */
function lockedOnLoad(signed: boolean): boolean {
  if (!signed) return false
  try {
    if (sessionStorage.getItem(LOCK_KEY) === '1') return true
    const last = Number(sessionStorage.getItem(ACTIVE_KEY) || 0)
    return last > 0 && Date.now() - last > LOCK_IDLE
  } catch { return false }
}

/**
 * @param hasPasskey `null` while Privy has not yet said whether this account has
 * a passkey. Treated as "maybe": the lock is neither dropped nor refused on it.
 */
export function useSessionLock(signed: boolean, hasPasskey: boolean | null = false) {
  const [locked, setLockedState] = useState(() => lockedOnLoad(signed))
  const [setup, setSetup] = useState<{ why?: string } | null>(null)
  const canOpen = hasPasskey === null ? true : hasPasskey || !!readPw()

  /* Mirrored into sessionStorage so a reload while locked comes back locked.
     React state alone lasts exactly until F5 — the first thing a passer-by
     tries. */
  const setLocked = useCallback((v: boolean) => {
    setLockedState(v)
    try {
      if (v) sessionStorage.setItem(LOCK_KEY, '1')
      else sessionStorage.removeItem(LOCK_KEY)
    } catch { /* private window */ }
  }, [])

  const lock = useCallback(() => {
    if (!hasPasskey && !readPw()) {
      setSetup({
        why: 'Set a password first — without one, or a passkey, '
          + 'nothing could unlock the console again.',
      })
      return
    }
    setLocked(true)
  }, [hasPasskey, setLocked])

  /* A lock nothing can open is a lockout, not a lock. Once Privy has answered
     and there is neither a passkey nor a password, drop it — the same rule
     lock() applies before locking. Signing out drops it as well. */
  useEffect(() => {
    if (!locked) return
    if (!signed || (hasPasskey === false && !readPw())) setLocked(false)
  }, [locked, signed, hasPasskey, setLocked])

  useIdleLock(signed && !locked, () => { if (canOpen) setLocked(true) })

  return {
    locked, setLocked, lock,
    setup, closeSetup: () => setSetup(null),
    /* Lock as soon as the password is set — that is what the click was for. */
    finishSetup: () => { setSetup(null); setLocked(true) },
  }
}
