/**
 * 图标逐个取自 console.html，路径原样搬过来——
 * 重画一遍等于换了一套图标，视觉上立刻能看出不是同一个产品。
 */
type P = { size?: number }
export type Icon = (p?: P) => JSX.Element
const S = (n = 20) => ({
  width: n, height: n, viewBox: '0 0 16 16', fill: 'none',
  stroke: 'currentColor', strokeWidth: 1.2,
  strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const INewOrder = ({ size }: P = {}) => (
  <svg {...S(size)}>
    <path d="M13.4 8.5V12a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 12V4.1A1.5 1.5 0 0 1 4 2.6h3.5" />
    <path d="M11.1 2.4a1.4 1.4 0 0 1 2 2L8.6 8.9l-2.6.6.6-2.6 4.5-4.5Z" />
  </svg>
)

export const IDiscover = ({ size }: P = {}) => (
  <svg {...S(size)}>
    <circle cx="8" cy="8" r="6" />
    <path d="m10.4 5.6-1.2 3.6-3.6 1.2 1.2-3.6 3.6-1.2Z" />
  </svg>
)

export const IContacts = ({ size }: P = {}) => (
  <svg {...S(size)}>
    <circle cx="6" cy="5.5" r="2.6" />
    <path d="M1.8 13.4c.6-2.4 2.3-3.6 4.2-3.6s3.6 1.2 4.2 3.6" />
    <path d="M10.6 3.2a2.6 2.6 0 0 1 0 4.6M12.4 9.9c1 .5 1.7 1.7 2 3.5" />
  </svg>
)

export const IPayments = ({ size }: P = {}) => (
  <svg {...S(size)}>
    <circle cx="8" cy="8" r="5.5" />
    <path d="M8 5.2V8l2 1.4" />
  </svg>
)

export const IApi = ({ size }: P = {}) => (
  <svg {...S(size)}><path d="M6.2 10.6 3.6 8l2.6-2.6M9.8 5.4 12.4 8l-2.6 2.6" /></svg>
)

export const IChart = ({ size }: P = {}) => (
  <svg {...S(size)}>
    <path d="M2.4 13.6V2.6" /><path d="M2.4 13.6h11.2" />
    <path d="m4.6 10.4 2.6-3 2.4 1.8 3.2-4.4" />
  </svg>
)

/** 外链角标。导航行尾那个小箭头。 */
export const IGo = () => (
  <svg width="13" height="13" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.35" strokeLinecap="round" strokeLinejoin="round">
    <path d="M9.6 2.6h3.8v3.8" /><path d="M13.4 2.6 7.9 8.1" />
    <path d="M11.9 9.6v2.9a1.5 1.5 0 0 1-1.5 1.5H3.6a1.5 1.5 0 0 1-1.5-1.5V5.6a1.5 1.5 0 0 1 1.5-1.5h2.9" />
  </svg>
)

export const IPanel = ({ mirror }: { mirror?: boolean }) => (
  <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="2" y="3" width="12" height="10" rx="1.6" />
    <path d={mirror ? 'M9.8 3v10' : 'M6.2 3v10'} />
  </svg>
)

export const IBuy = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 3v8M4.5 7.5 8 11l3.5-3.5" /><path d="M3 13.5h10" />
  </svg>
)

export const ISell = () => (
  <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 13V5M4.5 8.5 8 5l3.5 3.5" /><path d="M3 2.5h10" />
  </svg>
)

export const IAttach = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="m12.2 7.2-4.6 4.6a2.6 2.6 0 0 1-3.7-3.7l4.9-4.9a1.8 1.8 0 0 1 2.5 2.5L6.6 10.4a.9.9 0 0 1-1.3-1.3l4.3-4.3" />
  </svg>
)

export const IMic = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="6" y="2.5" width="4" height="7" rx="2" /><path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5v1.5" />
  </svg>
)

export const ISend = () => (
  <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M8 12.5v-9M4.5 7 8 3.5 11.5 7" />
  </svg>
)

/* ── 账户页用的小图标，逐字取自 console.html ── */
export const CHIP = () => (
  <svg className="cchip" width="21" height="15" viewBox="0 0 22 16" fill="none"
    stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" aria-hidden>
    <path d="M2.8 15.2V9.2a8.2 8.2 0 0 1 16.4 0v6" />
    <path d="M6.9 15.2v-3.6M11 15.2v-5.8M15.1 15.2v-3.6" />
  </svg>
)
const sm = { width: 13, height: 13, viewBox: '0 0 16 16', fill: 'none', stroke: 'currentColor',
  strokeWidth: 1.5, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true }

export const IPen = () => (
  <svg {...sm}><path d="M11.2 2.3a1.4 1.4 0 0 1 2 2L5.6 11.9l-2.9.7.7-2.9 7.8-7.4Z" /></svg>
)
export const ICopy = () => (
  <svg {...sm}><rect x="5.5" y="5.5" width="8" height="8" rx="1.6" />
    <path d="M10.5 3.2A1.7 1.7 0 0 0 8.8 2.5H4.2a1.7 1.7 0 0 0-1.7 1.7v4.6c0 .7.4 1.3 1 1.6" /></svg>
)
export const ICheck = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8.5 6.2 11.7 13 4.9" /></svg>
)
export const IArrow = () => (
  <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M3 8h9M8.5 4.5 12 8l-3.5 3.5" /></svg>
)
export const IPower = () => (
  <svg {...sm}><path d="M8 2v4.6" /><path d="M4.6 4.5a5 5 0 1 0 6.8 0" /></svg>
)
export const IFlip = () => (
  <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor"
    strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d="M13 6.5A5 5 0 0 0 3.4 5.2" /><path d="M3 3v2.4h2.4" />
    <path d="M3 9.5a5 5 0 0 0 9.6 1.3" /><path d="M13 13v-2.4h-2.4" /></svg>
)
