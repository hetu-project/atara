import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import type { IncomingMessage, ServerResponse } from 'node:http';

// 整站是多入口（落地页在 /，应用在 /app），但应用本身是 SPA。
//
// appType:'mpa' 关掉了 Vite 自带的 SPA fallback，于是 /app/orders 这类深链在 dev 和
// preview 下都会 404。反过来如果留着 appType:'spa'，fallback 会把 /app/orders 喂成
// 落地页，更糟。所以两种内置模式都不对，需要这个中间件：把 /app 下所有无扩展名的
// 路径重写到 /app/index.html，再交回 Vite 正常处理。
//
// 注册在 configureServer 主体里（而不是它返回的 post 钩子）是必须的——只有这样
// 重写后的 URL 才会继续走 Vite 的 HTML 转换链路。
function appHistoryFallback(): Plugin {
  function rewrite(req: IncomingMessage, _res: ServerResponse, next: () => void) {
    const pathname = (req.url ?? '').split('?')[0];
    const isAppRoute = pathname === '/app' || pathname.startsWith('/app/');
    const looksLikeFile = /\.[^/]+$/.test(pathname);
    if (isAppRoute && !looksLikeFile) req.url = '/app/index.html';
    next();
  }

  return {
    name: 'app-history-fallback',
    configureServer(server) {
      server.middlewares.use(rewrite);
    },
    configurePreviewServer(server) {
      server.middlewares.use(rewrite);
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), appHistoryFallback()],
  server: {
    port: 5174,
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        landing: path.resolve(import.meta.dirname, 'index.html'),
        app: path.resolve(import.meta.dirname, 'app/index.html'),
      },
    },
  },
});
