/**
 * 头像。色相由名字算出来——同一个人在任何地方都是同一个颜色，
 * 不用维护一张配色表。取自 console.html 的 avSpan。
 */
export function avInit(name: string): string {
  return name.split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase()
}

export function avHue(name: string): number {
  let h = 0
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) % 360
  return h
}

export default function Avatar({ name, cls = 'cpav' }: { name: string; cls?: string }) {
  return (
    <span className={cls} style={{ background: `hsl(${avHue(name)} 42% 34%)`, color: '#fff' }}>
      {avInit(name)}
    </span>
  )
}
