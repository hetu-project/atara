import { useEffect, useRef } from 'react'
import { usePrivy, useSignMessage, useWallets } from '@privy-io/react-auth'
import { createWalletClient, custom, type Address } from 'viem'
import * as ep from '../api/endpoints'
import { authChanged, getIdentity, setMessageSigner, setTokenSource } from '../api/client'

/**
 * The bridge between Privy and backend accounts.
 *
 * Privy only proves "this address is theirs". Opening an account is the backend's job -- so the moment
 * Privy signs in, we take the address it gives and exchange it at /auth/connect for our own account,
 * then seat the identity.
 *
 * The two wallet kinds are reported to the backend separately, because wallet_kind decides how
 * allowances are issued:
 *   External wallet (MetaMask / Phantom / OKX / QR) -> ext, allowances go through approve
 *   Privy custodial wallet (people arriving via Google / Twitter) -> reported by sign-in method, wallet_kind is atara
 */
export function usePrivyAuth(signed: boolean, signIn: (address: string) => void) {
  const { ready, authenticated, user, login, logout, getAccessToken } = usePrivy()
  /* Remember which address has already been exchanged for an account this round. Without it, one backend
     error makes the effect retry on every render, turning into a self-inflicted request storm. */
  const tried = useRef('')
  /* Signing out. Privy's logout is async, and until it completes authenticated is still true while our
     own signed is already false -- what the effect below then sees is "Privy signed in, local signed out",
     so it immediately signs the person back in. The symptom is that the first click on sign out does
     nothing and only the second one works. */
  const signingOut = useRef(false)

  /* Hand the API client a way to read the current access token. It cannot use
     the hook itself — it is plain functions, not a component — so the getter is
     installed here rather than every call site learning about Privy.

     During render, not in an effect. Effects run child-first, so anything a
     child fetches on mount goes out before a parent's effect has run: the
     sidebar's one-shot /me left without a token, came back 401, and — useApi
     does not retry — stayed empty for the rest of the session while every later
     page loaded fine. Installing it here means it is in place before any child
     effect fires. It is idempotent and touches nothing React owns. */
  setTokenSource(() => getAccessToken())

  /* And a way to sign a confirmation. Installed during render for the same
     reason as the token getter, and whenever the person is signed in — not
     only once useWallets lists something.

     Two kinds of wallet, two signers:

       external (MetaMask, OKX…) — sign through its EIP-1193 provider, which
         is what useWallets hands out;
       embedded (Google / Twitter sign-in) — sign through Privy's own hook. It
         does not depend on the embedded wallet having appeared in useWallets
         yet. That list lags the sign-in by a beat, and a Send clicked in that
         beat used to go out unsigned and come back "sign it with your passkey
         first" — the backend was right, the client just had no signer.

     The backend recovers the address from the signature and compares it to
     the account's, so a wrong pick here fails closed, never open. */
  const { wallets } = useWallets()
  const { signMessage: privySign } = useSignMessage()
  const embedded = user?.wallet?.walletClientType === 'privy' ? user.wallet.address : ''
  setMessageSigner(!authenticated ? null : async (message: string) => {
    const want = getIdentity().toLowerCase()
    const w = wallets.find(x => x.address.toLowerCase() === want) ?? wallets[0]
    if (w && w.walletClientType !== 'privy') {
      const provider = await w.getEthereumProvider()
      const account = w.address as Address
      const client = createWalletClient({ account, transport: custom(provider) })
      return client.signMessage({ account, message })
    }
    const r = await privySign({ message }, {
      address: embedded || w?.address,
      uiOptions: {
        title: 'Sign with your passkey',
        description: 'This confirms the action below. Nothing moves until you also approve the transaction that follows.',
        buttonText: 'Sign and continue',
      },
    })
    return r.signature
  })

  useEffect(() => {
    if (!ready || !authenticated || signed || signingOut.current) return
    const w = user?.wallet
    const email = user?.email?.address ?? user?.google?.email ?? ''

    /* The dedup key used to be the address, falling back to the Privy id. That
       flipped the moment the wallet landed — same session, same person, a new
       key — so the effect ran a second time and the backend, which keyed on the
       address, made a second account. The identity is the Privy id; the address
       is a fact about it that can arrive later, so it belongs in the value we
       send, not in the key that decides whether to send at all. */
    const key = user?.id
    if (!key) return
    /* Re-send when the wallet finally shows up: the backend matches on the id
       and writes the address onto the same account. */
    const stamp = key + '|' + (w?.address ?? '')
    if (tried.current === stamp) return

    /* Report the sign-in method faithfully, do not substitute google for twitter -- login_method is written
       into the account table, and fudging it makes "how did this person originally come in" unanswerable later. */
    const method = w && w.walletClientType !== 'privy' ? 'wallet'
      : user?.google ? 'google'
      : user?.twitter ? 'twitter'
      : 'email'

    /* An external wallet must bring its own address — we never hold its key, so
       there is nothing to provision later. Every other method can sign in
       without one: the account is created with no wallet, reads and chats
       normally, and refuses anything that moves money until Privy provisions
       one. That beats the old behaviour of inventing an address from the email,
       which looked like an account but was a place funds went to die. */
    if (!w?.address && method === 'wallet') return
    tried.current = stamp

    void ep.connect({
      method,
      privy_id: user.id,
      address: w?.address,
      email,
      name: user?.google?.name ?? user?.twitter?.username ?? '',
    }).then(r => {
      signIn(r.address)
      /* Now, not before: this is the first moment a token is guaranteed to
         resolve to an account. Anything that fetched during the sign-in and got
         a 401 refetches here. */
      authChanged()
    }).catch(() => { tried.current = '' })
  }, [ready, authenticated, user, signed, signIn])

  /* Signing out has to clear both sides: clear only ours and Privy's session survives, so the next click on
     sign in silently signs back in and it looks like sign out is broken.
     
     The dedupe key must not be cleared until Privy has actually finished signing out. Cleared early, nothing
     stops the effect above during the window where "Privy is still signed in, local is signed out", and it
     signs the person straight back in -- which is where "the first click on sign out does nothing" came from. */
  const signOutAll = (localSignOut: () => void) => {
    signingOut.current = true
    localSignOut()
    /* Announce it immediately, not after Privy finishes: the screen is already
       showing the previous account's balances and orders, and those should stop
       being displayed the moment the person asked to leave. */
    authChanged()
    void logout().finally(() => {
      tried.current = ''
      signingOut.current = false
      // Again once the session is really gone, so anything that refetched during
      // the wind-down and still succeeded gets asked one more time.
      authChanged()
    })
  }

  return { ready, login, signOutAll }
}
