import { useCallback, useState } from 'react'
import { useWallets } from '@privy-io/react-auth'
import {
  createPublicClient, createWalletClient, custom, defineChain, http,
  type Address, type Hex,
} from 'viem'
import type { ChainRow } from '../api/types'

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

const ERC20 = [
  { name: 'approve', type: 'function', stateMutability: 'nonpayable',
    inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }],
    outputs: [{ type: 'bool' }] },
  { name: 'allowance', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }],
    outputs: [{ type: 'uint256' }] },
  { name: 'balanceOf', type: 'function', stateMutability: 'view',
    inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
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
 * 钱包那一侧出的错。
 *
 * 打上标记，好让调用方知道「这条已经在交易进度那里显示过了」——不然
 * 同一句话会被外层的错误提示再显示一遍，看着像出了两次错。
 */
export class WalletTxError extends Error {
  readonly walletTx = true
}
export const isWalletTxError = (e: unknown): e is WalletTxError =>
  e instanceof Error && (e as WalletTxError).walletTx === true

/** 钱包报错常常是一大段 JSON-RPC 原文。取第一句给人看，别把整段糊上去。 */
function readable(e: unknown): string {
  const raw = e instanceof Error ? e.message : String(e)
  if (/User rejected|denied transaction|User denied/i.test(raw)) {
    return 'You cancelled that transaction in your wallet'
  }
  if (/insufficient funds/i.test(raw)) {
    return 'Not enough native coin in this wallet to pay gas'
  }
  return raw.split('\n')[0]!.slice(0, 200)
}

/**
 * @param info 这笔交易要发在哪条链上。挂单选了哪个网络就传哪条——
 *   不是「后端连着哪条」：一条挂单说自己在 BASE 上，钱包就该切到 BASE。
 */
export function useWalletTx(info: ChainRow | null) {
  const { wallets } = useWallets()
  const [step, setStep] = useState<TxStep>({ k: 'idle' })

  /** 拿到能签名的客户端，并确保钱包停在正确的链上。 */
  const connect = useCallback(async () => {
    if (!info) throw new Error('Pick a network first')
    if (!info.deployed) {
      throw new Error(`${info.name} has no escrow contract yet — nothing can be locked there`)
    }
    const w = wallets[0]
    if (!w) throw new Error('No wallet connected — sign in with a wallet first')
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
    const current = await provider.request({ method: 'eth_chainId' })
    if (parseInt(String(current), 16) !== info.chain_id) {
      try {
        await w.switchChain(info.chain_id)
      } catch (e) {
        /* 钱包里没添加过这条链时，switch 会报 4902（不认识）。测试网尤其
           常见——没人手动加过 BSC 测试网。这时该替他加上，而不是甩一句
           「请自己切过去」让他去翻钱包设置。 */
        const code = (e as { code?: number })?.code
        const unknown = code === 4902 || /Unrecognized chain|not been added/i.test(String(e))
        if (!unknown) {
          throw new Error(`Switch your wallet to ${info.name} (chain ${info.chain_id})`)
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
  }, [info, wallets])

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
      if (bal < amount) throw new Error('Not enough of that coin in this wallet')

      const allowed = await pub.readContract({
        address: token, abi: ERC20, functionName: 'allowance', args: [account, escrow],
      })
      if (allowed < amount) {
        setStep({ k: 'wallet', msg: 'Approve the escrow contract in your wallet' })
        const h = await wallet.writeContract({
          address: token, abi: ERC20, functionName: 'approve',
          args: [escrow, amount], chain, account,
        })
        setStep({ k: 'mining', msg: 'Approving', hash: h })
        const rc = await pub.waitForTransactionReceipt({ hash: h })
        if (rc.status !== 'success') throw new Error('The approval transaction failed')
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
      setStep({ k: 'wallet', msg: 'Approve the spending contract in your wallet' })
      const h = await wallet.writeContract({
        address: token, abi: ERC20, functionName: 'approve',
        args: [spender, amount], chain, account,
      })
      setStep({ k: 'mining', msg: 'Approving', hash: h })
      const rc = await pub.waitForTransactionReceipt({ hash: h })
      if (rc.status !== 'success') throw new Error('The approval transaction failed')
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

  return {
    step, setStep, lockListing, unlockListing, approveSpending,
    ready: wallets.length > 0,
  }
}
