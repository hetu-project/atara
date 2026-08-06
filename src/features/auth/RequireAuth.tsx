import { Navigate, Outlet } from 'react-router';
import { useSession } from './useSession';

export default function RequireAuth() {
  const { session, loading } = useSession();

  if (loading) {
    return <div className="text-ink-4 flex h-full items-center justify-center text-sm">加载中...</div>;
  }
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
