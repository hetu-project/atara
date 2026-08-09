import { Navigate, Outlet } from 'react-router';
import { isSignedIn } from '@/demo/auth/demoSession';
import DemoSidebar from './DemoSidebar';

export default function DemoLayout() {
  if (!isSignedIn()) return <Navigate to="/login" replace />;

  return (
    <div className="bg-bg text-txt flex h-full">
      <DemoSidebar />
      <main className="flex-1 overflow-y-auto px-[30px] py-[30px]">
        <Outlet />
      </main>
    </div>
  );
}
