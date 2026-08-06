import type { ReactNode } from 'react';

export default function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface mb-5 p-6">
      <h2 className="mb-5 text-sm font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </section>
  );
}
