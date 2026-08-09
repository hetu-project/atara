import { describe, expect, it } from 'vitest';
import { nextStatus } from '@/demo/engine/queueMachine';

describe('nextStatus', () => {
  it('合法转换', () => {
    expect(nextStatus('queued', 'start')).toBe('validating');
    expect(nextStatus('validating', 'pass')).toBe('passed');
    expect(nextStatus('validating', 'challenge')).toBe('challenged');
    expect(nextStatus('validating', 'decline')).toBe('declined');
    expect(nextStatus('challenged', 'resolve')).toBe('validating');
  });

  it('终态不再流转', () => {
    expect(nextStatus('passed', 'start')).toBeNull();
    expect(nextStatus('declined', 'resolve')).toBeNull();
  });

  it('非法转换返回 null', () => {
    expect(nextStatus('queued', 'pass')).toBeNull();
    expect(nextStatus('validating', 'start')).toBeNull();
    expect(nextStatus('challenged', 'pass')).toBeNull();
  });
});
