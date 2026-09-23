import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * Receive QR code -- it really does encode that address string.
 *
 * The reference has a decorative code there (aria-hidden, encoding nothing) and I originally
 * copied it. But a QR code that will not scan is worse than no QR code at all: people pull out
 * their phone and point it at it, and when nothing happens they assume their camera is at fault
 * and keep trying. And the entire point of this cell is "you do not have to copy 42 characters
 * by hand" -- unencoded, it is just a patch of noise shaped like a QR code.
 *
 * Error correction level M (~15%): this code is shown on a screen, it will not get smudged or
 * folded, so it does not need H's redundancy; and M is two versions smaller than H, so at the
 * same pixel size the modules are larger and easier to scan.
 *
 * Encoding is async, so when it cannot be drawn we leave the space empty rather than showing a
 * fake pattern -- a wrong code sends money somewhere else, blank is merely inconvenient.
 */
export default function Qr({ text, size = 116 }: { text: string; size?: number }) {
  const [svg, setSvg] = useState('')

  useEffect(() => {
    let live = true
    if (!text) { setSvg(''); return }
    QRCode.toString(text, {
      type: 'svg',
      errorCorrectionLevel: 'M',
      margin: 1,
      // Near-black for dark, paper-white for light: this code always sits on a white background,
      // and flipping it with the theme makes it unscannable (most scanners expect the
      // "dark code on light background" contrast direction).
      color: { dark: '#14161a', light: '#ffffff' },
    })
      .then(s => { if (live) setSvg(s) })
      .catch(() => { if (live) setSvg('') })
    return () => { live = false }
  }, [text])

  return (
    <div className="qrbox" style={{ width: size, height: size }}
      /* The address itself is right next to it and a screen reader can read that string; this image carries no extra information for it */
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
