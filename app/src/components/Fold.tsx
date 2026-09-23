import { useState } from 'react'

/**
 * A collapsible block that can animate.
 *
 * Replaces native `<details>`: that one snaps open with no height transition -- a
 * 25-field submission body pops open and everything below teleports, forcing the
 * reader to find their place again.
 *
 * Expands via grid-template-rows from 0fr to 1fr rather than guessing a max-height:
 * guess too small and content is clipped, guess too large and the first half of the
 * collapse animation runs on empty. This works for any height, at the cost of one
 * extra wrapper element.
 */
export default function Fold({
  summary,
  children,
  className = '',
  defaultOpen = false,
}: {
  summary: React.ReactNode
  children: React.ReactNode
  className?: string
  defaultOpen?: boolean
}) {
  const [open, setOpen] = useState(defaultOpen)
  return (
    <div className={'fold ' + className + (open ? ' on' : '')}>
      <button type="button" className="foldsum" aria-expanded={open}
        onClick={() => setOpen(o => !o)}>
        <span className="foldmk" aria-hidden />
        {summary}
      </button>
      {/* Both layers are required: the outer one animates grid-template-rows, the inner
          one clips the overflow. Merged into one, content spills out while collapsing. */}
      <div className="foldwrap">
        <div className="foldin">{children}</div>
      </div>
    </div>
  )
}
