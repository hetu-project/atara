/**
 * Node's Buffer does not exist in the browser.
 *
 * Privy's embedded wallet hits Buffer-backed encoding (Coinbase SDK and
 * similar) when it signs. Vite does not polyfill that, so the wallet modal
 * shows "Buffer is not defined" — not a bad transfer, a missing Node API.
 * This has to be installed before any wallet code runs.
 */
import { Buffer } from 'buffer'

/* Cast to a fresh shape instead of intersecting with globalThis' own type.
   @types/node already declares `process` as the full Node Process, so the
   intersection makes g.process require all sixty-odd of its members — and the
   one line below, which installs a two-field stand-in, stops compiling. The
   shape here says what this file actually touches, which is all it needs. */
const g = globalThis as unknown as {
  Buffer: typeof Buffer
  global?: typeof globalThis
  process?: { env: Record<string, string | undefined> }
}
g.Buffer = Buffer
// globalThis, not g: g is the narrow view above, and this global is the real one.
g.global ??= globalThis
g.process ??= { env: {} }

/*
 * Browser page translation versus React's DOM ownership.
 *
 * Chrome's "Translate this page" rewrites the document in place: every text
 * node becomes a <font> wrapper holding the translation, so the node React
 * created is no longer where React left it. React keeps its own picture of the
 * tree and does not look before it acts. The next state change that removes
 * or reorders a piece of text -- a balance updating, a countdown ticking, a
 * strip appearing -- has React call removeChild / insertBefore on a node that
 * is no longer a child of that parent, the browser throws
 *
 *   Failed to execute 'removeChild' on 'Node': The node to be removed is not
 *   a child of this node.
 *
 * and the error boundary takes the whole console down. A translated page is a
 * normal way for a non-English speaker to use this product, so this is not
 * the user's fault to fix.
 *
 * The guard below is the widely used mitigation from facebook/react#11538:
 * when the child's actual parent is not the node being asked, removeChild
 * hands the node back instead of throwing, and insertBefore falls back to
 * appendChild. Nothing changes when the parent is right, which is every call
 * on an untranslated page. React's own bookkeeping stays consistent; the
 * translated wrapper is simply left where the browser put it. Installed here
 * because this file runs before React mounts.
 */
if (typeof Node === 'function' && Node.prototype) {
  const proto = Node.prototype
  const removeChild = proto.removeChild
  proto.removeChild = function <T extends Node>(this: Node, child: T): T {
    if (child.parentNode !== this) {
      if (import.meta.env.DEV) {
        console.warn('removeChild on a node the browser moved (page translation?) — ignored', child)
      }
      return child
    }
    return removeChild.call(this, child) as T
  }
  const insertBefore = proto.insertBefore
  proto.insertBefore = function <T extends Node>(this: Node, node: T, ref: Node | null): T {
    if (ref && ref.parentNode !== this) {
      if (import.meta.env.DEV) {
        console.warn('insertBefore against a node the browser moved (page translation?) — appended instead', ref)
      }
      return proto.appendChild.call(this, node) as T
    }
    return insertBefore.call(this, node, ref) as T
  }
}
