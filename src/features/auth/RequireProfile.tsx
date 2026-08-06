import { Navigate, Outlet, useLocation } from 'react-router';
import { useMyProfiles } from '@/features/counterparties/hooks';
import { needsOnboarding } from '@/features/counterparties/myProfiles';

const ONBOARDING_PATH = '/onboarding';

export default function RequireProfile() {
  const { data, isPending } = useMyProfiles();
  const location = useLocation();

  if (isPending) {
    return <div className="text-ink-4 flex h-full items-center justify-center text-sm">加载中...</div>;
  }

  // 引导页自身必须放行，否则"没有档案 → 去引导页 → 仍然没有档案 → 去引导页"无限循环
  if (needsOnboarding(data) && location.pathname !== ONBOARDING_PATH) {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }

  return <Outlet />;
}
