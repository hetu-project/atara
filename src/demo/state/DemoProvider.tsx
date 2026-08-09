import { createContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { createSeedState, makePoolOrder } from '@/demo/seed';
import type {
  Challenge,
  DemoState,
  DeskKind,
  PoolOrder,
  RiskResult,
  Transaction,
  TxStatus,
} from '@/demo/types';

const KEY = 'atara.demo.state';

export type DemoAction =
  | { type: 'reset' }
  | { type: 'openDesk'; kind: DeskKind; name: string }
  | { type: 'addPoolOrder'; order: PoolOrder }
  | { type: 'match'; order: PoolOrder; tx: Transaction }
  | { type: 'setTxStatus'; txId: string; status: TxStatus }
  | { type: 'setTxRisk'; txId: string; risk: RiskResult }
  | { type: 'openChallenge'; challenge: Challenge }
  | { type: 'resolveChallenge'; challengeId: string };

function reducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'reset':
      return createSeedState();

    case 'openDesk':
      return {
        ...state,
        desks: {
          ...state.desks,
          [action.kind]: {
            ...state.desks[action.kind],
            name: action.name,
            verifiedAt: new Date().toISOString(),
          },
        },
      };

    case 'addPoolOrder':
      return { ...state, pool: [action.order, ...state.pool].slice(0, 60) };

    case 'match':
      return {
        ...state,
        pool: state.pool.filter((o) => o.id !== action.order.id),
        transactions: [action.tx, ...state.transactions],
      };

    case 'setTxStatus':
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.txId ? { ...t, status: action.status } : t,
        ),
      };

    case 'setTxRisk':
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.txId ? { ...t, risk: action.risk } : t,
        ),
      };

    case 'openChallenge':
      return { ...state, challenges: [action.challenge, ...state.challenges] };

    case 'resolveChallenge': {
      const ch = state.challenges.find((c) => c.id === action.challengeId);
      if (!ch) return state;
      return {
        ...state,
        challenges: state.challenges.map((c) =>
          c.id === action.challengeId ? { ...c, state: 'resolved' } : c,
        ),
        transactions: state.transactions.map((t) =>
          // risk 必须清空：不清的话重新校验时推理面板会直接拿旧结果，
          // 「补充材料后分数提高」这条闭环就断了。
          t.id === ch.txId
            ? { ...t, status: 'validating', resubmits: t.resubmits + 1, risk: null }
            : t,
        ),
      };
    }
  }
}

function load(): DemoState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    // 存的东西坏了就当没有，回落到种子数据
  }
  return createSeedState();
}

export const DemoContext = createContext<{
  state: DemoState;
  dispatch: Dispatch<DemoAction>;
} | null>(null);

export default function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, load);

  // 演示到一半刷新页面全没了是最尴尬的失败模式，所以每次变更都落盘。
  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  // 池子每 8 秒进一笔新单，制造「它是活的」的观感。
  // 从 1000 开始编号，避开种子数据的 0..39。
  useEffect(() => {
    let n = 1000;
    const timer = setInterval(() => {
      dispatch({ type: 'addPoolOrder', order: makePoolOrder(n++) });
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return <DemoContext.Provider value={{ state, dispatch }}>{children}</DemoContext.Provider>;
}
