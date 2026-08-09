import { createBrowserRouter, Navigate } from 'react-router';
import DemoLayout from '@/demo/layout/DemoLayout';
import ChallengesPage from '@/demo/pages/ChallengesPage';
import DemoLoginPage from '@/demo/pages/DemoLoginPage';
import DemoRegisterPage from '@/demo/pages/DemoRegisterPage';
import DeskPage from '@/demo/pages/DeskPage';
import OrderPoolPage from '@/demo/pages/OrderPoolPage';
import OverviewPage from '@/demo/pages/OverviewPage';
import QueuePage from '@/demo/pages/QueuePage';

// basename 必须保留 '/app'：落地页导航指向 /app/login 和 /app/register，
// src/__tests__/landingEntry.test.ts 盯着这两个链接。
//
// 原先接 Supabase 的真实应用（src/features/*、src/layouts/*）保留在仓库里
// 但不再挂路由。要接回来改这个文件即可。
const router = createBrowserRouter(
  [
    { path: '/login', element: <DemoLoginPage /> },
    { path: '/register', element: <DemoRegisterPage /> },
    {
      element: <DemoLayout />,
      children: [
        { path: '/', element: <Navigate to="/overview" replace /> },
        { path: '/overview', element: <OverviewPage /> },
        { path: '/pool', element: <OrderPoolPage /> },
        { path: '/queue', element: <QueuePage /> },
        { path: '/challenges', element: <ChallengesPage /> },
        { path: '/desk', element: <DeskPage /> },
        { path: '*', element: <Navigate to="/overview" replace /> },
      ],
    },
  ],
  { basename: '/app' },
);

export default router;
