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
 * 用用户自己的钱包发交易。
 *
 * 为什么必须是用户自己发：托管合约把 msg.sender 记成出币的人。后端代签的话，
 * 进托管的是后端那个地址的币——那就不是非托管了，用户的钱包里什么都没少，
 * 界面上却说他锁了币。
 *
 * 合约地址、代币地址、精度全部来自 GET /catalog/chain，不写死在这里：
 * 换一次合约，写死的前端会把钱 approve 给旧合约，而且要到锁币那一刻才发现。
 */

const short = (a: string) => (a.length > 10 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a)

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

/** 走到哪一步了。文案直接显示给人看——钱包要弹两次，得说清各是什么。 */
export type TxStep =
  | { k: 'idle' }
  | { k: 'wallet'; msg: string }
  | { k: 'mining'; msg: string; hash: string }
  | { k: 'done'; hash: string }
  | { k: 'error'; msg: string }

/**
 * @param info 这笔交易要发在哪条链上。挂单选了哪个网络就传哪条——
 *   不是「后端连着哪条」：一条挂单说自己在 BASE 上，钱包就该切到 BASE。
 * @param expected 这个账户的地址。Privy 手里往往不止一个钱包——开了托管
 *   钱包之后，每个人都多一个空的内置钱包。按下标取 wallets[0] 会随机拿到
 *   其中一个，于是余额查的是空钱包、交易也从空钱包发出去，报「余额不足」
 *   而人明明看着自己账上有钱。要按地址认。
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
      /* 登录的那个地址此刻没连上。硬用另一个钱包签会把币从别人的地址上扣，
         或者当场失败——两种都比说清楚糟。 */
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
    /* 切链要在拿 provider 之后：Privy 的 switchChain 换的是这个钱包的当前链，
       provider 拿早了还指着旧链，交易会发到另一条链上去。 */
    const provider = await w.getEthereumProvider()
    /* eth_chainId 各家回的形式不一样：多数是 "0x61"，也有回十进制字符串
       "97" 或直接一个数字的。一律按 16 进制解析的话，"97" 会被读成 151，
       于是明明在对的链上也判成不对。 */
    const raw = await provider.request({ method: 'eth_chainId' })
    const current = typeof raw === 'string' && raw.startsWith('0x')
      ? parseInt(raw, 16)
      : Number(raw)
    if (current !== info.chain_id) {
      try {
        await w.switchChain(info.chain_id)
      } catch (e) {
        /* 钱包里没添加过这条链时，switch 会报 4902（不认识）。测试网尤其
           常见——没人手动加过 BSC 测试网。这时该替他加上，而不是甩一句
           「请自己切过去」让他去翻钱包设置。 */
        const code = (e as { code?: number })?.code
        const unknown = code === 4902 || /Unrecognized chain|not been added/i.test(String(e))
        if (!unknown) {
          /* 把钱包此刻在哪条链上一起说出来。只说「请切到 X」的话，人已经在
             X 上时这句话是无解的——上一版就是这样，原因其实在别处。 */
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
   * approve 到一个精确的量。
   *
   * 现有额度非零又不够时，先归零再批：主网 USDT（Tether）拒绝非零→非零的
   * approve（防前跑），直接批新值那笔交易会 revert。测试网自部署的代币没有这
   * 条规矩，所以本地看不出来。两笔钱包签名，各自等回执。
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
   * approve 到位再锁币。
   *
   * 先查现有额度：够就不再签一次——多弹一次钱包不只是麻烦，人会以为出错了。
   * 只 approve 这一笔的量，不给无限额度：合约万一有洞，无限额度意味着钱包里
   * 这个币可以被一次性搬空。
   */
  const lockListing = useCallback(async (p: {
    escrow: string; token: string; offerKey: string; amountWei: string
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
        /* 把地址、代币合约和两个数一起说出来。只说「余额不足」的话，同一个
           钱包里可能躺着好几个都叫 USDT 的代币，人对着其中一个的余额看，
           永远想不通为什么不够。 */
        const dec = await pub.readContract({
          address: token, abi: ERC20, functionName: 'decimals',
        }).catch(() => 18)
        const fmt = (v: bigint) => (Number(v) / 10 ** Number(dec)).toLocaleString()
        throw new Error(
          `${short(account)} holds ${fmt(bal)} of ${short(token)} — this needs ${fmt(amount)}`)
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
   * 给支出合约签一笔 approve。
   *
   * 额度就是支配权：说「允许这个 agent 每周花 2000」，链上对应的就是
   * 允许支出合约动这么多币。以前这颗按钮写着「Approve in wallet」，
   * 实际只是 POST 给后端，由后端拿自己的私钥去签——那批的是后端的币，
   * 用户钱包里一分没动，链上什么授权都没有。
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
        // 已经批够了就不再签一次。多弹一次钱包，人会以为上次没成功。
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
    token: string; to: string; amountWei: string
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
        throw new Error(
          `${short(account)} holds ${fmt(bal)} of ${short(token)} — this needs ${fmt(amount)}`)
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

  /** 下架：把没被订单绑走的量取回钱包。只有原 maker 能调。 */
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
   * taker 卖币：把自己的币存进托管合约，绑到这笔订单上。
   *
   * 这一笔必须由**用户的钱包**发。后端的 SignDeposit 用的是平台签名方的私钥，
   * 合约会把付款方记成平台——放款付的是平台的币、退款退回平台，用户的币一分
   * 不动。所以真链上接单只能走 via=external，然后由这里发 deposit。
   *
   * 收款方（beneficiary）写进仓位就改不了，放款只认它；参数从后端的
   * order.escrow 拿，不在前端算。
   */
  const deposit = useCallback(async (p: {
    escrow: string; token: string; orderKey: string; amountWei: string; beneficiary: string
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
        throw new Error(
          `${short(account)} holds ${fmt(bal)} of ${short(token)} — this order needs ${fmt(amount)}`)
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

  return {
    step, setStep, lockListing, unlockListing, deposit, approveSpending, transferToken, transferNative,
    signMessage,
    ready: wallets.length > 0,
  }
}
