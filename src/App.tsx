import { RouterProvider } from 'react-router';
import DemoProvider from '@/demo/state/DemoProvider';
import router from '@/routes';

// Demo 模式：Supabase 相关的 SessionProvider / QueryClientProvider 已从运行时摘除。
// 留着它们会在挂载时拉起 Supabase 客户端并发网络请求，而这个 Demo 的一条硬要求
// 就是全程零网络请求（除静态资源）。旧代码仍在仓库里，只是不再被入口引用，
// 因此也不会进 bundle。
export default function App() {
  return (
    <DemoProvider>
      <RouterProvider router={router} />
    </DemoProvider>
  );
}
