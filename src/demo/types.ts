export type DeskKind = 'buy' | 'sell';
export type TxStatus = 'queued' | 'validating' | 'passed' | 'challenged' | 'declined';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Desk {
  kind: DeskKind;
  displayId: string;
  name: string;
  /** null 表示尚未开通 */
  verifiedAt: string | null;
  completedTrades: number;
  disputes: number;
  avgResponseMin: number;
}

export interface Counterparty {
  displayId: string;
  name: string;
  score: number;
  completedTrades: number;
  disputes: number;
  avgResponseMin: number;
  verified: boolean;
  firstSeenAt: string;
}

export interface PoolOrder {
  id: string;
  /** 挂单方向。只作展示用，撮合不看它——见 engine/matching.ts */
  side: DeskKind;
  asset: string;
  chain: string;
  amount: number;
  fiatCurrency: string;
  price: number;
  fiatTotal: number;
  counterparty: Counterparty;
  postedAt: string;
  expiresAt: string;
}

export interface RiskCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface RiskResult {
  score: number;
  threshold: number;
  verdict: 'pass' | 'challenge' | 'decline';
  checks: RiskCheck[];
}

export interface Transaction {
  id: string;
  poolOrderId: string;
  side: DeskKind;
  asset: string;
  amount: number;
  fiatTotal: number;
  fiatCurrency: string;
  counterparty: Counterparty;
  status: TxStatus;
  createdAt: string;
  risk: RiskResult | null;
  /** 补充过材料的次数。第二次风控会因此加分，让「补材料重提交」这条路径有实际效果。 */
  resubmits: number;
}

export interface Challenge {
  id: string;
  txId: string;
  reason: string;
  required: string[];
  state: 'open' | 'resolved';
  openedAt: string;
}

export interface DemoState {
  desks: Record<DeskKind, Desk>;
  pool: PoolOrder[];
  transactions: Transaction[];
  challenges: Challenge[];
}
