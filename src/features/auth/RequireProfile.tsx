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

  // 已有档案的用户不该停留在引导页——它挂在 AppLayout 之外，没有侧边栏也没有
  // 退出登录按钮。典型触发路径：注册 → 引导 → 建档案 → 跳到 /profile → 浏览器后退。
  // 不会与上面那条形成环：/profile 只要求"有档案存在"，不会再被弹回引导页。
  if (!needsOnboarding(data) && location.pathname === ONBOARDING_PATH) {
    return <Navigate to="/profile" replace />;
  }

  return <Outlet />;
}
