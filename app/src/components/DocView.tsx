/**
 * What a qualification document is, who issued it, and what is in it.
 *
 * In the reference the "provided" ones are real links that open a generated document page. We do
 * not have that document -- the backend's docs are just a set of booleans saying "submitted or
 * not", not the file itself. So what unfolds here is the **description** of the material: what it
 * is, who issues it, what it covers, plus whether this counterparty has submitted it.
 *
 * We deliberately do not generate a document page with fabricated entries the way the reference
 * does: every line on that page would be read as real data about this counterparty, and it would
 * be made up. The description is real; a document we do not have is simply not there.
 */
export const DOC_META: Record<string, { n: string; by: string; what: string }> = {
  kyc: { n: 'Identity verification', by: 'Platform KYC provider',
    what: 'Government ID, liveness check and sanctions screening' },
  pof: { n: 'Proof of funds', by: 'The counterparty',
    what: 'Account balance attestation issued by their bank' },
  stm: { n: 'Bank statements', by: 'The counterparty',
    what: 'Last three months of activity on the settlement account' },
  poa: { n: 'Corporate authorization', by: 'The counterparty',
    what: 'Power of attorney and board resolution' },
  sow: { n: 'Source of wealth', by: 'The counterparty',
    what: 'Declared origin of funds with supporting records' },
  chain: { n: 'On-chain provenance', by: 'Platform analytics',
    what: 'Address history screened against sanctioned and mixer flows' },
}

export default function DocView({
  doc, has, peer, onClose,
}: { doc: string; has: boolean; peer: string; onClose: () => void }) {
  const m = DOC_META[doc]
  if (!m) return null
  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard msq">
        <header className="mhead">
          <h3>{m.n}</h3>
          <button className="sayic mx" title="Close" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <dl className="sfsum sfsum-rows">
            <div><dt>Issued by</dt><dd>{m.by}</dd></div>
            <div><dt>Covers</dt><dd>{m.what}</dd></div>
            <div><dt>On file</dt>
              <dd className={has ? 'ok' : ''}>
                {has ? `✓ ${peer} has provided it` : `✕ ${peer} has not provided it`}
              </dd></div>
          </dl>
          {has ? (
            /* Submitted does not mean we can show it to you: these are identity documents and bank
               statements, and who may see them is a separate question. Say plainly that it is on
               file rather than pretending it opens here. */
            <p className="rnote">
              Held on file and checked when the counterparty was verified. The document
              itself is not exposed in the console.
            </p>
          ) : (
            <p className="rnote">
              You can still trade — escrow release will rely on the remaining evidence.
            </p>
          )}
          <div className="dfoot">
            <button className="btn btn-primary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  )
}
