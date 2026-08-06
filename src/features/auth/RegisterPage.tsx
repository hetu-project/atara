import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { signUp, useSession } from './useSession';
import { toFriendlyError } from '@/lib/errors';

const INPUT_CLASS =
  'rounded-input border-line-strong transition-base h-[56px] w-full border bg-white px-4 outline-none focus:border-black';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <div className="text-ink-4 flex h-full items-center justify-center text-sm">加载中...</div>;
  }
  if (session) return <Navigate to="/orders" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      const { needsEmailConfirm } = await signUp(email.trim(), password);
      if (needsEmailConfirm) setSent(true);
      else navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(toFriendlyError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-16">
        <div className="rounded-card bg-surface w-[475px] max-w-full p-[34px] text-center">
          <h1 className="mb-4 text-[30px] leading-[38px] font-semibold">请查收验证邮件</h1>
          <p className="text-ink-3 mb-8 text-sm">
            我们已向 {email.trim()} 发送验证邮件，点击邮件中的链接完成注册后即可登录。
          </p>
          <Link to="/login" className="text-sm font-semibold underline">
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="rounded-card bg-surface w-[475px] max-w-full p-[34px]">
        <h1 className="mb-[30px] text-center text-[30px] leading-[38px] font-semibold">注册</h1>

        <input
          className={INPUT_CLASS}
          type="email"
          autoComplete="username"
          placeholder="请输入邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={`${INPUT_CLASS} mt-4`}
          type="password"
          autoComplete="new-password"
          placeholder="请设置密码（至少 6 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className={`${INPUT_CLASS} mt-4`}
          type="password"
          autoComplete="new-password"
          placeholder="请再次输入密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <p className="text-danger min-h-[34px] px-2 py-[10px] text-xs">{error}</p>

        <button
          type="submit"
          disabled={!email || !password || !confirm || submitting}
          className="rounded-pill bg-primary hover:bg-primary-hover transition-base h-[56px] w-full text-base font-semibold text-black disabled:cursor-not-allowed disabled:bg-primary-disabled disabled:text-black/30"
        >
          {submitting ? '注册中...' : '注册'}
        </button>

        <p className="text-ink-3 mt-5 text-center text-xs">
          已有账号？
          <Link to="/login" className="ml-1 font-semibold text-black underline">
            去登录
          </Link>
        </p>
      </form>
    </div>
  );
}
