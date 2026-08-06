import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, Props>(function Input({ invalid, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cn(
        'rounded-input transition-base h-[44px] w-full border bg-white px-4 text-sm outline-none placeholder:text-black/30',
        invalid ? 'border-danger' : 'border-line-strong focus:border-black',
        className,
      )}
    />
  );
});

export default Input;
