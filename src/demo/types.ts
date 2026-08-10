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
  /** 所属模型组，用于在推理界面上分段展示 */
  group: string;
  label: string;
  /** 「模型」名。纯展示用，让画面读起来像多模型并行推理。 */
  model: string;
  /** 该项的模拟耗时，展示用 */
  latencyMs: number;
  status: CheckStatus;
  detail: string;
}

export interface RiskResult {
  score: number;
  threshold: number;
  verdict: 'pass' | 'challenge' | 'decline';
  checks: RiskCheck[];
  /** 模型置信度，展示用，不参与判定 */
  confidence: number;
  /** 「提取了多少个特征」，展示用 */
  featureCount: number;
  /** 由实际检查结果拼出的自然语言结论 */
  summary: string;
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
