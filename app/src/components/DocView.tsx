/**
 * 一份资质件是什么、谁出的、里面有什么。
 *
 * 参照里「已提供」的那几个是真链接，点开是一张生成的文件页。我们这边没有那份
 * 文件——后端的 docs 只是一组布尔值，说的是「交没交」，不是文件本身。所以这里
 * 摊开的是这份材料的**说明**：它是什么、由谁出具、覆盖哪些内容，再说清这一家
 * 交没交。
 *
 * 不照着参照生成一张带假条目的文件页：那页上的每一行都会被当成这家对手方的
 * 真实资料读，而它们是编的。说明是真的，文件没有就是没有。
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
            /* 交了不等于我们能把它给你看：这些是身份证件和银行流水，谁能看
               是另一回事。说清楚它在档案里，而不是假装这里点开就能读。 */
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
