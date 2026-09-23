import type { ReactNode } from 'react'
import CopyButton from './CopyButton'

/**
 * Four primitives, the handful of blocks that recur throughout the pages.
 *
 * Why this file exists: the payment card alone had eight separately defined row types -- `.payrow`,
 * `.rcpick`, `.payproof`, `.paywarn`, `.payto`, `.dhead`, `.dfoot`, `.dpay` -- each with its own few
 * lines of CSS, each defining its own spacing, size and colour. It looked assembled from scraps,
 * because it was: every new block got a new chunk of styles, and nobody ever stopped to ask "is this
 * the same kind of thing as the one above?".
 *
 * The boundaries are taken from shadcn/ui's Item / Input Group / Alert / Empty -- not the code (that
 * needs Radix plus Tailwind, and we have neither), but **the names it gives each block**. With names,
 * the receipt page and the payout row stop growing into two different shapes.
 */

/**
 * A row of things: identifier on the left, content in the middle, action on the right.
 *
 * What an item in a list looks like, defined once here. The receipt page, payout accounts and asset
 * rows are all this.
 */
export function Row({
  lead, title, sub, trail, className = '',
}: {
  lead?: ReactNode
  title: ReactNode
  /** The small line under the title. Takes no height when absent. */
  sub?: ReactNode
  trail?: ReactNode
  className?: string
}) {
  return (
    <div className={'uirow ' + className}>
      {lead ? <span className="uilead">{lead}</span> : null}
      <span className="uibody">
        <span className="uititle">{title}</span>
        {sub ? <span className="uisub">{sub}</span> : null}
      </span>
      {trail ? <span className="uitrail">{trail}</span> : null}
    </div>
  )
}

/**
 * A group of values meant to be copied away.
 *
 * **No box.** The previous version wrapped it in a box with internal dividers, when it already sat
 * inside payblk, which itself sat inside a card -- three layers of border around three strings, and in
 * the dark theme those three layers differ by less than one step of background, so it was all grey on grey.
 *
 * Hierarchy is built with whitespace and type size instead: labels down to 11px uppercase, values up to
 * 15px, labels above the values rather than beside them. One layer of border fewer, one step of contrast more.
 */
export function ValueGroup({ children }: { children: ReactNode }) {
  return <div className="uivg">{children}</div>
}

/**
 * A single value meant to be copied away: label on top, value below, copy key up against the value.
 *
 * The label goes on top because the value is the subject -- side by side, the label takes a fixed column
 * width and squeezes the value into the middle, when the value is the only thing meant to be read and copied.
 *
 * `copyText` exists because **what is read and what is copied are not always the same string**: an amount
 * reads as 14,680 yuan but must be copied as 14680 -- pasted into a bank's amount field with the symbol and
 * separators, it is either rejected or silently truncated.
 *
 * `big` is for the subject of a group. In a transfer, the thing actually copied wrong is the account
 * number, and it deserves more prominence than the amount beside it.
 */
export function Value({
  label, children, copyText, copied, note, big,
}: {
  label: string
  children: ReactNode
  /** What actually lands on the clipboard. Defaults to the displayed content. */
  copyText?: string
  copied?: string
  /** A small marker after the value, such as "required". */
  note?: string
  big?: boolean
}) {
  const text = copyText ?? String(children)
  return (
    <div className={'uival' + (big ? ' big' : '')}>
      <span className="uivk">{label}{note ? <em>{note}</em> : null}</span>
      <span className="uivrow">
        <span className="uivv">{children}</span>
        <CopyButton text={text} label={`Copy ${label.toLowerCase()}`}
          done={copied ?? `${label} copied`} className="uivc" />
      </span>
    </div>
  )
}

/**
 * A sentence meant to be read, in three weights.
 *
 * The `warn` weight is for "what happens if you do not". It used to be the same type size as an ordinary
 * explanation, when it is the heaviest sentence on the whole card -- a cost has to appear with the weight
 * of a cost.
 */
export function Note({
  kind = 'info', children,
}: { kind?: 'info' | 'warn' | 'neg' | 'ok'; children: ReactNode }) {
  const icon = { info: 'ⓘ', warn: '⚠', neg: '⚠', ok: '✓' }[kind]
  return (
    <p className={'uinote uinote-' + kind}>
      <span className="uiicon" aria-hidden>{icon}</span>
      <span>{children}</span>
    </p>
  )
}

/**
 * A place where something should be and is not.
 *
 * Empty space reads as "still loading", and those two ask for opposite actions: one is wait, the other is
 * stop waiting and go ask. So what is missing and what to do next both have to be written out.
 */
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="uiempty">
      <b>{title}</b>
      {children ? <span>{children}</span> : null}
    </div>
  )
}
