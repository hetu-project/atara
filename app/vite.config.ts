import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * 把仓库根的 api.html 一起发出去。
 *
 * 开发者参考文档和控制台不是一份东西，不该复制成两份互相漂移；但它在
 * app/ 之外，`npm run build` 默认不会打包它，线上请求就被 nginx 的 SPA
 * 回退接走，点「Atara API」开出来的是又一个控制台。
 *
 * 一开始是在 public/ 里放了个软链。macOS 上能构建，**Linux 上不行**——
 * Vite 会把这个指向项目根之外的软链当成入口去解析，报
 * `Could not resolve entry module`。所以改成读文件、直接产出，
 * 不依赖文件系统软链在不同平台上的行为差异。
 */
function apiDoc(): Plugin {
  const src = fileURLToPath(new URL('../api.html', import.meta.url))
  return {
    name: 'atara-api-doc',
    // dev：自己接管这一条路径，省得再去动 server.fs.allow
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/api.html') return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(readFileSync(src))
      })
    },
    // build：作为静态产物落进 dist
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'api.html', source: readFileSync(src) })
    },
  }
}

// dev 时把 /api 代理到本地后端，浏览器视角同源——不依赖后端 CORS，
// 也不会因为预检失败而卡在「看起来没请求出去」。
export default defineConfig({
  plugins: [react(), apiDoc()],
  server: {
    port: 5173,
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
