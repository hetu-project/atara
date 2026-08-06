import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RequireAuth from '@/features/auth/RequireAuth';
import CounterpartyFormPage from '@/features/counterparties/CounterpartyFormPage';
import OrderCreatePage from '@/features/orders/OrderCreatePage';
import OrderDetailPage from '@/features/orders/OrderDetailPage';
import OrderListPage from '@/features/orders/OrderListPage';
import AppLayout from '@/layouts/AppLayout';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/orders" replace /> },

          { path: '/buyers/new', element: <CounterpartyFormPage role="buyer" mode="create" /> },
          { path: '/buyers/:id', element: <CounterpartyFormPage role="buyer" mode="edit" /> },

          { path: '/sellers/new', element: <CounterpartyFormPage role="seller" mode="create" /> },
          { path: '/sellers/:id', element: <CounterpartyFormPage role="seller" mode="edit" /> },

          { path: '/orders', element: <OrderListPage /> },
          { path: '/orders/new', element: <OrderCreatePage /> },
          { path: '/orders/:id', element: <OrderDetailPage /> },

          { path: '*', element: <Navigate to="/orders" replace /> },
        ],
      },
    ],
  },
]);

export default router;
