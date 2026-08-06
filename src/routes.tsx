import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import RequireAuth from '@/features/auth/RequireAuth';
import RequireProfile from '@/features/auth/RequireProfile';
import CounterpartyFormPage from '@/features/counterparties/CounterpartyFormPage';
import MyProfileEditPage from '@/features/counterparties/MyProfileEditPage';
import MyProfilePage from '@/features/counterparties/MyProfilePage';
import OnboardingPage from '@/features/counterparties/OnboardingPage';
import OrderCreatePage from '@/features/orders/OrderCreatePage';
import OrderDetailPage from '@/features/orders/OrderDetailPage';
import OrderListPage from '@/features/orders/OrderListPage';
import AppLayout from '@/layouts/AppLayout';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        // RequireProfile 在 AppLayout 之外：引导页不显示侧边栏。
        // 侧边栏的每个入口都要求已有档案，在还没有档案时展示它只会让人点进去撞守卫。
        element: <RequireProfile />,
        children: [
          { path: '/onboarding', element: <OnboardingPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <Navigate to="/orders" replace /> },

              { path: '/profile', element: <MyProfilePage /> },
              { path: '/profile/buyer/new', element: <CounterpartyFormPage role="buyer" mode="create" /> },
              { path: '/profile/seller/new', element: <CounterpartyFormPage role="seller" mode="create" /> },
              { path: '/profile/buyer', element: <MyProfileEditPage role="buyer" /> },
              { path: '/profile/seller', element: <MyProfileEditPage role="seller" /> },

              { path: '/orders', element: <OrderListPage /> },
              { path: '/orders/new', element: <OrderCreatePage /> },
              { path: '/orders/:id', element: <OrderDetailPage /> },

              { path: '*', element: <Navigate to="/orders" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);

export default router;
