import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'accent' | 'success' | 'outline';

const TONE: Record<Tone, string> = {
  neutral: 'bg-black/6 text-black/60',
  accent: 'bg-accent text-white',
  success: 'bg-success text-white',
  outline: 'border border-line-strong text-black/40',
};

export default function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('rounded-pill inline-flex h-6 items-center px-3 text-xs font-semibold', TONE[tone])}>
      {children}
    </span>
  );
}
