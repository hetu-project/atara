# 落地页合并与打通 设计文档

**日期：** 2026-08-07
**目标：** 把 `origin/landing-page` 分支合进 `main`，让落地页成为站点门面，并从落地页导航直达应用的登录/注册。

---

## 现状

两个分支**没有共同祖先**（`git merge-base main origin/landing-page` 返回空），合并需要 `--allow-unrelated-histories`。

`origin/landing-page` 不是 React 代码，是一套独立的静态站：

| 文件 | 说明 |
|---|---|
| `index.html` | 73 KB，HTML / CSS / JS 全部内联的 Atara 落地页 |
| `desk.html` | 58 KB，第二个页面（Settlement desk） |
| `assets/logos/*.png` | 14 个生态 logo，约 125 KB |
| `README.md` | 落地页自己的文档（设计系统、配置项、结构说明） |

外部依赖全走 CDN（Fontshare、Google Fonts、GSAP 3.12 + ScrollTrigger），刻意做成无构建步骤。

三个文件与 `main` 同名冲突：`.gitignore`、`README.md`、`index.html`。其中 `index.html` 是真冲突 —— `main` 的是 Vite 入口，落地页的是页面本身。

落地页目前**没有任何指向应用的入口**。导航和 CTA 一律是 `Start →` / `Talk to us` / `Start a trade →`，全部指向 `#contact` 的 waitlist 表单。落地页 README 提到有 `APP_URL` 常量可配，但 `index.html` 里搜不到 —— 那段文档已过期，没有现成挂载点。

应用侧：`/login`、`/register` 公开，其余在 `RequireAuth` 之后，`/` 跳 `/orders`。也就是说未登录访客访问根路径会被踢到登录页 —— 有了公开落地页之后，这个首页行为必须改。

---

## 决策

**根路径归落地页，应用整体挪到 `/app/*`。**

```
/                 Atara 落地页（静态）
/desk.html        Settlement desk（静态）
/app/login        登录
/app/register     注册
/app/orders       订单列表
/app/profile      我的档案
```

备选方案及淘汰理由：

- **应用保持 `/`，落地页挂 `/welcome`** —— 改动最小，但未登录访客打开根域名仍会被踢到登录页，落地页变成没人会主动去的角落。产品上说不通。
- **把落地页移植成 React 路由** —— 全站单 SPA 最干净，但那是 73 KB 手写 HTML/CSS 加 GSAP 动画（可拖拽地球、3D portal、终端回放），移植工作量大且极易改坏，落地页「无构建依赖」的设计前提也没了。不值得现在做。

---

## 文件布局

```
index.html              落地页（landing 原样 + 导航按钮）
desk.html               Settlement desk（同上）
app/index.html          React 入口（原根 index.html，script src 仍是 /src/main.tsx）
public/assets/logos/    14 个 PNG
docs/landing-page.md    landing 的 README 搬这里
README.md               main 的，加落地页章节 + 改 Supabase 配置说明
.gitignore              两边并集
src/                    除 routes.tsx 和 Sidebar.tsx 外不动
```

logo 必须放 `public/`，不能放项目根的 `assets/`：它们由 JS 拼出（`src="assets/logos/${n}.png"`），Vite 的 HTML 资源管线只处理静态 `src=` / `href=` 属性，扫不到模板字符串。只有 `public/` 的原样拷贝能保证运行时路径不变。

---

## Vite 配置

改成多入口：

```ts
build: {
  rollupOptions: {
    input: { landing: 'index.html', desk: 'desk.html', app: 'app/index.html' },
  },
},
appType: 'mpa',
```

`desk.html` 必须显式列为入口。Vite 不会重写 `<a href>`，也不会把没被声明为入口的根级 HTML 拷进 `dist` —— 漏了它，落地页里那几个指向 `desk.html` 的链接在生产环境会 404。

再加一个本地插件 `appHistoryFallback()`：在 `configureServer` 和 `configurePreviewServer` 里插中间件，把 `/app` 开头、无文件扩展名的请求重写到 `/app/index.html`。

这个插件是必需的，不是优化：`appType: 'mpa'` 关掉了 Vite 的 SPA fallback，不加中间件的话 dev 下深链 `/app/orders` 直接 404；而如果保留 `appType: 'spa'`，fallback 会把 `/app/orders` 喂成落地页，更糟。

落地页的 `index.html` 会经过 Vite 的 HTML 处理，但内容基本原样通过：内联 `<script>` 不是 `type="module"`，Vite 不碰；`<style>` 内联不碰；CDN 的 `<script src="https://...">` 和 `<link href="https://...">` 是外部 URL，不碰。

**生产部署需要宿主侧提供同样的 rewrite 规则**（`/app/*` → `/app/index.html`）。仓库当前没有任何部署配置文件，本次不新增，只在 README 写清这条要求。

---

## 路由

```ts
createBrowserRouter(routes, { basename: '/app' })
```

只此一处。应用内所有 `<Link>` 和 `navigate()` 自动带前缀，包括 `LoginPage` 里已有的 `<Link to="/register">`，不需要逐个改。

---

## 落地页入口

`index.html` 和 `desk.html` 导航右侧那个指向 `#contact` 的按钮，**换成**两个指向应用的按钮：

```html
<a class="btn btn-ghost" href="/app/login">Sign in</a>
<a class="btn btn-solid" href="/app/register">Get started <span class="arw" aria-hidden="true">&rarr;</span></a>
```

不是在原按钮旁边追加第三个：三个动作按钮挤在一起，且 `Start →` 与 `Get started` 语义打架，用户分不清哪个是注册。

waitlist 没有丢 —— 它在 hero（`Start →` + `Talk to us`）和页尾 CTA 区各有一次曝光，两处都不动。导航栏专职做应用入口，正文专职做 waitlist，分工清楚。`desk.html` 同理：导航的 `Start a trade →` 换掉，正文 CTA 不动。

样式必须用 `.btn-ghost` 而不是 `.lnk`：

```css
@media (max-width:880px){ .nav a.lnk{display:none} }   /* index.html */
@media (max-width:900px){ .nav-links{display:none} }   /* desk.html */
```

`.lnk` 和 `.nav-links` 在窄屏是隐藏的，登录入口不能跟着消失。`.btn` 没有隐藏规则，且 `.nav .btn{padding:.6em 1.25em;font-size:.875rem}` 已经为导航栏调过尺寸。

**不需要新增任何 CSS**：两个页面各自的 `<style>` 里都已定义 `.btn`、`.btn-solid`、`.btn-ghost`、`.arw`，且 `.brand{margin-right:auto}` 会自动把按钮推到导航右侧。注意两页的 `.btn-solid` 配色不同（`index.html` 用 `--ink`，`desk.html` 用 `--accent`），这是各自页面的既有设计，保持原样。

---

## 品牌名

应用内两处用户可见的 `Advaita` 改成 `Atara`：

- `app/index.html` 的 `<title>Advaita 运营后台</title>`
- `src/layouts/Sidebar.tsx:12` 的侧边栏标题

不改的：`package.json` / `package-lock.json` 的包名、README 的仓库名标题、`supabase/migrations/0001_init.sql` 的注释、`docs/superpowers/` 下的历史设计与计划文档。那些是标识符和历史记录，不是招牌。

---

## Supabase 配置

Site URL 从 `http://localhost:5173` 改成 `http://localhost:5173/app`，否则验证邮件里的链接会落到落地页而不是应用。

代码里没有任何 `emailRedirectTo`，注册确认完全依赖 Site URL，所以这纯是后台配置 + README 第 23–24 行的文字改动，不涉及代码。

---

## 合并方式

`git merge origin/landing-page --allow-unrelated-histories`，保留落地页的 9 个提交进 `main` 的历史。三个冲突文件手工解决：

| 文件 | 解法 |
|---|---|
| `index.html` | 取落地页版本；`main` 的 Vite 入口内容移到 `app/index.html` |
| `.gitignore` | 两边并集 |
| `README.md` | 取 `main` 版本；落地页 README 移到 `docs/landing-page.md` |

合并与文件落位合成一个提交（用 `--no-commit` 让两者同时落地，避免中间出现「根 `index.html` 已是落地页、但应用入口尚不存在」的坏状态）。后续的打通改造按任务另行分多个提交，与合并本身分开，以便回溯。

---

## 验证

- `npm test` 保持全绿。基线：20 个文件 / 128 个测试通过。
- 新增测试：读 `index.html` 和 `desk.html`，断言存在指向 `/app/login` 和 `/app/register` 的链接。落地页是手写 HTML，没有类型系统兜底，这条断言防止以后改版把入口弄丢。
- `npm run build` 产出必须包含 `dist/index.html`、`dist/desk.html`、`dist/app/index.html`、`dist/assets/logos/`（14 个 PNG）。
- `npm run dev` 手动核对：`/` 出落地页；点 Sign in 到登录页；`/app/orders` 直接刷新不 404；窄屏（<880px）导航里两个按钮仍可见。

---

## 不做

- 不把落地页移植成 React
- 不改落地页的设计、动画、文案（导航按钮除外）
- 不改应用内任何页面（`routes.tsx` 的 basename 和 `Sidebar.tsx` 的品牌名除外）
- 不新增部署配置文件
- 不重命名仓库、目录或 npm 包名

---

## 已知遗留

落地页是英文的 "Atara"，应用是中文界面，点 Sign in 会有语言断层。本次不处理，需要单独排期决定应用是否要英文化或落地页是否要中文版。
