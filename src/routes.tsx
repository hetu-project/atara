import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RequireAuth from '@/features/auth/RequireAuth';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/orders" replace /> },
      { path: '/orders', element: <div className="p-10">订单页占位</div> },
    ],
  },
  { path: '*', element: <Navigate to="/orders" replace /> },
]);

export default router;
