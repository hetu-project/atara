import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// dev 时把 /api 代理到本地后端，浏览器视角同源——不依赖后端 CORS，
// 也不会因为预检失败而卡在「看起来没请求出去」。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // public/api.html 是指向仓库根 api.html 的软链——开发者参考文档和控制台
    // 不是一份东西，不该复制成两份互相漂移。dev server 默认不许服务项目根
    // 之外的文件，不放行就会本地 404、线上却好。
    fs: { allow: ['..'] },
    proxy: {
      // 键必须带尾斜杠。写 '/api' 是前缀匹配，连 /api.html 这种同前缀的
      // 静态文件也会被转给后端，本地拿到 404 而线上（nginx 用 location /api/）
      // 是好的——这种只在 dev 复现的差异最难查。
      '/api/': {
        target: process.env.ATARA_API ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
