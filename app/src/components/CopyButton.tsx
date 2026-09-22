import { useEffect, useRef, useState } from 'react'
import { ICheck, ICopy } from './icons'
import { useToast } from './Toast'

/**
 * Copy button: click it and the icon becomes a checkmark, then reverts after two seconds.
 *
 * Follows beui's Action Swap approach but in plain CSS -- two icons stacked on top of each other,
 * swapped with opacity and a small translate, no animation library needed.
 *
 * Why this feedback is mandatory: the clipboard is an invisible place. If nothing changes on click,
 * the only way to find out whether it worked is to paste somewhere else -- and most people will
 * just click again instead.
 *
 * The copy button this project used to have (copy address in WalletModals) worked exactly that way:
 * `onClick={() => navigator.clipboard?.writeText(addr)}`, no visible response at all, and clipboard
 * is undefined in a non-secure context -- where it did not even report an error.
 */
export default function CopyButton({
  text,
  label = 'Copy',
  done = 'Copied',
  className = 'btn btn-secondary btn-sm btn-icon',
}: {
  text: string
  /** Accessible name and tooltip for the button. */
  label?: string
  /** The sentence shown in the toast after a successful copy. */
  done?: string
  className?: string
}) {
  const [ok, setOk] = useState(false)
  const { toast } = useToast()
  const timer = useRef<number | null>(null)

  /* Clear the timer on unmount: closing this piece of UI within two seconds of copying (a modal,
     say) would otherwise run the callback against a component that is no longer there. */
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current) }, [])

  const copy = async () => {
    try {
      /* clipboard is undefined in a non-secure context (an http deployment) -- that is not "the call
         failed" but "the API is not there at all" -- so check explicitly, otherwise what is thrown
         here is a TypeError, which is meaningless if surfaced to the user. */
      if (!navigator.clipboard) throw new Error('needs HTTPS')
      await navigator.clipboard.writeText(text)
      setOk(true)
      toast(done)
      if (timer.current) clearTimeout(timer.current)
      timer.current = setTimeout(() => setOk(false), 2000) as unknown as number
    } catch {
      /* Failures have to be specific. "Copy failed" says nothing -- the user cannot tell whether to retry or try another way. */
      toast('Could not copy — select the text and press Ctrl+C', { kind: 'err' })
    }
  }

  return (
    <button className={className + ' swapbtn' + (ok ? ' on' : '')}
      type="button" title={ok ? done : label} aria-label={label}
      onClick={() => void copy()}>
      <span className="swapa" aria-hidden><ICopy /></span>
      <span className="swapb" aria-hidden><ICheck /></span>
    </button>
  )
}
