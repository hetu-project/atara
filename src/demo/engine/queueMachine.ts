import type { TxStatus } from '@/demo/types';

export type QueueEvent = 'start' | 'pass' | 'challenge' | 'decline' | 'resolve';

/**
 * 队列状态机。对应 Trustline Queue 页那四个磁贴：
 * Live tasks / Queuing / Validating / Challenging。
 *
 * challenged --resolve--> validating 是有意的：补齐材料后要重跑一遍风控，
 * 而不是直接放行。第二次分数会因材料齐备而提高（见 riskEngine 里的 resubmits）。
 */
const TRANSITIONS: Record<TxStatus, Partial<Record<QueueEvent, TxStatus>>> = {
  queued: { start: 'validating' },
  validating: { pass: 'passed', challenge: 'challenged', decline: 'declined' },
  challenged: { resolve: 'validating' },
  passed: {},
  declined: {},
};

export function nextStatus(current: TxStatus, event: QueueEvent): TxStatus | null {
  return TRANSITIONS[current][event] ?? null;
}
