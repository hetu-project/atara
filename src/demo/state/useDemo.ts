import { useContext } from 'react';
import { DemoContext } from './DemoProvider';

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo 必须在 DemoProvider 内使用');
  return ctx;
}
