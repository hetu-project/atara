import { Navigate } from 'react-router';
import type { Role } from '@/lib/schema';
import CounterpartyFormPage from './CounterpartyFormPage';
import { useMyProfiles } from './hooks';
import { pickProfile } from './myProfiles';

export default function MyProfileEditPage({ role }: { role: Role }) {
  const { data, isPending, isError, error } = useMyProfiles();

  if (isPending) return <div className="text-ink-4 text-sm">加载中...</div>;
  if (isError) return <div className="text-danger text-sm">加载失败：{(error as Error).message}</div>;

  const profile = pickProfile(data, role);
  // 该角色还没有档案 —— 直接进编辑页是手敲 URL 的结果，回到档案页由用户选择创建
  if (!profile) return <Navigate to="/profile" replace />;

  return <CounterpartyFormPage role={role} mode="edit" profileId={profile.id} />;
}
