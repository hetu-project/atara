import { useCallback, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import {
  createPublicClient, createWalletClient, custom, defineChain, formatEther, http,
  type Address, type Hex,
} from 'viem'
import type { ChainRow } from '../api/types'
import { WalletTxError, readable } from '../api/walletError'
export { WalletTxError, isWalletTxError } from '../api/walletError'

/**
 * Send transactions from the user's own wallet.
 *
 * Why it has to be the user's own: the escrow contract records msg.sender as the person putting up the coins.
 * With the backend co-signing, what enters escrow is the backend address's coins -- which is no longer
 * non-custodial: nothing has left the user's wallet while the UI claims they locked coins.
 *
 * Contract address, token address and decimals all come from GET /catalog/chain and are not hardcoded here:
 * swap a contract once and a hardcoded frontend approves the money to the old one, which is only discovered
 * at the moment of locking.
 */

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

/**
 * What to say when the wallet is short of a token.
 *
 * The previous wording was `0xA50f…dB5C holds 0 of 0xC0e8…C4B7 — this needs 10`, which puts two
 * shortened hex strings side by side while they are not the same kind of thing at all: the first is
 * the person's own account, the second a token contract. Read quickly it says "send from A to B".
 *
 * The contract address is dropped. The asset's symbol answers "which token" for anyone who is not
 * auditing the contract, and the card already carries it; whoever does want the address has the
 * escrow strip and the explorer. What is added is the part that was missing entirely -- what to do
 * next. The native-coin check further down already worked this way ("Use Max to leave room for the
 * fee"); this brings the three token checks in line with it.
 */
const shortOf = (p: {
  asset: string; account: string; have: string; need: string; what: string
}) =>
  `Not enough ${p.asset} in this wallet. ${short(p.account)} holds ${p.have} ${p.asset}, `
  + `and ${p.what} needs ${p.need}. Add ${p.asset} to that wallet, then try again.`

const ERC20 = [
  { name: 'decimals', type: 'function', stateMutability: 'view',
    inputs: [], outputs: [{ type: 'uint8' }] },
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
  { name: 'transfer', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
] as const

const ESCROW = [
  { name: 'lockListing', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'bytes32' }, { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' }], outputs: [] },
  { name: 'unlockListing', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'offerId', type: 'bytes32' }], outputs: [] },
  { name: 'deposit', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'orderId', type: 'bytes32' }, { name: 'token', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'beneficiary', type: 'address' }],
    outputs: [] },
] as const

/** Which step it has reached. The copy is shown directly to the user -- the wallet pops up twice, so each has to be explained. */
export type TxStep =
  | { k: 'idle' }
  | { k: 'wallet'; msg: string }
  | { k: 'mining'; msg: string; hash: string }
  | { k: 'done'; hash: string }
  | { k: 'error'; msg: string }

/**
 * @param info Which chain this transaction goes out on. Pass whichever network the listing chose --
 *   not "whichever the backend is connected to": a listing that says it is on BASE means the wallet should switch to BASE.
 * @param expected This account's address. Privy often holds more than one wallet -- once the custodial
 *   wallet is enabled, everyone gains an extra empty built-in one. Taking wallets[0] by index picks one of
 *   them at random, so the balance is read from the empty wallet and the transaction goes out from it too,
 *   reporting "insufficient balance" while the person can plainly see funds in their account. Match by address.
 */
export function useWalletTx(info: ChainRow | null, expected?: string) {
  const { wallets } = useWallets()
  const [step, setStep] = useState<TxStep>({ k: 'idle' })

  /**
   * A signing client on the right chain.
   *
   * Lock and approve need an escrow contract. A plain transfer only needs
   * this chain's RPC and token address — missing escrow does not stop
   * someone sending coins that are already in their wallet.
   */
  const connect = useCallback(async (opts?: { needEscrow?: boolean }) => {
    if (!info) throw new Error('Pick a network first')
    if (opts?.needEscrow !== false && !info.deployed) {
      throw new Error(`${info.name} has no escrow contract yet — nothing can be locked there`)
    }
    const want = (expected ?? '').toLowerCase()
    if (!wallets.length) throw new Error('No wallet connected — sign in with a wallet first')
    /* No expected address means /wallet has not answered yet. Falling back to
       wallets[0] here used to pick whichever wallet Privy listed first — often
       the empty embedded one — and sign from it. Waiting a moment is the
       honest answer; guessing an address to move money from is not. */
    if (!want) throw new Error('Your wallet is still loading — try again in a moment')
    const w = wallets.find(x => x.address.toLowerCase() === want)
    if (!w) {
      /* The signed-in address is not connected right now. Forcibly signing with another wallet would deduct
         coins from someone else's address, or fail on the spot -- both worse than saying so plainly. */
      throw new Error(
        `This account is ${short(expected!)}, but that wallet is not connected right now`)
    }
    const chain = defineChain({
      id: info.chain_id,
      name: info.name,
      nativeCurrency: { name: info.native, symbol: info.native, decimals: 18 },
      rpcUrls: { default: { http: [info.rpc_url] } },
      blockExplorers: info.explorer
        ? { default: { name: 'explorer', url: info.explorer } } : undefined,
    })
    /* Switch chains after getting the provider: Privy's switchChain changes this wallet's current chain, and a
       provider obtained too early still points at the old one, sending the transaction to a different chain. */
    const provider = await w.getEthereumProvider()
    /* eth_chainId comes back in different forms from different wallets: mostly "0x61", but some return a decimal
       string "97" or a plain number. Parsing everything as hex reads "97" as 151, so being on the right chain is
       judged wrong. */
    const raw = await provider.request({ method: 'eth_chainId' })
    const current = typeof raw === 'string' && raw.startsWith('0x')
      ? parseInt(raw, 16)
      : Number(raw)
    if (current !== info.chain_id) {
      try {
        await w.switchChain(info.chain_id)
      } catch (e) {
        /* When the chain has never been added to the wallet, switch reports 4902 (unrecognised). This is especially
           common on testnets -- nobody has added BSC testnet by hand. The right move is to add it for them rather
           than throwing out a "please switch yourself" and leaving them to dig through wallet settings. */
        const code = (e as { code?: number })?.code
        const unknown = code === 4902 || /Unrecognized chain|not been added/i.test(String(e))
        if (!unknown) {
          /* Say which chain the wallet is on right now as well. Saying only "please switch to X" is unanswerable
             when the person is already on X -- which is what the previous version did, while the cause lay elsewhere. */
          throw new Error(
            `Wallet is on chain ${current}; this listing needs ${info.name} (chain ${info.chain_id})`)
        }
        try {
          await provider.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: `0x${info.chain_id.toString(16)}`,
              chainName: info.name,
              nativeCurrency: { name: info.native, symbol: info.native, decimals: 18 },
              rpcUrls: [info.rpc_url],
              blockExplorerUrls: info.explorer ? [info.explorer] : [],
            }],
          } as never)
        } catch {
          throw new Error(`Add ${info.name} (chain ${info.chain_id}) to your wallet to continue`)
        }
      }
    }
    const account = w.address as Address
    return {
      account,
      pub: createPublicClient({ chain, transport: http(info.rpc_url) }),
      wallet: createWalletClient({ account, chain, transport: custom(provider) }),
      chain,
    }
  }, [info, wallets, expected])

  /**
   * approve an exact amount.
   *
   * When an existing non-zero allowance is not enough, zero it first and then approve: mainnet USDT (Tether)
   * rejects a non-zero -> non-zero approve (front-running protection), so approving the new value directly
   * reverts. Self-deployed testnet tokens have no such rule, which is why this is invisible locally. Two wallet
   * signatures, each awaiting its own receipt.
   */
  type Conn = Awaited<ReturnType<typeof connect>>
  const approveExact = async (
    pub: Conn['pub'], wallet: Conn['wallet'], chain: Conn['chain'],
    account: Address, token: Address, spender: Address,
    allowed: bigint, amount: bigint, prompt: string,
  ): Promise<Hex> => {
    const one = async (value: bigint, msg: string, mining: string) => {
      setStep({ k: 'wallet', msg })
      const h = await wallet.writeContract({
        address: token, abi: ERC20, functionName: 'approve', args: [spender, value], chain, account,
      })
      setStep({ k: 'mining', msg: mining, hash: h })
      const rc = await pub.waitForTransactionReceipt({ hash: h })
      if (rc.status !== 'success') throw new Error('The approval transaction failed')
      return h
    }
    if (allowed > 0n) {
      await one(0n, 'Reset the old approval in your wallet first', 'Resetting approval')
    }
    return one(amount, prompt, 'Approving')
  }

  /**
   * approve into place and then lock the coins.
   *
   * Check the existing allowance first: if it is enough, do not sign again -- an extra wallet popup is not just
   * an annoyance, people read it as something having gone wrong.
   * Approve only this transaction's amount, never an unlimited allowance: should the contract have a hole, an
   * unlimited allowance means this token can be drained from the wallet in one go.
   */
  const lockListing = useCallback(async (p: {
    escrow: string; token: string; offerKey: string; amountWei: string; asset: string
  }): Promise<string> => {
    try {
      const { account, pub, wallet, chain } = await connect()
      const amount = BigInt(p.amountWei)
      const token = p.token as Address
      const escrow = p.escrow as Address

      const bal = await pub.readContract({
        address: token, abi: ERC20, functionName: 'balanceOf', args: [account],
      })
      if (bal < amount) {
        /* Both numbers, not just "insufficient balance": a wallet can hold several tokens all called
           USDT, and without the figures there is no way to work out which one is short. */
        const dec = await pub.readContract({
          address: token, abi: ERC20, functionName: 'decimals',
        }).catch(() => 18)
        const fmt = (v: bigint) => (Number(v) / 10 ** Number(dec)).toLocaleString()
        throw new Error(shortOf({
          asset: p.asset, account, have: fmt(bal), need: fmt(amount), what: 'this listing',
        }))
      }

      const allowed = await pub.readContract({
        address: token, abi: ERC20, functionName: 'allowance', args: [account, escrow],
      })
      if (allowed < amount) {
        await approveExact(pub, wallet, chain, account, token, escrow, allowed, amount,
          'Approve the escrow contract in your wallet')
      }

      setStep({ k: 'wallet', msg: 'Sign in your wallet to lock the coins into escrow' })
      const h = await wallet.writeContract({
        address: escrow, abi: ESCROW, functionName: 'lockListing',
        args: [p.offerKey as Hex, token, amount], chain, account,
      })
      setStep({ k: 'mining', msg: 'Locking', hash: h })
      const rc = await pub.waitForTransactionReceipt({ hash: h })
      if (rc.status !== 'success') throw new Error('The lock transaction was rejected on chain')
      setStep({ k: 'done', hash: h })
      return h
    } catch (e) {
      const msg = readable(e)
      setStep({ k: 'error', msg })
      throw new WalletTxError(msg)
    }
  }, [connect])

  /**
   * Sign an approve for the spender contract.
   *
   * An allowance is spending authority: saying "let this agent spend 2000 a week" corresponds on chain to
   * letting the spender contract move that many coins. This button used to say "Approve in wallet" while it
   * merely POSTed to the backend, which signed with its own private key -- approving the backend's coins, with
   * nothing moved in the user's wallet and no authorisation on chain at all.
   */
  const approveSpending = useCallback(async (p: {
    spending: string; token: string; amountWei: string
  }): Promise<string> => {
    try {
      const { account, pub, wallet, chain } = await connect()
      const amount = BigInt(p.amountWei)
      const token = p.token as Address
      const spender = p.spending as Address
      const allowed = await pub.readContract({
        address: token, abi: ERC20, functionName: 'allowance', args: [account, spender],
      })
      if (allowed >= amount) {
        // Already approved enough, so do not sign again. An extra wallet popup makes people think the last one failed.
        setStep({ k: 'idle' })
        return ''
      }
      const h = await approveExact(pub, wallet, chain, account, token, spender, allowed, amount,
        'Approve the spending contract in your wallet')
      setStep({ k: 'done', hash: h })
      return h
    } catch (e) {
      const msg = readable(e)
      setStep({ k: 'error', msg })
      throw new WalletTxError(msg)
    }
  }, [connect])

  /**
   * An ERC-20 transfer from the user's own wallet. Not a custodial
   * withdrawal — the coins stay on their address; the platform only
   * records the intent and the hash that follows.
   */
  const transferToken = useCallback(async (p: {
    token: string; to: string; amountWei: string; asset: string
  }): Promise<string> => {
    try {
      const { account, pub, wallet, chain } = await connect({ needEscrow: false })
      const amount = BigInt(p.amountWei)
      const token = p.token as Address
      const to = p.to as Address

      const bal = await pub.readContract({
        address: token, abi: ERC20, functionName: 'balanceOf', args: [account],
      })
      if (bal < amount) {
        const dec = await pub.readContract({
          address: token, abi: ERC20, functionName: 'decimals',
        }).catch(() => 18)
        const fmt = (v: bigint) => (Number(v) / 10 ** Number(dec)).toLocaleString()
        throw new Error(shortOf({
          asset: p.asset, account, have: fmt(bal), need: fmt(amount), what: 'this transfer',
        }))
      }

      setStep({ k: 'wallet', msg: 'Sign in your wallet to send' })
      const h = await wallet.writeContract({
        address: token, abi: ERC20, functionName: 'transfer',
        args: [to, amount], chain, account,
      })
      setStep({ k: 'mining', msg: 'Sending', hash: h })
      const rc = await pub.waitForTransactionReceipt({ hash: h })
      if (rc.status !== 'success') throw new Error('The transfer was rejected on chain')
      setStep({ k: 'done', hash: h })
      return h
    } catch (e) {
      const msg = readable(e)
      setStep({ k: 'error', msg })
      throw new WalletTxError(msg)
    }
  }, [connect])

  /**
   * Send the chain's own coin (BNB, tBNB, ETH). A plain value transfer, not a
   * contract call — the gas coin has no token address.
   *
   * The balance check includes the fee: with a token the fee comes out of a
   * different balance, but here the coin being sent is also the coin paying
   * for the send, so "you have 0.05, sending 0.05" fails for a reason the
   * wallet reports badly. Say it before asking for a signature.
   */
  const transferNative = useCallback(async (p: {
    to: string; amountWei: string
  }): Promise<string> => {
    try {
      const { account, pub, wallet, chain } = await connect({ needEscrow: false })
      const amount = BigInt(p.amountWei)
      const to = p.to as Address

      const gas = 21000n
      const gasPrice = await pub.getGasPrice()
      const bal = await pub.getBalance({ address: account })
      if (bal < amount + gas * gasPrice) {
        throw new Error(
          `${short(account)} holds ${formatEther(bal)} — sending ${formatEther(amount)} plus ` +
          `about ${formatEther(gas * gasPrice)} in fees does not fit. Use Max to leave room for the fee.`)
      }

      setStep({ k: 'wallet', msg: 'Sign in your wallet to send' })
      const h = await wallet.sendTransaction({ to, value: amount, gas, chain, account })
      setStep({ k: 'mining', msg: 'Sending', hash: h })
      const rc = await pub.waitForTransactionReceipt({ hash: h })
      if (rc.status !== 'success') throw new Error('The transfer was rejected on chain')
      setStep({ k: 'done', hash: h })
      return h
    } catch (e) {
      const msg = readable(e)
      setStep({ k: 'error', msg })
      throw new WalletTxError(msg)
    }
  }, [connect])

  /** Delist: take back the amount not tied up by orders. Only the original maker can call it. */
  const unlockListing = useCallback(async (p: {
    escrow: string; offerKey: string
  }): Promise<string> => {
    try {
      const { account, pub, wallet, chain } = await connect()
      setStep({ k: 'wallet', msg: 'Sign in your wallet to take the coins back' })
      const h = await wallet.writeContract({
        address: p.escrow as Address, abi: ESCROW, functionName: 'unlockListing',
        args: [p.offerKey as Hex], chain, account,
      })
      setStep({ k: 'mining', msg: 'Unlocking', hash: h })
      const rc = await pub.waitForTransactionReceipt({ hash: h })
      if (rc.status !== 'success') throw new Error('The unlock transaction was rejected on chain')
      setStep({ k: 'done', hash: h })
      return h
    } catch (e) {
      const msg = readable(e)
      setStep({ k: 'error', msg })
      throw new WalletTxError(msg)
    }
  }, [connect])

  /**
   * taker sells coins: deposit their own coins into the escrow contract, bound to this order.
   *
   * This one must be sent from the **user's wallet**. The backend's SignDeposit uses the platform signer's
   * private key, so the contract records the platform as the payer -- release pays out the platform's coins and
   * a refund returns to the platform, while the user's coins never move. So taking an order on a real chain can
   * only go through via=external, with the deposit sent from here.
   *
   * The beneficiary is written into the position and cannot be changed afterwards; release recognises only it.
   * The parameters come from the backend's order.escrow and are not computed in the frontend.
   */
  const deposit = useCallback(async (p: {
    escrow: string; token: string; orderKey: string; amountWei: string; beneficiary: string
    asset: string
  }): Promise<string> => {
    try {
      const { account, pub, wallet, chain } = await connect()
      const amount = BigInt(p.amountWei)
      const token = p.token as Address
      const escrow = p.escrow as Address
      const bal = await pub.readContract({
        address: token, abi: ERC20, functionName: 'balanceOf', args: [account],
      })
      if (bal < amount) {
        const dec = await pub.readContract({
          address: token, abi: ERC20, functionName: 'decimals',
        }).catch(() => 18)
        const fmt = (v: bigint) => (Number(v) / 10 ** Number(dec)).toLocaleString()
        throw new Error(shortOf({
          asset: p.asset, account, have: fmt(bal), need: fmt(amount), what: 'this order',
        }))
      }
      const allowed = await pub.readContract({
        address: token, abi: ERC20, functionName: 'allowance', args: [account, escrow],
      })
      if (allowed < amount) {
        await approveExact(pub, wallet, chain, account, token, escrow, allowed, amount,
          'Approve the escrow contract in your wallet')
      }
      setStep({ k: 'wallet', msg: 'Sign in your wallet to deposit the coins into escrow' })
      const h = await wallet.writeContract({
        address: escrow, abi: ESCROW, functionName: 'deposit',
        args: [p.orderKey as Hex, token, amount, p.beneficiary as Address], chain, account,
      })
      setStep({ k: 'mining', msg: 'Depositing', hash: h })
      const rc = await pub.waitForTransactionReceipt({ hash: h })
      if (rc.status !== 'success') throw new Error('The deposit transaction was rejected on chain')
      setStep({ k: 'done', hash: h })
      return h
    } catch (e) {
      const msg = readable(e)
      setStep({ k: 'error', msg })
      throw new WalletTxError(msg)
    }
  }, [connect])

  /* Sign a plain message — no transaction, no gas. What a buy listing asks
     for: it locks nothing on chain, so there is nothing to send, but posting
     it is still a commitment and the wallet is where commitments are signed.
     The text is what the person is agreeing to, in words their wallet shows
     them before they sign. */
  const signMessage = useCallback(async (message: string): Promise<string> => {
    try {
      const { account, wallet } = await connect({ needEscrow: false })
      setStep({ k: 'wallet', msg: 'Sign the listing in your wallet' })
      const sig = await wallet.signMessage({ account, message })
      setStep({ k: 'idle' })
      return sig
    } catch (e) {
      const msg = readable(e)
      setStep({ k: 'error', msg })
      throw new WalletTxError(msg)
    }
  }, [connect])

  /**
   * What this account holds of a token, without sending or signing anything.
   *
   * Deliberately **not** through connect(): that one may ask the wallet to switch network, or to add
   * one it has never seen, and both are prompts. A prompt must never come from a card merely being
   * rendered. Everything needed here is known without touching the wallet -- the chain's own RPC URL
   * and the address this account signs from -- so the read goes straight over HTTP.
   *
   * It therefore also answers while an external wallet is disconnected, which is the point: a card can
   * say "this wallet holds none" before asking anyone to connect anything.
   *
   * null means **not answered** -- no chain, no address yet, or the read failed. Callers must treat it
   * as unknown and never as zero: showing "you have 0" because an RPC timed out is worse than saying
   * nothing, because it sends people off to top up a wallet that was funded all along.
   */
  const tokenBalance = useCallback(async (token: string): Promise<bigint | null> => {
    if (!info?.rpc_url || !expected || !token) return null
    try {
      const pub = createPublicClient({ transport: http(info.rpc_url) })
      return await pub.readContract({
        address: token as Address, abi: ERC20, functionName: 'balanceOf',
        args: [expected as Address],
      })
    } catch {
      return null
    }
  }, [info, expected])

  /* Whether the wallet this account signs from is connected in this browser
     right now. An external wallet (MetaMask and the like) has to be connected
     again after a reload or a lock, and until it is, every send below fails
     with "that wallet is not connected". Cards check this first and offer a
     connect button instead of a send button that cannot work. */
  const connected = !!expected
    && wallets.some(w => w.address.toLowerCase() === expected.toLowerCase())

  return {
    step, setStep, lockListing, unlockListing, deposit, approveSpending, transferToken, transferNative,
    signMessage, tokenBalance,
    ready: wallets.length > 0,
    connected,
  }
}
