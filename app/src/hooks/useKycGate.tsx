import { createContext, useCallback, useContext, useMemo, useState } from 'react'
import * as ep from '../api/endpoints'
import MakerFlow from '../components/MakerFlow'
import { useApi } from './useApi'
import { go } from './useRoute'

interface Ctx {
  /** 返回 true 表示被拦下了：调用方应当停手，门会自己弹出来。 */
  require: () => boolean
  openMaker: () => void
  /** 身份是否已经审过。账户页要照实显示，不能写死成「已验证」。 */
  kycOk: boolean
  /** 交过材料但还没审完——这两个状态在界面上不是一回事。 */
  kycPending: boolean
  /**
   * 准入向导那张卡。参照里它不是弹窗，是挂在 Atara AI 会话里的一张卡片
   * （console.html 的 paintMaker），所以由首页把它渲染进对话区，
   * 而不是在这里盖一层 overlay。
   */
  maker: React.ReactNode | null
}
const KycCtx = createContext<Ctx>({
  require: () => false, openMaker: () => {}, kycOk: false, kycPending: false, maker: null,
})
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

  /* 卡片长在首页的对话区里，所以开之前先把人带回首页——
     否则在 Discover 上点「验证」会什么都看不见。 */
  const openMaker = useCallback(() => { go({ view: 'home' }); setWhy('maker'); setOpen(true) }, [])

  const showMaker = open && !(why === 'trade' && !app?.kyc_done)

  const value = useMemo(() => ({
    require, openMaker,
    kycOk: !!app?.kyc_ok,
    kycPending: !!app?.kyc_done && !app?.kyc_ok,
    maker: showMaker ? (
      <MakerFlow app={app ?? null} identity={identity}
        onClose={() => setOpen(false)}
        /* 提交后不关：让 app 重新拉一次，卡片自己切成回执/审核中那一态。
           直接关掉的话，界面一片空白，人会以为没提交成功。 */
        onDone={reload} />
    ) : null,
  }), [require, openMaker, app, showMaker, identity, reload])

  return (
    <KycCtx.Provider value={value}>
      {children}
      {/* 不把人默默甩进一张表单：先说清为什么要验，他点了头再进。
          跳转本身不是提示。这一层仍然是弹窗，参照也是。 */}
      {open && why === 'trade' && !app?.kyc_done && (
        <Explain onClose={() => setOpen(false)}
          onGo={() => { go({ view: 'home' }); setWhy('maker') }} />
      )}
    </KycCtx.Provider>
  )
}

function Explain({ onClose, onGo }: { onClose: () => void; onGo: () => void }) {
  return (
    <div id="modal" role="dialog" aria-modal="true"
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      {/* msq 是参照给这类「一句话 + 一个动作」的弹窗留的窄居中版式，
          配 sqi 那块图标。原来只用了 mcard，于是文字左对齐、没有图标，
          跟参照差得很明显。 */}
      <div className="mcard msq">
        <header className="mhead">
          <h3>Verify your identity</h3>
          <button className="sayic" aria-label="Close" onClick={onClose}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
              strokeWidth="1.5" strokeLinecap="round" aria-hidden><path d="m4 4 8 8M12 4l-8 8" /></svg>
          </button>
        </header>
        <div className="mbody">
          <div className="sqi">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M12 2.6 4.6 5.6v5.5c0 4.4 3 8.5 7.4 9.8 4.4-1.3 7.4-5.4 7.4-9.8V5.6Z" />
              <circle cx="12" cy="10" r="2.4" />
              <path d="M8.4 16.4a4 4 0 0 1 7.2 0" />
            </svg>
          </div>
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
