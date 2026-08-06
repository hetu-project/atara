import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { signIn, useSession } from './useSession';
import { toFriendlyError } from '@/lib/errors';

export default function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <div className="text-ink-4 flex h-full items-center justify-center text-sm">加载中...</div>;
  }
  if (session) return <Navigate to="/orders" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate('/orders', { replace: true });
    } catch (err) {
      setError(toFriendlyError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="rounded-card bg-surface w-[475px] max-w-full p-[34px]">
        <h1 className="mb-[30px] text-center text-[30px] leading-[38px] font-semibold">登录</h1>

        <input
          className="rounded-input border-line-strong transition-base h-[56px] w-full border bg-white px-4 outline-none focus:border-black"
          type="email"
          autoComplete="username"
          placeholder="请输入邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="rounded-input border-line-strong transition-base mt-4 h-[56px] w-full border bg-white px-4 outline-none focus:border-black"
          type="password"
          autoComplete="current-password"
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <p className="text-danger min-h-[34px] px-2 py-[10px] text-xs">{error}</p>

        <button
          type="submit"
          disabled={!email || !password || submitting}
          className="rounded-pill bg-primary hover:bg-primary-hover transition-base h-[56px] w-full text-base font-semibold text-black disabled:cursor-not-allowed disabled:bg-primary-disabled disabled:text-black/30"
        >
          {submitting ? '登录中...' : '登录'}
        </button>

        <p className="text-ink-3 mt-5 text-center text-xs">
          还没有账号？
          <Link to="/register" className="ml-1 font-semibold text-black underline">
            去注册
          </Link>
        </p>
      </form>
    </div>
  );
}
