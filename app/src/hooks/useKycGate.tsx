import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import * as ep from '../api/endpoints'
import MakerFlow from '../components/MakerFlow'
import { useApi } from './useApi'

interface Ctx {
  /** 返回 true 表示被拦下了：调用方应当停手，门会自己弹出来。 */
  require: () => boolean
  openMaker: () => void
}
const KycCtx = createContext<Ctx>({ require: () => false, openMaker: () => {} })
export const useKycGate = () => useContext(KycCtx)

/**
 * 首次交易前的身份门。
 *
 * 为什么买家也要验：OTC 的法币腿点对点走银行，付款方必须是可识别的人——
 * 这不是做市方专属的要求。所以 `kyc_ok` 这一个标记同时管两件事：
 * 能不能下单，以及做市准入走到了哪一步。
 */
export function KycProvider({ identity, children }: { identity: string; children: React.ReactNode }) {
  const { data: app, reload } = useApi(() => ep.makerApp(identity), [identity])
  const [open, setOpen] = useState(false)
  const [why, setWhy] = useState<'trade' | 'maker'>('trade')

  const require = useCallback(() => {
    if (app?.kyc_ok) return false
    setWhy('trade')
    setOpen(true)
    return true
  }, [app])

  const openMaker = useCallback(() => { setWhy('maker'); setOpen(true) }, [])

  const value = useMemo(() => ({ require, openMaker }), [require, openMaker])

  return (
    <KycCtx.Provider value={value}>
      {children}
      {open && (
        <>
          {/* 不把人默默甩进一张表单：先说清为什么要验，他点了头再进。
              跳转本身不是提示。 */}
          {why === 'trade' && !app?.kyc_done ? (
            <Explain onClose={() => setOpen(false)} onGo={() => setWhy('maker')} />
          ) : (
            <MakerFlow app={app ?? null} identity={identity}
              onClose={() => setOpen(false)}
              onDone={() => { reload(); setOpen(false) }} />
          )}
        </>
      )}
    </KycCtx.Provider>
  )
}

function Explain({ onClose, onGo }: { onClose: () => void; onGo: () => void }) {
  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className="mcard">
        <header className="mhead">
          <h3>Verify your identity</h3>
          <button className="sayic" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <p className="acnote">
            A one-time check before your first trade — the fiat leg goes bank to bank,
            so the payer has to be identifiable.
          </p>
          <div className="dfoot">
            <button className="btn btn-primary" onClick={onGo}>Verify identity →</button>
          </div>
        </div>
      </div>
    </div>
  )
}
