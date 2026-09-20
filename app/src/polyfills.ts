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
