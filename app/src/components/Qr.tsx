import { useEffect, useState } from 'react'
import QRCode from 'qrcode'

/**
 * 收款二维码 —— 真的编码那串地址。
 *
 * 参照那边是一块装饰性的码（aria-hidden，不编码任何内容），我原来照抄了。
 * 但一个扫不出来的二维码比没有二维码更糟：人会掏出手机对着它扫，扫不到就
 * 以为是自己相机的问题，反复试。而这一格的全部意义就是「不用手抄这 42 个
 * 字符」——不编码的话它只是一块看起来像二维码的噪点。
 *
 * 纠错等级取 M（约 15%）：这个码显示在屏幕上，不会被弄脏或折叠，不需要 H
 * 那样的冗余；而 M 比 H 少两个版本，同样的像素尺寸下格子更大、更好扫。
 *
 * 编码是异步的，所以画不出来的时候留空而不是留一块假的图案——错误的码会
 * 把钱打到别处去，空白至少只是不方便。
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
      // 深色用近黑、浅色用纸白：这块码始终是白底的，跟着主题翻会扫不出来
      // （多数扫码器认的是「深色码 + 浅色底」这个对比方向）。
      color: { dark: '#14161a', light: '#ffffff' },
    })
      .then(s => { if (live) setSvg(s) })
      .catch(() => { if (live) setSvg('') })
    return () => { live = false }
  }, [text])

  return (
    <div className="qrbox" style={{ width: size, height: size }}
      /* 地址本身就在旁边，屏幕阅读器读那一串即可；这块图对它没有额外信息 */
      aria-hidden
      dangerouslySetInnerHTML={{ __html: svg }} />
  )
}
