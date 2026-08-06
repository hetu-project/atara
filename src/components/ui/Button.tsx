import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'second' | 'third' | 'text';
type Size = 'md' | 'lg';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-black hover:bg-primary-hover disabled:bg-[#d3fcd9] disabled:text-black/30',
  second:
    'bg-white text-black border border-line-strong hover:bg-[#e5e5e5] disabled:text-black/30 disabled:hover:bg-white',
  third: 'bg-black text-white hover:bg-black/60 disabled:bg-black/30',
  text: 'text-success hover:opacity-60 disabled:text-black/30',
};

const SIZE: Record<Size, string> = {
  md: 'h-[44px] px-6 text-sm',
  lg: 'h-[56px] px-8 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'rounded-pill transition-base inline-flex items-center justify-center font-semibold disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? '处理中...' : children}
    </button>
  );
}
