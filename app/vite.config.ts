import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// dev 时把 /api 代理到本地后端，浏览器视角同源——不依赖后端 CORS，
// 也不会因为预检失败而卡在「看起来没请求出去」。
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.ATARA_API ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
