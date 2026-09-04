/**
 * 浏览器里到底装了哪些钱包。
 *
 * 不能只看 window.ethereum：装了两个以上扩展时，那个全局变量归谁是
 * 抢注入顺序抢出来的——用户点「OKX」结果弹出 MetaMask，是这一类
 * 集成最经典的坑。EIP-6963 就是为了解决它：每个钱包自己广播一条
 * 带 rdns 的记录，各拿各的 provider，互不覆盖。
 *
 * 老版本扩展不广播，所以每个钱包再留一条按私有全局变量取的退路。
 */

export interface Eip1193 {
  request(a: { method: string; params?: unknown[] }): Promise<unknown>
}

interface Info {
  uuid: string
  name: string
  icon: string
  rdns: string
}

interface Announce extends CustomEvent<{ info: Info; provider: Eip1193 }> {}

export interface WalletSpec {
  key: string
  label: string
  /** EIP-6963 的反向域名标识。 */
  rdns: string
  /** 广播里没有 rdns 或者对不上时，退一步按名字匹配。 */
  match: RegExp
  /** 图标是个色块加一个字母，和参照设计一致。 */
  bg: string
  ch: string
  /** 没装时给一条能走通的路。 */
  install: string
}

/** 顺序就是登录门里的显示顺序。 */
export const WALLETS: WalletSpec[] = [
  { key: 'phantom', label: 'Phantom', rdns: 'app.phantom', match: /phantom/i,
    bg: '#AB9FF2', ch: 'P', install: 'https://phantom.com/download' },
  { key: 'metamask', label: 'MetaMask', rdns: 'io.metamask', match: /metamask/i,
    bg: '#E2761B', ch: 'M', install: 'https://metamask.io/download/' },
  { key: 'okx', label: 'OKX Wallet', rdns: 'com.okex.wallet', match: /okx|okex/i,
    bg: '#000000', ch: 'O', install: 'https://www.okx.com/web3' },
]

type Announced = { info: Info; provider: Eip1193 }

/**
 * 发起一次 EIP-6963 探询并收集回应。
 *
 * 广播是同步派发的，但扩展的注入脚本可能比页面晚一点就位，所以
 * 调用方要能接受「先返回空、随后补上」——Gate 里用的是订阅式。
 */
export function discover(onFound: (list: Announced[]) => void): () => void {
  const found = new Map<string, Announced>()
  const on = (e: Event) => {
    const d = (e as Announce).detail
    if (!d?.info || !d?.provider) return
    found.set(d.info.uuid, d)
    onFound([...found.values()])
  }
  window.addEventListener('eip6963:announceProvider', on)
  window.dispatchEvent(new Event('eip6963:requestProvider'))
  // 扩展注入晚于首屏是常态，隔一拍再问一次
  const again = setTimeout(() => window.dispatchEvent(new Event('eip6963:requestProvider')), 400)
  return () => {
    clearTimeout(again)
    window.removeEventListener('eip6963:announceProvider', on)
  }
}

interface Legacy {
  ethereum?: Eip1193 & { isMetaMask?: boolean; providers?: (Eip1193 & { isMetaMask?: boolean })[] }
  okxwallet?: Eip1193
  phantom?: { ethereum?: Eip1193 }
}

/** 不广播的老扩展：按各家的私有全局变量取。 */
function legacyProvider(key: string): Eip1193 | null {
  const w = window as unknown as Legacy
  if (key === 'okx') return w.okxwallet ?? null
  // Phantom 主场是 Solana，但它同时注入一个 EVM provider。
  // 这套系统的地址是 0x，所以要的是 phantom.ethereum，不是 phantom.solana。
  if (key === 'phantom') return w.phantom?.ethereum ?? null
  if (key === 'metamask') {
    const e = w.ethereum
    if (!e) return null
    if (Array.isArray(e.providers)) return e.providers.find(p => p.isMetaMask) ?? null
    return e.isMetaMask ? e : null
  }
  return null
}

/** 在已广播的列表里找这个钱包；找不到就退回私有全局变量。 */
export function resolve(spec: WalletSpec, announced: Announced[]): Eip1193 | null {
  const hit = announced.find(a => a.info.rdns === spec.rdns)
    ?? announced.find(a => spec.match.test(a.info.name))
  return hit?.provider ?? legacyProvider(spec.key)
}

/** 要地址。钱包会弹窗让用户确认——这一步不花钱，只是证明地址是他的。 */
export async function requestAddress(p: Eip1193): Promise<string> {
  const accts = await p.request({ method: 'eth_requestAccounts' }) as string[]
  const addr = accts?.[0]
  if (!addr) throw new Error('Wallet returned no account')
  return addr
}
