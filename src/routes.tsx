import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RequireAuth from '@/features/auth/RequireAuth';
import CounterpartyFormPage from '@/features/counterparties/CounterpartyFormPage';
import CounterpartyListPage from '@/features/counterparties/CounterpartyListPage';
import OrderCreatePage from '@/features/orders/OrderCreatePage';
import OrderListPage from '@/features/orders/OrderListPage';
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

          { path: '/buyers', element: <CounterpartyListPage role="buyer" /> },
          { path: '/buyers/new', element: <CounterpartyFormPage role="buyer" mode="create" /> },
          { path: '/buyers/:id', element: <CounterpartyFormPage role="buyer" mode="edit" /> },

          { path: '/sellers', element: <CounterpartyListPage role="seller" /> },
          { path: '/sellers/new', element: <CounterpartyFormPage role="seller" mode="create" /> },
          { path: '/sellers/:id', element: <CounterpartyFormPage role="seller" mode="edit" /> },

          { path: '/orders', element: <OrderListPage /> },
          { path: '/orders/new', element: <OrderCreatePage /> },
          { path: '/orders/:id', element: placeholder('订单详情') },

          { path: '*', element: <Navigate to="/orders" replace /> },
        ],
      },
    ],
  },
]);

export default router;
