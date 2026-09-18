import { CTRY } from './banks'

/**
 * What a bank account number can look like — per country, and per bank where
 * that is knowable. Mirror of atara-pay/internal/bankfmt; change both together.
 * This copy only produces the live hint under the field. The server copy is the
 * one that decides.
 *
 * Three tones. `bad` cannot be a real account here (a mainland number of eight
 * digits, a UnionPay card whose check digit fails, a Thai account of six digits)
 * and stops the save. `warn` is unusual but possible (a card whose issuer prefix
 * belongs to another bank; a bare number for a country that pays by IBAN) and is
 * shown, never enforced — the per-bank tables are a first pass, and a gap in
 * them must cost a needless hint, not a blocked account. `ok` may carry a
 * read-out.
 *
 * Three layers, coarse to fine: the country envelope, which covers every bank
 * in the catalogue because every bank there has a country; usual lengths at
 * banks known to use one; and for mainland China the card-number rules.
 */
export type AcctCheck = { s: 'empty' | 'ok' | 'warn' | 'bad'; msg?: string }

export const normalize = (raw: string) => raw.replace(/[\s-]/g, '').toUpperCase()

/** Which country a currency's accounts are usually in. USD is anywhere. */
export const countryOfCurrency = (ccy: string): string =>
  ({ CNY: 'CN', HKD: 'HK', SGD: 'SG', JPY: 'JP' } as Record<string, string>)[ccy] ?? ''

// ── IBAN ──

/* Fixed IBAN length per country (ISO 13616). Unlisted: the 15–34 envelope. */
const IBAN_LEN: Record<string, number> = {
  AE: 23, AT: 20, BE: 16, BG: 22, BH: 22, CH: 21, CY: 28, CZ: 24, DE: 22, DK: 18, EE: 20,
  ES: 24, FI: 18, FR: 27, GB: 22, GR: 27, HR: 21, HU: 28, IE: 22, IL: 23, IS: 26, IT: 27,
  LI: 21, LT: 20, LU: 20, LV: 21, MC: 27, MT: 31, NL: 18, NO: 15, PL: 28, PT: 25, QA: 29,
  RO: 24, SA: 24, SE: 24, SI: 19, SK: 24, SM: 27, TR: 26,
}

function checkIBAN(v: string): AcctCheck {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(v)) {
    return { s: 'bad', msg: 'An IBAN is 15–34 characters — check for a missing block' }
  }
  const cc = v.slice(0, 2)
  const want = IBAN_LEN[cc]
  if (want && v.length !== want) {
    return { s: 'bad', msg: `A ${cc} IBAN is ${want} characters — this one is ${v.length}` }
  }
  const r = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  let m = 0
  for (const d of r) m = (m * 10 + Number(d)) % 97
  return m === 1
    ? { s: 'ok', msg: `IBAN checksum valid · ${CTRY[cc] ?? cc}` }
    : { s: 'bad', msg: 'IBAN checksum does not match — one character is wrong' }
}

// ── Country envelopes ──

interface Country { name: string; min: number; max: number; iban?: boolean }

/* Covers every country in banks.ts. Ranges are generous — with and without a
   branch code — so that `bad` here means impossible, not merely unusual. */
const COUNTRIES: Record<string, Country> = {
  HK: { name: 'Hong Kong', min: 7, max: 15 },
  SG: { name: 'Singapore', min: 7, max: 12 },
  JP: { name: 'Japanese', min: 7, max: 14 },
  KR: { name: 'Korean', min: 10, max: 16 },
  TW: { name: 'Taiwanese', min: 9, max: 17 },
  US: { name: 'US', min: 4, max: 17 },
  TH: { name: 'Thai', min: 10, max: 12 },
  VN: { name: 'Vietnamese', min: 6, max: 19 },
  MY: { name: 'Malaysian', min: 7, max: 16 },
  PH: { name: 'Philippine', min: 10, max: 16 },
  ID: { name: 'Indonesian', min: 10, max: 16 },
  IN: { name: 'Indian', min: 9, max: 18 },
  AU: { name: 'Australian', min: 6, max: 16 },
  GB: { name: 'UK', min: 0, max: 0, iban: true },
  DE: { name: 'German', min: 0, max: 0, iban: true },
  FR: { name: 'French', min: 0, max: 0, iban: true },
  ES: { name: 'Spanish', min: 0, max: 0, iban: true },
  IT: { name: 'Italian', min: 0, max: 0, iban: true },
  NL: { name: 'Dutch', min: 0, max: 0, iban: true },
  CH: { name: 'Swiss', min: 0, max: 0, iban: true },
  LI: { name: 'Liechtenstein', min: 0, max: 0, iban: true },
  AT: { name: 'Austrian', min: 0, max: 0, iban: true },
  SE: { name: 'Swedish', min: 0, max: 0, iban: true },
  DK: { name: 'Danish', min: 0, max: 0, iban: true },
  AE: { name: 'UAE', min: 0, max: 0, iban: true },
}

/* Usual length at banks known to use one, by country then catalogue name.
   A mismatch only warns: "usually", not "always". */
const BANK_LEN: Record<string, Record<string, [number, number]>> = {
  HK: {
    'Hang Seng Bank': [9, 12], 'Bank of China (Hong Kong)': [12, 15], 'Citibank (Hong Kong)': [10, 10],
    'Bank of East Asia': [13, 15], 'Standard Chartered (Hong Kong)': [11, 12], 'DBS Bank (Hong Kong)': [10, 12],
  },
  SG: {
    'DBS Bank': [9, 10], 'OCBC Bank': [7, 12], 'United Overseas Bank': [10, 10],
    'Standard Chartered (Singapore)': [10, 10], 'Citibank (Singapore)': [10, 10], 'HSBC (Singapore)': [12, 12],
    'Maybank (Singapore)': [11, 11], 'CIMB Bank (Singapore)': [10, 10],
  },
  KR: {
    'KB Kookmin Bank': [12, 14], 'Shinhan Bank': [11, 14], 'KEB Hana Bank': [14, 14],
    'Woori Bank': [13, 13], 'NH NongHyup Bank': [13, 13], 'Industrial Bank of Korea': [14, 14],
  },
  TH: {
    'Bangkok Bank': [10, 10], 'Kasikornbank': [10, 10], 'Siam Commercial Bank': [10, 10], 'Krungthai Bank': [10, 10],
  },
  MY: { 'Maybank': [12, 12], 'CIMB Bank': [10, 10], 'Public Bank': [10, 10], 'RHB Bank': [14, 14] },
  PH: {
    'BDO Unibank': [10, 12], 'Bank of the Philippine Islands': [10, 10], 'Metrobank': [13, 13],
    'UnionBank of the Philippines': [12, 12],
  },
  ID: {
    'Bank Central Asia': [10, 10], 'Bank Mandiri': [13, 13], 'Bank Negara Indonesia': [10, 10],
    'Bank Rakyat Indonesia': [15, 15],
  },
  IN: {
    'HDFC Bank': [14, 14], 'ICICI Bank': [12, 12], 'State Bank of India': [11, 11],
    'Axis Bank': [15, 15], 'Kotak Mahindra Bank': [10, 14],
  },
}

/* Either direction of containment, so "DBS" finds "DBS Bank". Country scoping
   keeps "DBS Bank" (SG) apart from "DBS Bank (Hong Kong)". */
function usual(cc: string, bank: string): [string, [number, number]] | null {
  const b = bank.trim().toLowerCase()
  if (b.length < 3) return null
  for (const [name, rng] of Object.entries(BANK_LEN[cc] ?? {})) {
    const ln = name.toLowerCase()
    if (b.includes(ln) || ln.includes(b)) return [name, rng]
  }
  return null
}

/** US routing-number check digit (weights 3, 7, 1). */
function aba(v: string): boolean {
  const w = [3, 7, 1, 3, 7, 1, 3, 7, 1]
  let sum = 0
  for (let i = 0; i < 9; i++) sum += Number(v[i]) * w[i]!
  return sum % 10 === 0
}

function checkCountry(cc: string, bank: string, v: string): AcctCheck {
  const c = COUNTRIES[cc]
  if (!c) {
    if (v.length < 8) return { s: 'bad', msg: 'Too short — bank accounts are at least 8 digits' }
    if (v.length > 19) return { s: 'bad', msg: 'Too long — at most 19 digits' }
    return { s: 'ok' }
  }
  if (c.iban) {
    return { s: 'warn', msg: `${c.name} accounts are paid by IBAN — enter the full IBAN (starts with ${cc}) so any payer can use it` }
  }
  const n = v.length
  if (n < c.min || n > c.max) {
    return { s: 'bad', msg: `${c.name} bank accounts are ${c.min}–${c.max} digits — this one is ${n}` }
  }
  if (cc === 'US' && n === 9 && aba(v)) {
    return { s: 'warn', msg: 'This reads as a routing number, not an account number — the account number is the other one on the cheque' }
  }
  const u = usual(cc, bank)
  if (u && (n < u[1][0] || n > u[1][1])) {
    const want = u[1][0] === u[1][1] ? `${u[1][0]}` : `${u[1][0]}–${u[1][1]}`
    return { s: 'warn', msg: `A ${u[0]} account number is usually ${want} digits — this one is ${n}` }
  }
  return { s: 'ok' }
}

// ── Mainland China ──

/** The check digit every payment card carries. */
function luhn(s: string): boolean {
  let sum = 0, alt = false
  for (let i = s.length - 1; i >= 0; i--) {
    let d = Number(s[i])
    if (alt) { d *= 2; if (d > 9) d -= 9 }
    sum += d
    alt = !alt
  }
  return sum % 10 === 0
}

/* One issuer: the catalogue name (banks.ts), what people type instead, and the
   6-digit prefixes it issues on. */
interface CnBank { name: string; short: string; keys: string[]; bins: string[] }

const CN_BANKS: CnBank[] = [
  { name: 'Industrial & Commercial Bank of China', short: 'ICBC', keys: ['icbc', '工商', '工行'],
    bins: ['622200', '622202', '622203', '622208', '621225', '621226', '621281', '621558', '621559',
      '621721', '621722', '621723', '620200', '620302', '620402', '955880', '955881', '955882', '955888'] },
  { name: 'China Construction Bank', short: 'CCB', keys: ['ccb', '建设', '建行'],
    bins: ['622700', '622280', '436742', '436745', '621700', '621284', '621467', '621488', '621499',
      '622707', '622966', '622988', '623668', '552245', '524094', '526410'] },
  { name: 'Agricultural Bank of China', short: 'ABC', keys: ['abc', '农业', '农行'],
    bins: ['622848', '622841', '622843', '622844', '622845', '622846', '622847', '622849', '622820',
      '622821', '622822', '622823', '622824', '622825', '622826', '622827', '622828', '621282', '621336',
      '621619', '621671', '623018'] },
  { name: 'Bank of China', short: 'BOC', keys: ['boc', '中国银行', '中行'],
    bins: ['621660', '621661', '621662', '621663', '621665', '621666', '621667', '621668', '621669',
      '621256', '621212', '621283', '621725', '456351', '601382', '621330', '621331', '621332', '621333',
      '620514', '621785', '621786', '621787', '621788', '621789', '621790', '621568', '621569'] },
  { name: 'Bank of Communications', short: 'BOCOM', keys: ['bocom', '交通', '交行'],
    bins: ['622260', '622261', '622258', '622259', '622253', '622252', '405512', '434910', '458123',
      '458124', '520169', '522964', '601428', '622250', '622251', '622254', '622255', '622256', '622257',
      '622262', '621002', '621069', '621436'] },
  { name: 'China Merchants Bank', short: 'CMB', keys: ['cmb', '招商', '招行'],
    bins: ['622580', '622588', '622575', '622576', '622577', '622578', '622579', '622581', '622582',
      '621286', '621483', '621485', '621486', '621277', '622609', '690755', '621361', '621362'] },
  { name: 'Postal Savings Bank of China', short: 'PSBC', keys: ['psbc', '邮储', '邮政'],
    bins: ['622188', '622150', '622151', '622181', '622199', '955100', '621095', '620062', '621285',
      '621096', '621098', '621599', '621674', '623218', '623219'] },
  { name: 'China CITIC Bank', short: 'CITIC', keys: ['citic', '中信'],
    bins: ['622690', '622691', '622692', '622696', '622698', '622998', '622999', '433670', '433680',
      '442729', '442730', '622678', '622679', '622680', '622688', '622689'] },
  { name: 'China Minsheng Bank', short: 'Minsheng', keys: ['minsheng', 'cmbc', '民生'],
    bins: ['622622', '622600', '622601', '622602', '622603', '622615', '622616', '622617', '622618',
      '622619', '622620', '622621', '415599', '421393', '421865', '427570', '427571', '472067', '472068',
      '622623'] },
  { name: 'Shanghai Pudong Development Bank', short: 'SPDB', keys: ['spdb', '浦发'],
    bins: ['622521', '622522', '622523', '622500', '622516', '622517', '622518', '622519', '622520',
      '621352', '621351', '984301', '984303'] },
  { name: 'Industrial Bank', short: 'CIB', keys: ['cib', '兴业'],
    bins: ['622909', '622908', '622902', '622901', '438588', '438589', '451289', '451290', '486493',
      '486494', '486861', '523036', '622922', '622923', '622924', '622925', '622926', '622927', '622928',
      '622929'] },
  { name: 'China Everbright Bank', short: 'CEB', keys: ['ceb', '光大'],
    bins: ['622660', '622661', '622662', '622663', '622664', '622665', '622666', '622667', '622668',
      '622669', '622650', '622655', '622658', '356837', '356838', '486497', '622685', '622659', '621489',
      '621490', '621491', '621492'] },
  { name: 'China Guangfa Bank', short: 'CGB', keys: ['cgb', 'gdb', '广发'],
    bins: ['622568', '622555', '622556', '622557', '622558', '622559', '622560', '621462', '621469',
      '621470', '406365', '406366', '428911', '436768', '436769', '487013', '491032', '491033', '491034',
      '491035', '491036', '491037', '491038', '552794', '528931'] },
  { name: 'Ping An Bank', short: 'Ping An', keys: ['ping an', 'pingan', '平安'],
    bins: ['622155', '622156', '622157', '622158', '622159', '622160', '622161', '622162', '622163',
      '622164', '622165', '622166', '622167', '622168', '622169', '622170', '621626', '621627', '621628',
      '621629', '621630'] },
  { name: 'Bank of Beijing', short: 'Bank of Beijing', keys: ['beijing', '北京银行'],
    bins: ['602969', '621030', '621031', '622163'] },
  { name: 'Bank of Shanghai', short: 'Bank of Shanghai', keys: ['shanghai', '上海银行'],
    bins: ['622892', '621005', '621017', '622985'] },
  { name: 'Bank of Ningbo', short: 'Bank of Ningbo', keys: ['ningbo', '宁波银行'],
    bins: ['621279', '622281', '622282', '621010'] },
  { name: 'Bank of Jiangsu', short: 'Bank of Jiangsu', keys: ['jiangsu', '江苏银行'],
    bins: ['622173', '621276', '622178', '621076'] },
]

const CN_BY_BIN = new Map<string, CnBank>()
for (const b of CN_BANKS) for (const bin of b.bins) CN_BY_BIN.set(bin, b)

const matches = (b: CnBank, bank: string) => {
  const s = bank.toLowerCase()
  return s.includes(b.name.toLowerCase()) || b.keys.some(k => s.includes(k))
}

/* Personal accounts are UnionPay card numbers: 16–19 digits, 62-prefixed, Luhn
   check digit, issuer prefix. Corporate accounts are 9–20 digits with none of
   that. The two cannot be told apart for certain, so only the impossible is
   blocked; see the Go package for the full rule. */
function checkCN(bank: string, v: string): AcctCheck {
  const n = v.length
  if (n < 9 || n > 20) {
    return { s: 'bad', msg: 'Mainland bank accounts are 9–20 digits — a card number is 16–19' }
  }
  const card = n >= 16 && n <= 19
  if (card && v.startsWith('62') && !luhn(v)) {
    return { s: 'bad', msg: 'Not a valid card number — the check digit does not match, so one digit is wrong' }
  }
  if (card && luhn(v)) {
    const issuer = CN_BY_BIN.get(v.slice(0, 6))
    if (issuer && bank && !matches(issuer, bank)) {
      return { s: 'warn', msg: `This card number is issued by ${issuer.short}, not ${bank} — check the bank you picked` }
    }
    return issuer
      ? { s: 'ok', msg: `Card number checks out · ${issuer.short}` }
      : { s: 'ok', msg: 'Card number checks out' }
  }
  if (card) {
    return { s: 'warn', msg: 'Does not read as a card number — fine if this is a corporate account' }
  }
  return { s: 'ok' }
}

/**
 * The live check under the account-number field. `country` is ISO alpha-2
 * (from the bank picked, else from the currency); `bank` is what was picked or
 * typed. Both may be empty, in which case only the generic envelope applies.
 */
export function checkAcct(raw: string, country = '', bank = ''): AcctCheck {
  const v = normalize(raw)
  if (!v) return { s: 'empty' }
  if (/^[A-Z]{2}\d{2}/.test(v)) return checkIBAN(v)
  if (/[^0-9]/.test(v)) {
    return { s: 'bad', msg: 'Digits only, or a full IBAN starting with a country code' }
  }
  const cc = country.toUpperCase()
  return cc === 'CN' ? checkCN(bank, v) : checkCountry(cc, bank, v)
}
