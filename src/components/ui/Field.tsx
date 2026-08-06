import type { ReactNode } from 'react';

interface Props {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export default function Field({ label, required, error, hint, children }: Props) {
  return (
    <div>
      <label className="block">
        <span className="mb-2 block text-xs text-black/50">
          {label}
          {required ? <span className="text-danger ml-1">*</span> : null}
        </span>
        {children}
      </label>
      {error ? <p className="text-danger mt-1.5 px-2 text-xs">{error}</p> : null}
      {!error && hint ? <p className="text-ink-4 mt-1.5 px-2 text-xs">{hint}</p> : null}
    </div>
  );
}
