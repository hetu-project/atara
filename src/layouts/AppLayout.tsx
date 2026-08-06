import { Outlet } from 'react-router';
import Header from './Header';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="flex h-full min-h-screen items-stretch">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 px-[46px] py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
