import { PrivyProvider } from '@privy-io/react-auth'
import { base, bsc, bscTestnet, mainnet } from 'viem/chains'
import type { ReactNode } from 'react'

/**
 * Privy takes over sign-in.
 *
 * The previous setup was hand-rolled: EIP-6963 discovery of injected extensions, connecting wallet by
 * wallet. It worked, but only covered browser extensions -- mobile wallets via QR would need
 * WalletConnect wired up by hand, and Google / email sign-in would need a custodial wallet built from
 * scratch. Privy collects all of those paths into one dialog, so the whole block was replaced.
 *
 * Both the appId and the WalletConnect project ID can be overridden at build time:
 *
 *     VITE_PRIVY_APP_ID=xxx VITE_WC_PROJECT_ID=yyy npm run build
 *
 * The appId is Atara's own Privy application, a public value, fine to ship in the frontend bundle.
 * **The app secret must never come in here**: Vite inlines every VITE_* into the JS bundle, which is a
 * public file. It is a server-side credential, and this project has no use for it anyway -- the backend
 * does not verify Privy tokens, it only needs the address.
 *
 * **The appId is bound to origins**: Privy's dashboard holds an allowed-origins list, and for an origin
 * not on it the sign-in iframe is blocked by CSP frame-ancestors -- the dialog opens but sign-in fails,
 * with nothing said in the UI and only one error in the console. Add the new origin in the dashboard
 * before deploying to a different domain or port.
 */
const APP_ID = import.meta.env.VITE_PRIVY_APP_ID ?? 'cmtmpvriq01ue0dihpt5kkxkc'

/**
 * The custodial wallet only runs in a secure context.
 *
 * Over plain HTTP (localhost aside) Privy throws "Embedded wallet is only available over HTTPS"
 * outright -- and it throws at initialisation, taking the whole React tree down with it, leaving a black
 * screen with not a word on it.
 *
 * So this degrades on isSecureContext: without HTTPS the custodial wallet is not enabled, and the site
 * stays usable (external wallet sign-in is unaffected, and Google goes through the backend deriving an
 * address from the email). This is a stopgap, not an equivalent -- Twitter sign-in yields no email, so
 * no stable address can be derived and every sign-in would open a new account, which is why that path
 * does not appear over HTTP.
 * The real fix is to configure HTTPS.
 */
const secure = typeof window !== 'undefined' && window.isSecureContext
/* Project ID for WalletConnect (mobile wallets via QR). Not hardcoded: if one is configured for this
   application in the Privy dashboard that one is used, and this leaves a build-time override. Borrowing
   another project's ID works, but the usage and any bans land on them. */
const WC_ID = import.meta.env.VITE_WC_PROJECT_ID ?? ''

/**
 * Tell Privy which chains we do business on.
 *
 * Without the declaration Privy only knows Ethereum mainnet, and `switchChain(97)` throws outright
 * because "this chain is not in the configuration" -- **regardless of which chain the wallet is actually
 * on**. The user is already on BSC testnet while the UI shouts "please switch to BSC testnet", saying
 * the opposite of the truth.
 *
 * This list has to match the four in the backend's money/chains.go. A chain's own definition (chainId,
 * RPC, explorer) is public knowledge and comes ready-made from viem; which chains carry our contracts is
 * a different question, answered by the backend's chain_deployments, and is not written here.
 */
const CHAINS = [bsc, mainnet, base, bscTestnet] as const

export default function PrivyRoot({ children }: { children: ReactNode }) {
  return (
    <PrivyProvider
      appId={APP_ID}
      config={{
        // Wallets, Google, Twitter. The wallet list is not narrowed; Privy's full default set is used.
        loginMethods: secure ? ['wallet', 'google', 'twitter'] : ['wallet', 'google'],
        appearance: {
          theme: 'dark',
          accentColor: '#2563eb',
        },
        // People arriving through Google / Twitter have no wallet. Privy creates a custodial one for them,
        // so the premise "identity is an address" holds for every sign-in method --
        // the backend's account table is keyed uniquely on the address, and no address means no account.
        embeddedWallets: { createOnLogin: secure ? 'all-users' : 'off' },
        supportedChains: [...CHAINS],
        // Default to testnet: this version's contracts are only deployed there, so no chain switch is needed after sign-in.
        defaultChain: bscTestnet,
        // Mobile wallets via QR
        externalWallets: { walletConnect: { enabled: true } },
        ...(WC_ID ? { walletConnectCloudProjectId: WC_ID } : {}),
      }}
    >
      {children}
    </PrivyProvider>
  )
}
