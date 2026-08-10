import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { signInDemo } from '@/demo/auth/demoSession';

/**
 * 登录和注册共用的壳。Demo 里两者没有实质区别——都是点一下就进去，
 * 所以只有文案不同，没必要写两遍。
 */
export default function DemoAuthPage({
  title,
  subtitle,
  cta,
  footerText,
  footerLinkText,
  footerLinkTo,
}: {
  title: string;
  subtitle: string;
  cta: string;
  footerText: string;
  footerLinkText: string;
  footerLinkTo: string;
}) {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  function enter() {
    signInDemo();
    navigate('/overview', { replace: true });
  }

  return (
    <div className="bg-bg text-txt flex min-h-full items-center justify-center px-6 py-16">
      <div className="bg-surface border-hairline w-[420px] max-w-full rounded-[var(--radius-md)] border p-8 shadow-[var(--shadow-panel)]">
        <div className="mb-5 flex items-center gap-2.5">
          <span className="bg-brand block h-3.5 w-3.5 rounded-[3px]" />
          <span className="text-brand text-[13px] font-semibold tracking-[0.08em]">ATARA</span>
        </div>

        <h1 className="mb-1.5 text-[26px] font-semibold tracking-tight">{title}</h1>
        <p className="text-muted mb-7 text-[14px]">{subtitle}</p>

        <input
          className="border-hairline-strong bg-bg text-txt placeholder:text-muted focus:border-brand mb-4 h-11 w-full rounded-[var(--radius-sm)] border px-3.5 text-[14px] outline-none transition-colors"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enter()}
        />

        <button
          onClick={enter}
          className="bg-brand hover:bg-brand-dim h-11 w-full rounded-[var(--radius-sm)] text-[14px] font-semibold text-on-brand transition-colors"
        >
          {cta}
        </button>

        <p className="text-muted mt-5 text-center text-[13px]">
          {footerText}
          <Link to={footerLinkTo} className="text-brand ml-1 hover:underline">
            {footerLinkText}
          </Link>
        </p>
      </div>
    </div>
  );
}
