/**
 * Avatar. The hue is derived from the name -- the same person is the same
 * color everywhere, with no palette table to maintain. Taken from console.html's avSpan.
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
