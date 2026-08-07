# 落地页合并与打通 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `origin/landing-page` 的静态落地页合进 `main`，让它占据根路径，应用整体移到 `/app/*`，并从落地页导航直达登录/注册。

**Architecture:** 单仓库、Vite 多入口。三个 HTML 入口（`index.html` 落地页、`desk.html`、`app/index.html` React 应用）共用一次构建。落地页保持纯静态、零构建依赖，一个字节的 JS 框架都不引入；React 应用通过 react-router 的 `basename: '/app'` 整体挪到子路径。两者之间靠普通 `<a href>` 连接，不共享运行时。

**Tech Stack:** Vite 7、React 19、react-router、Tailwind 4、Vitest 3、Supabase JS 2。落地页侧：手写 HTML/CSS + GSAP 3.12（CDN）。

**Spec:** `docs/superpowers/specs/2026-08-07-landing-page-merge-design.md`

## Global Constraints

- 落地页的设计、动画、文案一律不动，唯一允许的改动是导航栏那一个按钮换成两个。
- 不把落地页移植成 React，不给它引入任何构建期依赖。
- 不新增部署配置文件（`vercel.json` / `netlify.toml` / `Dockerfile` 等），部署要求只写进 README。
- 不重命名仓库、目录或 npm 包名。`package.json` 的 `"name": "advaita-web"` 保持原样。
- 用户可见的 `Advaita` 改成 `Atara`，仅限两处：`app/index.html` 的 `<title>` 和 `src/layouts/Sidebar.tsx`。`package-lock.json`、`supabase/migrations/0001_init.sql` 的注释、`docs/superpowers/` 下的历史文档都不改。
- 应用内所有页面组件不改。允许改的 `src` 文件只有 `src/routes.tsx` 和 `src/layouts/Sidebar.tsx`。
- 测试基线：`npm test` 必须始终 20 个文件 / 128 个测试通过（Task 3 之后变成 21 个文件 / 132 个测试）。
- 提交信息用中文，跟现有历史一致（`fix(auth): ...`、`docs: ...` 这种前缀风格）。

---

## File Structure

| 路径 | 动作 | 职责 |
|---|---|---|
| `index.html` | 替换 | 落地页。合并后取 `origin/landing-page` 的版本，Task 3 加导航按钮 |
| `desk.html` | 新增 | Settlement desk 页，合并带入，Task 3 加导航按钮 |
| `app/index.html` | 新增 | React 应用的 Vite 入口，内容来自原根 `index.html` |
| `public/assets/logos/*.png` | 新增 | 14 个 logo，必须原样拷贝（见 Task 1 Step 8 的理由） |
| `vite.config.ts` | 修改 | 多入口 + `appType: 'mpa'` + dev/preview 的 `/app` 重写中间件 |
| `src/routes.tsx` | 修改 | `createBrowserRouter` 加 `{ basename: '/app' }` |
| `src/layouts/Sidebar.tsx` | 修改 | 品牌名 |
| `src/__tests__/landingEntry.test.ts` | 新增 | 断言落地页存在指向应用的链接 |
| `docs/landing-page.md` | 新增 | 落地页文档，来自 `origin/landing-page` 的 README，需修正过期内容 |
| `README.md` | 修改 | URL 布局、Supabase Site URL、部署要求、落地页章节 |
| `.gitignore` | 修改 | 两边并集 |

`vitest.config.ts` **不改**。它和 `vite.config.ts` 是两份独立配置，测试不经过多入口构建。

---

## Task 1: 合并分支并落位文件

把两段无关历史并到一起，所有文件停在最终位置。这一步不碰构建配置，所以构建还不通 —— 那是 Task 2 的事。

**Files:**
- Create: `app/index.html`, `docs/landing-page.md`, `public/assets/logos/` (14 PNG)
- Modify: `index.html`（替换为落地页）, `.gitignore`
- Merge-in: `desk.html`

**Interfaces:**
- Consumes: 无
- Produces: `app/index.html` 里的 `<script type="module" src="/src/main.tsx">` 是 Task 2 的 `app` 构建入口；`index.html` 和 `desk.html` 是 Task 3 的编辑对象；`public/assets/logos/` 供落地页运行时按 `assets/logos/<n>.png` 取用。

- [ ] **Step 1: 预检 —— 处理工作区里未提交的 `.env.example` 删除**

```bash
git status --short
```

预期会看到 `D .env.example`。这是合并前就存在的未提交改动，不是本计划产生的。

`.env.example` 被 README 的「本地运行」章节直接引用（`cp .env.example .env`），删掉它会让文档里的第一条命令失效。除非确认是有意删除，否则恢复它：

```bash
git checkout -- .env.example
git status --short   # 预期：无输出
```

如果这个删除是有意的，先单独提交，不要混进合并提交。**工作区必须干净才能进入 Step 2。**

- [ ] **Step 2: 记录测试基线**

```bash
npm test
```

预期：`Test Files  20 passed (20)` / `Tests  128 passed (128)`。

- [ ] **Step 3: 发起合并**

```bash
git merge origin/landing-page --allow-unrelated-histories --no-commit
```

预期输出包含三条 add/add 冲突：

```
CONFLICT (add/add): Merge conflict in .gitignore
CONFLICT (add/add): Merge conflict in README.md
CONFLICT (add/add): Merge conflict in index.html
```

`--no-commit` 是为了把落位改动和合并放进同一个提交，避免中间出现一个 `index.html` 是落地页但应用入口不存在的坏状态。

- [ ] **Step 4: 解决 `index.html` —— 取落地页版本**

```bash
git checkout --theirs index.html
git add index.html
```

校验取对了（应输出落地页的 `<title>`，不是「Advaita 运营后台」）：

```bash
grep -m1 '<title>' index.html
```

- [ ] **Step 5: 建立 `app/index.html`**

原根 `index.html` 的内容原样搬过去。`src` 用根绝对路径 `/src/main.tsx`，Vite 从项目根解析，放在子目录也不用改。

```bash
mkdir -p app
```

写入 `app/index.html`：

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Advaita 运营后台</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`<title>` 这里先保持 `Advaita`，Task 4 统一改名。这样改名那个提交能独立看出「只改了品牌字样」。

```bash
git add app/index.html
```

- [ ] **Step 6: 解决 `.gitignore` —— 并集**

两边都有 `.DS_Store`，去重。落地页那些注释解释了为什么某个文件不能进公开仓库（点名了同事、内部定价、竞品分析），信息量真实，保留。

写入 `.gitignore`：

```gitignore
node_modules
dist
.env
.env.local
*.log
*.tsbuildinfo
.DS_Store

# ── 落地页的内部文档 ──────────────────────────────────────────
# 以下文件描述定位策略与竞品分析，仓库是公开的，一律不发布。
landing-content.md
design-direction.md
.impeccable.md
LANDING-RESEARCH.md
LANDING-COPY.md
LANDING-SPEC.md
COMPETITORS.md
DEEPDIVE-ARS-T54.md
DEEPDIVE-TRUSTLINE.md
# 工作方法文档：点名了在世客户、同事，以及内部尚未统一的定位分歧。
METHOD.md
# 产品计划：定价意图、竞品弱点、买家评分、访谈提纲。仅供内部。
PRODUCT.md
# 对齐清单：引用了内部会议纪要里同事的原话。仅供内部。
ALIGNMENT.md

# 落地页的本地编辑备份
*.bak
*.bak[0-9]

# 本地工具
.claude/
```

```bash
git add .gitignore
```

- [ ] **Step 7: 解决 `README.md` —— 保留 main 的，落地页文档另存**

```bash
git checkout --ours README.md
git add README.md
git show origin/landing-page:README.md > docs/landing-page.md
git add docs/landing-page.md
```

`docs/landing-page.md` 里有过期内容（`APP_URL` 常量在 `index.html` 里并不存在，文件表也没有 `desk.html`），Task 5 统一修。这里只做搬运。

- [ ] **Step 8: logo 移到 `public/`**

合并把 `assets/logos/*.png` 带到了项目根。它们必须落在 `public/` 下：落地页是用 `src="assets/logos/${n}.png"` 这种 JS 模板字符串拼出来的，Vite 的 HTML 资源管线只处理静态 `src=` / `href=` 属性，扫不到模板字符串，不会把它们打进产物。`public/` 是原样拷贝到 `dist/` 根，运行时相对路径 `assets/logos/…` 才能对得上。

```bash
mkdir -p public
git mv assets public/assets
ls public/assets/logos | wc -l    # 预期：14
git add public
```

- [ ] **Step 9: 确认没有遗留冲突**

```bash
git status --short
```

预期：没有 `UU` / `AA` 前缀的行，所有改动都是已暂存状态。

- [ ] **Step 10: 确认应用侧测试没被影响**

```bash
npm test
```

预期：仍是 `20 passed` / `128 passed`。这一步没动 `src/`，测试必须原样通过。

- [ ] **Step 11: 提交合并**

```bash
git commit -m "$(cat <<'EOF'
merge: 并入 landing-page 分支，文件落位

两段历史无共同祖先，用 --allow-unrelated-histories 合并。
根 index.html 归落地页，原 Vite 入口移到 app/index.html；
logo 走 public/ 原样拷贝，因为它们由 JS 模板字符串引用，
Vite 的 HTML 资源管线扫不到。
EOF
)"
git log --oneline -1
```

- [ ] **Step 12: 确认落地页的历史进来了**

```bash
git log --oneline | grep -c "Atara landing page"
```

预期：`1`（落地页最早那个提交 `fafe02f` 在历史里）。

---

## Task 2: Vite 多入口与 `/app` 路由前缀

让三个入口都能构建、都能在 dev 和 preview 下访问，并把 React 应用整体挪到 `/app`。

**Files:**
- Modify: `vite.config.ts`
- Modify: `src/routes.tsx:15`

**Interfaces:**
- Consumes: Task 1 产出的 `index.html`、`desk.html`、`app/index.html`、`public/assets/logos/`
- Produces: 应用在 `/app/*` 可访问。Task 3 的导航按钮指向的 `/app/login`、`/app/register` 由此生效。

- [ ] **Step 1: 改写 `vite.config.ts`**

完整替换文件内容：

```ts
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
// 注册在 configureServer 主体里（而不是它返回的 post 钩子）是必须的 —— 只有这样
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
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  appType: 'mpa',
  build: {
    rollupOptions: {
      input: {
        // desk.html 必须显式声明。Vite 不重写 <a href>，也不会把未声明为入口的
        // 根级 HTML 拷进 dist —— 漏了它，落地页上指向 desk.html 的链接生产环境 404。
        landing: path.resolve(import.meta.dirname, 'index.html'),
        desk: path.resolve(import.meta.dirname, 'desk.html'),
        app: path.resolve(import.meta.dirname, 'app/index.html'),
      },
    },
  },
});
```

`_res` 前缀下划线是因为 tsconfig 开了 `noUnusedParameters`。

- [ ] **Step 2: 给 router 加 basename**

`src/routes.tsx` 末尾，`createBrowserRouter` 的数组参数后面加第二个参数。改前：

```ts
    ],
  },
]);

export default router;
```

改后：

```ts
    ],
  },
], { basename: '/app' });

export default router;
```

只此一处。应用内所有 `<Link>` / `<Navigate>` / `navigate()` 都会自动带上前缀，包括 `LoginPage` 里已有的 `<Link to="/register">` 和 `RequireAuth` 里的 `<Navigate to="/login">`，不需要逐个改。

- [ ] **Step 3: 类型检查与构建**

```bash
npm run build
```

预期：`tsc -b` 无报错，`vite build` 成功。

- [ ] **Step 4: 核对构建产物**

```bash
ls dist/index.html dist/desk.html dist/app/index.html
ls dist/assets/logos/*.png | wc -l
```

预期：三个 HTML 都在，logo 数量为 `14`。

任何一项缺失都说明 Step 1 的 `input` 或 Task 1 Step 8 的 `public/` 落位有问题，不要跳过。

- [ ] **Step 5: 单元测试**

```bash
npm test
```

预期：`20 passed` / `128 passed`。测试走 `vitest.config.ts`，不受多入口影响；这一步是确认 basename 没有意外打破任何用 `MemoryRouter` 的测试。

- [ ] **Step 6: 手动核对 dev server**

```bash
npm run dev
```

逐条确认，全部通过才算完成：

| 访问 | 预期 |
|---|---|
| `http://localhost:5173/` | Atara 落地页 |
| `http://localhost:5173/desk.html` | Settlement desk 页 |
| `http://localhost:5173/app/login` | 应用登录页 |
| `http://localhost:5173/app/orders` | 直接在地址栏输入并回车，不是 404（未登录会被导到 `/app/login`，那是对的） |
| 落地页上的 logo 条 | 图片正常显示，不是碎图 |

最后一条特别要看：碎图说明 `public/assets/logos/` 的路径没对上。

- [ ] **Step 7: 手动核对 preview server**

```bash
npm run preview
```

访问 `/app/orders`（preview 默认端口 4173），预期同样不是 404。这条验证的是 `configurePreviewServer` 那半边，dev 通过不代表 preview 通过。

- [ ] **Step 8: 提交**

```bash
git add vite.config.ts src/routes.tsx
git commit -m "feat(routing): 落地页占根路径，应用整体移到 /app"
```

---

## Task 3: 落地页到应用的入口

两个落地页的导航栏右侧按钮换成登录/注册。先写测试。

**Files:**
- Create: `src/__tests__/landingEntry.test.ts`
- Modify: `index.html:622`, `desk.html:409`

**Interfaces:**
- Consumes: Task 2 建立的 `/app/login`、`/app/register` 两个可访问 URL
- Produces: 无（终点功能）

- [ ] **Step 1: 写失败的测试**

创建 `src/__tests__/landingEntry.test.ts`：

```ts
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 落地页是手写 HTML，没有类型系统兜底：把导航按钮删了、把 href 改错了，
// 构建照样通过。这两条断言是唯一能拦住「改版把进应用的入口弄丢」的东西。
const PAGES = ['index.html', 'desk.html'];

function readPage(page: string) {
  return readFileSync(resolve(process.cwd(), page), 'utf8');
}

describe('落地页到应用的入口', () => {
  it.each(PAGES)('%s 有指向 /app/login 的链接', (page) => {
    expect(readPage(page)).toContain('href="/app/login"');
  });

  it.each(PAGES)('%s 有指向 /app/register 的链接', (page) => {
    expect(readPage(page)).toContain('href="/app/register"');
  });
});
```

测试文件放在 `src/` 下是有原因的：tsconfig 的 `include` 只有 `["src", "vite.config.ts", "vitest.config.ts"]`，放到 `src` 外面 `tsc -b` 就不会检查它。

- [ ] **Step 2: 跑测试，确认它失败**

```bash
npx vitest run src/__tests__/landingEntry.test.ts
```

预期：4 个测试全部 FAIL，报错形如 `expected '<!doctype html>…' to contain 'href="/app/login"'`。

如果它意外通过了，说明落地页里已经有这些链接，停下来搞清楚原因再继续。

- [ ] **Step 3: 改 `index.html` 的导航**

找到导航栏里这一行（Task 1 合并后大约在第 622 行）：

```html
    <a class="btn btn-solid" href="#contact">Start <span class="arw" aria-hidden="true">&rarr;</span></a>
```

替换成两行：

```html
    <a class="btn btn-ghost" href="/app/login">Sign in</a>
    <a class="btn btn-solid" href="/app/register">Get started <span class="arw" aria-hidden="true">&rarr;</span></a>
```

三件事必须留神：

1. **是替换，不是追加。** 原来那个 `Start →` 指向 `#contact` 的 waitlist。三个动作按钮挤在导航里，而且 `Start` 和 `Get started` 语义打架，用户分不清哪个是注册。
2. **waitlist 没有丢。** hero 区的 `Start →` + `Talk to us`、页尾 CTA 区的按钮都指向 `#contact`，那些**一律不动**。导航栏专职做应用入口，正文专职做 waitlist。
3. **必须用 `.btn-ghost`，不能用 `.lnk`。** `index.html` 里有 `@media (max-width:880px){.nav a.lnk{display:none}}` —— `.lnk` 在窄屏是隐藏的，登录入口不能跟着消失。`.btn` 没有隐藏规则。

不需要新增任何 CSS：`.btn`、`.btn-solid`、`.btn-ghost`、`.arw` 都已在该文件的 `<style>` 里定义，`.brand{margin-right:auto}` 会自动把按钮推到右侧，`.nav .btn{padding:.6em 1.25em;font-size:.875rem}` 已经为导航调过尺寸。

- [ ] **Step 4: 改 `desk.html` 的导航**

找到（大约第 409 行）：

```html
    <a class="btn btn-solid" href="#contact">Start a trade <span class="arw" aria-hidden="true">→</span></a>
```

替换成：

```html
    <a class="btn btn-ghost" href="/app/login">Sign in</a>
    <a class="btn btn-solid" href="/app/register">Get started <span class="arw" aria-hidden="true">→</span></a>
```

注意箭头字符：`desk.html` 用的是字面量 `→`，`index.html` 用的是实体 `&rarr;`。各自沿用本文件的写法，不要统一。

`desk.html` 同样已定义 `.btn-ghost` / `.arw`，`.brand{margin-right:auto}` 也在。它的 `.btn-solid` 用 `--accent` 配色（`index.html` 用 `--ink`），这是两页各自的既有设计，保持原样。正文里的 `Start a trade` CTA 不动。

- [ ] **Step 5: 跑测试，确认通过**

```bash
npx vitest run src/__tests__/landingEntry.test.ts
```

预期：4 个测试全部 PASS。

- [ ] **Step 6: 跑全量测试**

```bash
npm test
```

预期：`Test Files  21 passed (21)` / `Tests  132 passed (132)`。

- [ ] **Step 7: 手动核对**

```bash
npm run dev
```

- 打开 `http://localhost:5173/`，导航右侧应看到 `Sign in`（描边）和 `Get started →`（实底）两个按钮。
- 点 `Sign in` → 到登录页；返回后点 `Get started` → 到注册页。
- 打开 `http://localhost:5173/desk.html`，同样两个按钮，同样能跳。
- **把窗口宽度拖到 800px 以下**（窄于 880px 的断点），两个按钮必须仍然可见 —— 消失就说明用错了 class。
- 落地页正文的 `Start →` / `Talk to us` 仍然滚到 `#contact` 表单，没被改坏。

- [ ] **Step 8: 提交**

```bash
git add src/__tests__/landingEntry.test.ts index.html desk.html
git commit -m "feat(landing): 导航栏加登录/注册入口，直达 /app"
```

---

## Task 4: 品牌名改为 Atara

**Files:**
- Modify: `app/index.html:6`
- Modify: `src/layouts/Sidebar.tsx:12`

**Interfaces:**
- Consumes: Task 1 建立的 `app/index.html`
- Produces: 无

- [ ] **Step 1: 改浏览器标题**

`app/index.html` 第 6 行：

```html
    <title>Advaita 运营后台</title>
```

改成：

```html
    <title>Atara 运营后台</title>
```

- [ ] **Step 2: 改侧边栏标题**

`src/layouts/Sidebar.tsx` 第 12 行：

```tsx
      <div className="px-[22px] py-4 text-base font-semibold">Advaita</div>
```

改成：

```tsx
      <div className="px-[22px] py-4 text-base font-semibold">Atara</div>
```

- [ ] **Step 3: 确认没有改多**

```bash
grep -rniE "advaita" --include="*.ts" --include="*.tsx" --include="*.html" . | grep -v node_modules | grep -v "^./docs/"
```

预期只剩下这些，**都不该改**：

```
package.json:2:  "name": "advaita-web",
package-lock.json:2:  "name": "advaita-web",
package-lock.json:8:      "name": "advaita-web",
```

`README.md` 的 `# advaita-web` 标题和 `supabase/migrations/0001_init.sql` 的注释也保持原样（前者是仓库名，后者是历史记录）。

- [ ] **Step 4: 跑测试**

```bash
npm test
```

预期：`21 passed` / `132 passed`。`src/layouts/__tests__/Sidebar.test.tsx` 不断言品牌名，改动不会影响它。

- [ ] **Step 5: 提交**

```bash
git add app/index.html src/layouts/Sidebar.tsx
git commit -m "chore(brand): 应用内品牌名改为 Atara"
```

---

## Task 5: 文档

把 URL 布局、Supabase 配置变更、部署要求写清楚，并修掉落地页文档里的过期内容。

**Files:**
- Modify: `README.md`
- Modify: `docs/landing-page.md`

**Interfaces:**
- Consumes: 前四个 Task 的全部产出
- Produces: 无

- [ ] **Step 1: README 的「本地运行」加 URL 说明**

在 `npm run dev` 那个代码块后面补一段：

```markdown
起来之后：

| 地址 | 内容 |
|---|---|
| `http://localhost:5173/` | Atara 落地页（静态） |
| `http://localhost:5173/desk.html` | Settlement desk（静态） |
| `http://localhost:5173/app/` | 运营后台（React 应用） |

落地页导航栏的 **Sign in** / **Get started** 直接进应用。
```

- [ ] **Step 2: 改 Supabase 的 Site URL 说明**

README 第 23–24 行现在是：

```markdown
3. 打开 **Authentication → URL Configuration**，把 **Site URL** 设为应用地址
   （本地开发填 `http://localhost:5173`），否则验证邮件里的链接会指向错误地址。
```

改成：

```markdown
3. 打开 **Authentication → URL Configuration**，把 **Site URL** 设为应用地址
   （本地开发填 `http://localhost:5173/app`），否则验证邮件里的链接会指向错误地址。

   **末尾的 `/app` 不能省。** 应用挂在 `/app` 子路径下，根路径是落地页；
   漏掉的话用户点验证邮件会落到落地页，看起来像验证失败。
   代码里没有任何 `emailRedirectTo`，注册确认完全依赖这个配置。
```

- [ ] **Step 3: README 新增「落地页」章节**

放在「脚本」章节之前：

```markdown
## 落地页

根路径的落地页是纯静态的手写 HTML，没有构建依赖，不属于 React 应用：

| 文件 | 说明 |
|---|---|
| `index.html` | 落地页，HTML / CSS / JS 全部内联 |
| `desk.html` | Settlement desk 页 |
| `public/assets/logos/` | 14 个生态 logo |

设计系统、动效约定和改动注意事项见 `docs/landing-page.md`。

改落地页时唯一的硬约束：导航栏里指向 `/app/login` 和 `/app/register` 的两个链接
不能删也不能改路径。`src/__tests__/landingEntry.test.ts` 会盯着这一点。

logo 放在 `public/` 而不是项目根的 `assets/`，是因为它们由 JS 拼路径
（`src="assets/logos/${n}.png"`），Vite 的 HTML 资源管线扫不到模板字符串，
只有 `public/` 的原样拷贝能保证运行时路径不变。
```

- [ ] **Step 4: README 新增「部署」章节**

放在「落地页」章节之后：

````markdown
## 部署

`npm run build` 产出三个入口：

```
dist/index.html        →  /
dist/desk.html         →  /desk.html
dist/app/index.html    →  /app/*
dist/assets/           →  构建产物 + 14 个 logo
```

**宿主必须配一条 rewrite 规则**：`/app/*` 下所有未命中静态文件的请求都返回
`dist/app/index.html`，否则用户刷新 `/app/orders` 会 404。这是客户端路由的常规要求，
但因为应用不在根路径，默认的 SPA 模板通常不覆盖这种情况。

本地 `npm run dev` 和 `npm run preview` 由 `vite.config.ts` 里的
`appHistoryFallback` 插件负责同样的重写，无需额外配置。

仓库刻意不带部署配置文件，规则请按实际宿主自行添加。
````

- [ ] **Step 5: 修 `docs/landing-page.md` 的过期内容**

这份文档是从落地页分支的 README 原样搬过来的，有三处和现状对不上：

1. 顶部的 `Open index.html in a browser` 和 `python3 -m http.server 4173` —— 落地页现在是本仓库 Vite 构建的一部分。在文件开头加一段：

```markdown
> 这份文档来自落地页独立仓库时期。落地页现已并入本仓库，用 `npm run dev` 预览，
> 访问根路径即可；构建、部署和与应用的衔接见根目录 `README.md`。
> 下面关于设计系统和动效的部分仍然有效。
```

2. Files 表格缺 `desk.html`，且 `assets/logos/` 路径变了。表格改成：

```markdown
| Path | Purpose |
|---|---|
| `index.html` | The whole page — HTML, CSS and JS inlined |
| `desk.html` | Settlement desk — same technique, its own inlined styles |
| `public/assets/logos/` | 14 ecosystem logos (PNG, ~125 KB total) |
```

3. **「Configure before launch」里的 `APP_URL` 那一条要删掉。** 该常量在 `index.html` 里根本不存在（`grep -n APP_URL index.html` 无输出），是过期文档。进应用的入口现在是导航栏那两个写死的 `/app/login`、`/app/register` 链接。把那一条替换成：

```markdown
1. **进应用的入口** — 导航栏的 `Sign in` / `Get started` 直接指向 `/app/login`
   和 `/app/register`。这两个链接受 `src/__tests__/landingEntry.test.ts` 保护，
   删改前先看那个测试。
```

`WAITLIST_ENDPOINT` 那一条保留，它仍然准确。

- [ ] **Step 6: 核对文档里的命令和路径都是真的**

```bash
grep -n "APP_URL" index.html docs/landing-page.md
```

预期：`index.html` 无输出；`docs/landing-page.md` 也无输出（Step 5 已删）。

```bash
ls public/assets/logos | wc -l    # 预期 14，和文档里的数字对上
```

- [ ] **Step 7: 全量验证**

```bash
npm test && npm run build
```

预期：`21 passed` / `132 passed`，构建成功。

- [ ] **Step 8: 提交**

```bash
git add README.md docs/landing-page.md
git commit -m "docs: 补落地页、/app 路径与部署要求，修掉过期的 APP_URL 说明"
```

---

## 收尾检查

全部任务完成后，从干净状态走一遍：

- [ ] `git status --short` 无输出
- [ ] `npm test` → 21 files / 132 tests passed
- [ ] `npm run build` → 成功，`dist/index.html`、`dist/desk.html`、`dist/app/index.html`、`dist/assets/logos/`（14 个）齐全
- [ ] `npm run preview` → `/` 落地页、`/desk.html`、`/app/login` 可访问，`/app/orders` 刷新不 404
- [ ] 落地页导航两个按钮在窄屏（<880px）仍可见
- [ ] Supabase 后台的 Site URL 已改成带 `/app` 的地址（这是后台配置，代码改不了，别忘）

最后一条是唯一一个代码之外的动作，漏了的话新用户注册后点验证邮件会落到落地页。
