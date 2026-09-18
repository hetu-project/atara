import { useState } from 'react'

/**
 * Token icon as wallets show it.
 *
 * ERC-20 does not store a logo on chain. MetaMask / Trust Wallet load a PNG
 * keyed by the well-known contract (Tether, Circle, …). Those files live in
 * public/coins — testnet USDT is a different contract, so we look up by ticker.
 * Unknown tickers still fall back to a letter.
 */
/* Fallback colour per ticker, used only when the PNG is missing or fails to
   load. Roughly each brand's hue so the letter block still reads right. */
const HUE: Record<string, number> = {
  USDT: 158, USDC: 220, DAI: 40,
  BTC: 36, ETH: 250, BNB: 45, tBNB: 45, TRX: 0, SOL: 270, XRP: 210, DOGE: 45,
  ADA: 215, AVAX: 0, MATIC: 265, POL: 265, DOT: 330, LTC: 215, LINK: 220,
  TON: 200, ATOM: 240, XLM: 200, UNI: 320, ARB: 215, OP: 0,
}

/* Icons in public/coins. Most are the CC0 set from spothq/cryptocurrency-icons
   at 128px; TON, ARB and OP come from the Trust Wallet assets repo because the
   CC0 set has no entry for them. Testnet coins reuse the mainnet logo: tBNB is
   BNB with no value, and a different mark would suggest a different asset. */
const FILE: Record<string, string> = {
  USDT: '/coins/usdt.png',
  USDC: '/coins/usdc.png',
  DAI: '/coins/dai.png',
  BTC: '/coins/btc.png',
  ETH: '/coins/eth.png',
  BNB: '/coins/bnb.png',
  tBNB: '/coins/bnb.png',
  TRX: '/coins/trx.png',
  SOL: '/coins/sol.png',
  XRP: '/coins/xrp.png',
  DOGE: '/coins/doge.png',
  ADA: '/coins/ada.png',
  AVAX: '/coins/avax.png',
  MATIC: '/coins/matic.png',
  POL: '/coins/matic.png',
  DOT: '/coins/dot.png',
  LTC: '/coins/ltc.png',
  LINK: '/coins/link.png',
  TON: '/coins/ton.png',
  ATOM: '/coins/atom.png',
  XLM: '/coins/xlm.png',
  UNI: '/coins/uni.png',
  ARB: '/coins/arb.png',
  OP: '/coins/op.png',
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
