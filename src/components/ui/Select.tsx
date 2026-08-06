import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export interface Option {
  value: string;
  label: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[];
  placeholder?: string;
  invalid?: boolean;
}

const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { options, placeholder, invalid, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      {...rest}
      className={cn(
        'rounded-input transition-base h-[44px] w-full border bg-white px-4 text-sm outline-none',
        invalid ? 'border-danger' : 'border-line-strong focus:border-black',
        className,
      )}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
});

export default Select;
