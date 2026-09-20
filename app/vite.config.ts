import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

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

/**
 * dev 时也把落地页发出来。
 *
 * 线上 `/` 是落地页、`/app` 是控制台，两者由 scripts/build-site.sh 拼在一起。
 * 但 `npm run dev` 只起 app/ 这一个 server，根路径没有东西——侧栏那个 logo
 * 指向 `/`，点下去被 Vite 的 SPA 回退接走，又渲染一遍控制台，看着像点了没反应。
 *
 * 和 apiDoc() 同一个办法：读文件、直接回，不动 server.fs.allow。只覆盖落地页
 * 用到的那两样（index.html 和 assets/），因为 Vite 自己的产物在 /app/assets/
 * 下面，两者不会撞上。
 */
const MIME: Record<string, string> = {
  html: 'text/html; charset=utf-8', png: 'image/png', jpg: 'image/jpeg',
  jpeg: 'image/jpeg', svg: 'image/svg+xml', webp: 'image/webp', gif: 'image/gif',
}

function landing(): Plugin {
  const root = fileURLToPath(new URL('../', import.meta.url))
  return {
    name: 'atara-landing',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0] ?? ''
        /* base 带尾斜杠，所以 dev 下 /app 不会自己跳到 /app/——Vite 只印一句
           「did you mean /app/」。线上由 vercel.json 那条 rewrite 接住，本地
           补这一跳，免得每次手动加斜杠，也免得让人以为链接写错了。 */
        if (path === '/app') {
          res.statusCode = 302
          res.setHeader('Location', '/app/')
          res.end()
          return
        }
        const rel = path === '/' || path === '/index.html'
          ? 'index.html'
          : path.startsWith('/assets/') ? path.slice(1) : ''
        if (!rel) return next()
        try {
          const body = readFileSync(root + rel)
          res.setHeader('Content-Type', MIME[rel.split('.').pop() ?? ''] ?? 'application/octet-stream')
          res.end(body)
        } catch {
          // 文件不在就当这条中间件没插手——报 404 的活留给 Vite。
          next()
        }
      })
    },
  }
}

// dev 时把 /api 代理到本地后端，浏览器视角同源——不依赖后端 CORS，
// 也不会因为预检失败而卡在「看起来没请求出去」。
export default defineConfig({
  /* 控制台发布在 www.loka.cash/app，不是域名根。
     没有这一行，构建出来的 index.html 会去要 /assets/index-xxx.js，而它实际在
     /app/assets/ 下——整页白屏，而控制台里那条报错只说「模块加载失败」。
     dev server 同样会挂在这个前缀下：本地开发要开 localhost:5173/app/。 */
  base: '/app/',
  /* Privy signing needs Buffer. Vite does not provide Node globals, so
     the embedded wallet throws "Buffer is not defined". Only the bits we use. */
  plugins: [
    nodePolyfills({
      include: ['buffer'],
      globals: { Buffer: true, process: true, global: true },
    }),
    react(),
    apiDoc(),
    landing(),
  ],
  /* nodePolyfills 在 transform 时才把 `buffer` 改写成自己的 shim。
     优化器第一轮扫的是源码里的 `buffer`，看不到这个路径——于是第一次打开
     /app/ 会触发「new dependencies optimized → reloading」，把
     node_modules/.vite/deps 里正在被页面引用的 chunk 删掉。CSS 是从 JS
     里 import 的，模块 404 之后 #root 是空的、样式也没挂上，就是白屏。
     预告这些 shim，第一轮就把它们打进去，省掉那一次半途拆台。 */
  optimizeDeps: {
    include: [
      'vite-plugin-node-polyfills/shims/buffer',
      'vite-plugin-node-polyfills/shims/process',
      'vite-plugin-node-polyfills/shims/global',
    ],
  },
  server: {
    port: 5173,
    warmup: {
      clientFiles: ['./src/main.tsx', './src/polyfills.ts'],
    },
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
