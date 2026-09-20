#!/usr/bin/env bash
#
# 把落地页和控制台拼成一个站点，交给 Vercel 发布。
#
#   /            index.html    落地页
#   /api.html    api.html      开发者文档
#   /app         app/dist      控制台（React）
#
# 为什么要有这一步：根目录原来的 vercel.json 是 outputDirectory: "."——
# 把整个仓库目录原样发出去。只有几个 html 的时候那够用，但 app/ 合进来之后，
# app/src/ 和 docs/ 里的内部材料会一起挂上公网，而 Vercel 不读 .gitignore。
#
# 显式拼一个输出目录，比维护一张「不要发什么」的清单可靠：以后新增的东西
# 默认不发布，而不是默认发布。忘记加白名单只会少发一个文件，忘记加黑名单
# 是把不该公开的东西公开。
set -euo pipefail

out=.vercel-out
rm -rf "$out" && mkdir -p "$out"

# 落地页与开发者文档。两份都是自包含的单文件 HTML，不需要构建。
cp index.html api.html "$out"/
cp -r assets "$out"/

# console.html 不发。它是 app/ 的前身，落地页和 API 文档上的入口都已经切到
# /app，所以它再没有入口——但它看起来还能用，而它不会跟着产品变。一个拿着
# 旧链接进来的人会以为那就是产品，然后在一张死界面上点半天。404 更诚实。
# 文件留在仓库里：app/src/styles/console.css 的来源就是它。

# 控制台。base 是 /app/（见 app/vite.config.ts），产物直接落在 app/ 下。
#
# npm ci 而不是 npm install：严格按 package-lock.json 装，和本地验证过的一致。
# install 会悄悄升次版本，于是出现「我这儿好的、线上坏的」。
(cd app && npm ci && npm run build)
cp -r app/dist "$out/app"

echo "site assembled in $out:"
ls -1 "$out"
