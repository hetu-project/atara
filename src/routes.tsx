import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RequireAuth from '@/features/auth/RequireAuth';
import AppLayout from '@/layouts/AppLayout';

const placeholder = (name: string) => <div className="text-ink-4">{name}（待实现）</div>;

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/orders" replace /> },

          { path: '/buyers', element: placeholder('买家列表') },
          { path: '/buyers/new', element: placeholder('新建买家') },
          { path: '/buyers/:id', element: placeholder('买家详情') },

          { path: '/sellers', element: placeholder('卖家列表') },
          { path: '/sellers/new', element: placeholder('新建卖家') },
          { path: '/sellers/:id', element: placeholder('卖家详情') },

          { path: '/orders', element: placeholder('订单列表') },
          { path: '/orders/new', element: placeholder('新建订单') },
          { path: '/orders/:id', element: placeholder('订单详情') },

          { path: '*', element: <Navigate to="/orders" replace /> },
        ],
      },
    ],
  },
]);

export default router;
