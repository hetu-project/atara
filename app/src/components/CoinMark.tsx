import { useState } from 'react'

/**
 * Token icon as wallets show it.
 *
 * ERC-20 does not store a logo on chain. MetaMask / Trust Wallet load a PNG
 * keyed by the well-known contract (Tether, Circle, …). Those files live in
 * public/coins — testnet USDT is a different contract, so we look up by ticker.
 * Unknown tickers still fall back to a letter.
 */
const HUE: Record<string, number> = { USDT: 158, USDC: 220, BTC: 36, ETH: 250 }

const FILE: Record<string, string> = {
  USDT: '/coins/usdt.png',
  USDC: '/coins/usdc.png',
  BTC: '/coins/btc.png',
  ETH: '/coins/eth.png',
}

export const coinHue = (asset: string) => HUE[asset] ?? 200

export default function CoinMark({ asset, className }: { asset: string; className?: string }) {
  const src = FILE[asset]
  const [dead, setDead] = useState(false)
  const cls = 'acoin' + (className ? ' ' + className : '') + (src && !dead ? ' pic' : '')
  if (!src || dead) {
    return (
      <span className={cls} style={{ background: `hsl(${coinHue(asset)} 45% 40%)` }} aria-hidden>
        {asset.slice(0, 1)}
      </span>
    )
  }
  return (
    <span className={cls} aria-hidden>
      <img src={src} alt="" onError={() => setDead(true)} />
    </span>
  )
}
