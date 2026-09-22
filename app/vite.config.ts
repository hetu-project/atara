import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

/**
 * Ship the repo root's api.html along with the build.
 *
 * The developer reference docs and the console are not the same thing and should not be copied into two drifting
 * copies; but it sits outside app/, so `npm run build` does not bundle it by default, and in production the request
 * is taken by nginx's SPA fallback -- clicking "Atara API" opens yet another console.
 *
 * This started as a symlink in public/. It builds on macOS but **not on Linux** --
 * Vite tries to resolve a symlink pointing outside the project root as an entry and reports
 * `Could not resolve entry module`. So it reads the file and emits it directly,
 * rather than relying on how filesystem symlinks behave across platforms.
 */
function apiDoc(): Plugin {
  const src = fileURLToPath(new URL('../api.html', import.meta.url))
  return {
    name: 'atara-api-doc',
    // dev: handle this path ourselves, to avoid having to touch server.fs.allow
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url?.split('?')[0] !== '/api.html') return next()
        res.setHeader('Content-Type', 'text/html; charset=utf-8')
        res.end(readFileSync(src))
      })
    },
    // build: emitted into dist as a static asset
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'api.html', source: readFileSync(src) })
    },
  }
}

/**
 * Serve the landing page in dev too.
 *
 * In production `/` is the landing page and `/app` is the console, stitched together by scripts/build-site.sh.
 * But `npm run dev` only starts app/'s server, so the root path has nothing -- the sidebar logo points at `/`, and
 * clicking it is taken by Vite's SPA fallback and renders the console again, which looks like the click did nothing.
 *
 * The same approach as apiDoc(): read the file, return it directly, leave server.fs.allow alone. It covers only the
 * two things the landing page needs (index.html and assets/), since Vite's own output lives under /app/assets/ and
 * the two cannot collide.
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
        /* base carries a trailing slash, so in dev /app does not redirect itself to /app/ -- Vite only prints
           "did you mean /app/". In production that rewrite in vercel.json catches it; locally this fills in the
           hop, so nobody has to add the slash by hand or assume the link is wrong. */
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
          // Not our business if the file is not there -- reporting a 404 is Vite's job.
          next()
        }
      })
    },
  }
}

// In dev, proxy /api to the local backend so the browser sees one origin -- no dependence on backend CORS,
// and no getting stuck on "the request seems not to have gone out" because a preflight failed.
export default defineConfig({
  /* The console is published at www.loka.cash/app, not at the domain root.
     Without this line the built index.html asks for /assets/index-xxx.js while it actually lives under
     /app/assets/ -- a blank page, with the console's only error saying "failed to load module".
     The dev server hangs off the same prefix: local development runs at localhost:5173/app/. */
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
  /* nodePolyfills only rewrites `buffer` into its own shim at transform time.
     The optimiser's first pass scans the source's `buffer` and cannot see that path -- so the first time /app/ is
     opened it triggers "new dependencies optimized -> reloading", deleting chunks in node_modules/.vite/deps that
     the page is currently referencing. The CSS is imported from JS, so once the module 404s, #root is empty and the
     styles never attach: a blank page.
     Declaring these shims up front gets them into the first pass and avoids that mid-flight collapse. */
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
      // The key must carry a trailing slash. '/api' is a prefix match, so even a same-prefix static file like
      // /api.html gets forwarded to the backend, giving a 404 locally while production (where nginx uses
      // location /api/) is fine -- a difference that only reproduces in dev is the hardest kind to track down.
      '/api/': {
        target: process.env.ATARA_API ?? 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
