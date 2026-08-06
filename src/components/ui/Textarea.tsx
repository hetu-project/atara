import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={3}
      {...rest}
      className={cn(
        'rounded-input transition-base w-full border bg-white px-4 py-3 text-sm outline-none placeholder:text-black/30',
        invalid ? 'border-danger' : 'border-line-strong focus:border-black',
        className,
      )}
    />
  );
});

export default Textarea;
