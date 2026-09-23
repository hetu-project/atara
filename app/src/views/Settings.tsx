import { useState } from 'react'
import { usePrivy } from '@privy-io/react-auth'
import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import Backup from '../components/Backup'
import { LOCK_IDLE, PwSetup, readPw } from '../components/SessionLock'

/** Date the keys were last backed up. Just a line of text for the user, so local storage is enough. */
const BACKUP_KEY = 'atara-backup-at'
const readBackup = () => {
  try { return localStorage.getItem(BACKUP_KEY) ?? '' } catch { return '' }
}

/**
 * The settings page = another mode of the account page.
 *
 * In the reference, openAcct('settings') switches ACCT_MODE on the same view and renders only the Security
 * section. Settings in the menu used to jump straight to the account page -- that was not "not working",
 * it was treating two things as one: the account page is assets and listings, security settings are a
 * different matter.
 *
 * What this section contains varies with wallet type, and the reference's comments are explicit about it:
 *   Wallet keys  -- only appears for self-custody wallets. An external wallet's private key was never with
 *                   us, so there is nothing to back up, and a "back up" row would imply we hold it.
 *   Passkeys     -- likewise, signing happens on the wallet side.
 *   Session lock -- always shown. It locks this UI and has nothing to do with the wallet.
 *
 * Two-factor and payout-address delays are not in this version: a security setting that toggles but that
 * nothing reads is worse than none.
 */
export default function Settings({ identity }: { identity: string }) {
  const { data: me } = useApi(() => ep.me(identity), [identity])
  const { user, authenticated, linkPasskey } = usePrivy()
  const [setup, setSetup] = useState(false)
  const [backup, setBackup] = useState(false)
  /* Why adding a passkey failed. It has to be shown: linkPasskey's failure is an async rejection, and
     uncaught, nothing at all happens on screen after the click -- and "no response" is the hardest class
     of fault to report, because the user cannot describe it and we have nowhere to start looking. */
  const [pkErr, setPkErr] = useState('')
  const [, bump] = useState(0)
  const pw = readPw()
  const ext = (me?.wallet_kind ?? 'ext') === 'ext'
  const backedAt = readBackup()
  /* How many passkeys are registered on this account. The count comes from Privy, not a number we keep
     ourselves -- kept on our side, deleting one elsewhere would leave us still showing it. */
  const keys = (user?.linkedAccounts ?? []).filter(a => a.type === 'passkey')

  /* Passkeys hang off the Privy account, so a Privy session has to exist first. People who came in on a
     demo identity (?as=) have none, and clicking through then makes Privy throw
     "User must be authenticated before linking an account". */
  const addPasskey = () => {
    setPkErr('')
    if (!authenticated) {
      setPkErr('This console session was not opened through Privy. '
        + 'Sign in with Google, Twitter or a wallet, then add a passkey to that account.')
      return
    }
    try {
      // Typed as () => void, but returns a promise at runtime; failures are only visible through it
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

  /* Copy taken from the reference's Security section, with two changes:
     - the hardcoded "15 minutes" is replaced with the actual idle threshold (?lock=N can change it, so a
       hardcoded value would be a lie)
     - the reference prints the demo password verbatim; this does not. A password exists to keep people out,
       and printed on screen it keeps nobody out; and that line would ship to real environments along with everything else. */
  /* The sub-copy has three variants based on "is there anything that can unlock it" rather than only on
     whether a password is set: with a passkey no password is needed at all, yet it still said "Not set",
     making people think it could not be locked. */
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
              {/* External wallets do not show this row: the keys were never with us, and offering a
                  "back up" button would imply we hold them. */}
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
                {/* With a passkey the password is optional, so it should not keep nagging with a primary-colour button. */}
                <button className={'btn btn-' + (pw || keys.length ? 'secondary' : 'primary') + ' btn-sm'}
                  onClick={() => setSetup(true)}>{pw ? 'Change' : 'Set password'}</button>
              </div>
            </div>
          </div>

          {/* A passkey is the "prove it is you" credential on this device. External wallets do not need one --
              there, every transaction is confirmed by the wallet's own dialog, and another layer is duplication. */}
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
                      {/* firstVerifiedAt is "when it was added". verifiedAt is marked deprecated by Privy,
                          and it is the time of the most recent verification -- used as the add date, that
                          line would jump forward every time the passkey is used. */}
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
            } catch { /* private window: then prompt for a backup again next time */ }
            setBackup(false); bump(n => n + 1)
          }} />
      )}
      {setup && (
        <PwSetup onClose={() => setSetup(false)}
          /* Repaint this page once it is set: that sub-copy has to change from "Not set" to the one with the
             demo password, and without the repaint people think it did not take. */
          onDone={() => { setSetup(false); bump(n => n + 1) }} />
      )}
    </div>
  )
}
