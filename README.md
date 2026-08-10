# advaita-web

Atara —— 落地页 + 订单池撮合演示后台。React + Vite + Tailwind。

根路径是静态落地页，`/app` 是应用。应用当前跑纯前端演示，不连数据库；
原先接 Supabase 的实现保留在仓库里但未挂路由。

## 本地运行

```bash
npm install
cp .env.example .env   # 填入下方获取的两个值
npm run dev
```

起来之后：

| 地址 | 内容 |
|---|---|
| `http://localhost:5174/` | Atara 落地页（静态） |
| `http://localhost:5174/desk.html` | Settlement desk（静态） |
| `http://localhost:5174/app/` | 撮合演示后台（React 应用） |

落地页导航栏的 **Sign in** / **Get started** 直接进应用。

## Supabase 接入（四步）

> 当前 `/app` 跑的是纯前端演示，**不需要 Supabase 也能完整运行**。下面这节是给
> 把真实应用接回来时用的（见下面「应用（演示模式）」章节末尾）。

1. 到 [supabase.com](https://supabase.com) 新建一个项目，记下数据库密码。
2. 打开项目的 **SQL Editor**，把 `supabase/migrations/0001_init.sql` 全文粘贴进去执行。
   执行成功后在 **Table Editor** 应能看到 `counterparties`、`orders`、`order_status_logs`、
   `order_no_counters` 四张表。
   脚本不是可重复执行的（用的是 `create table` 而非 `create table if not exists`），
   但脚本本身用 `begin` / `commit` 包住了整段内容：中途报错会整体回滚，数据库保持原样，
   修好后重新粘贴即可，不会留下建了一半的 schema。这个保证来自脚本本身，
   不依赖 SQL Editor、psql 或 `supabase db push` 里的任何一种执行方式。
3. 打开 **Authentication → URL Configuration**，把 **Site URL** 设为应用地址
   （本地开发填 `http://localhost:5174/app`），否则验证邮件里的链接会指向错误地址。

   **末尾的 `/app` 不能省。** 应用挂在 `/app` 子路径下，根路径是落地页；
   漏掉的话用户点验证邮件会落到落地页，看起来像验证失败。
   代码里没有任何 `emailRedirectTo`，注册确认完全依赖这个配置。

   用户在应用内自助注册（`/register`），无需在后台手工建号；
   **Enable Sign Ups 必须保持开启**。

   **邮箱验证默认开启**，注册后需点邮件里的链接才能登录。
   如需关闭：**Authentication → Providers → Email** → 取消 **Confirm email**。
   前端两种配置都能正常工作，不需要改代码。
4. 打开 **Project Settings → API**，复制 `Project URL` 和 `anon public` key，
   填进项目根目录的 `.env`：

   ```
   VITE_SUPABASE_URL=<Project URL>
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

   若 `npm run dev` 已经在跑，改完 `.env` 后必须重启它 —— Vite 只在启动时读取
   `import.meta.env`，不重启会看到 client 初始化失败。

## 应用（演示模式）

`/app` 下是订单池撮合的演示，**纯前端，不连数据库**：

| 路由 | 页面 | 说明 |
|---|---|---|
| `/app/login` · `/app/register` | 登录 / 注册 | 一键进入，任意输入即可 |
| `/app/overview` | 首页 | 交易总数、通过率、走势 |
| `/app/pool` | 交易大厅 | 挂单卡片墙，点卡片接单 |
| `/app/queue` | 我的交易 | 每笔交易的 AI 检查结果 |
| `/app/challenges` | 待我处理 | 补齐材料后自动重新检查 |
| `/app/desk` | 我的账户 | 买入账户与卖出账户 |

URL 保留英文（`pool` / `queue` / `desk`），界面文案一律用普通用户看得懂的说法，
不用「订单池」「队列」「席位」「挡单」这类行话。

接单后会有一段约 6 秒的**全屏 AI 检查演出**（`components/MatchCeremony.tsx`）：
双方卡片汇聚 → 扫描光束 → 六项检查逐条弹出 → 评分环绘制 → 给出结论 → 跳转。
右上角可跳过，`prefers-reduced-motion` 下自动跳过。

**风控推理不调用任何 AI 服务，也不发网络请求。** 结论由 `src/demo/engine/riskEngine.ts`
本地算出，UI 按节奏逐条显示。做成引擎而非写死文案，是为了让不同的单跑出不同的
检查数值和结论 —— 撮合十笔不会弹十遍相同台词。

三个引擎都刻意写得很薄，各自配了单测：

| 文件 | 职责 |
|---|---|
| `engine/matching.ts` | 能否撮合。**只有一条规则**：席位得先开通 |
| `engine/riskEngine.ts` | 先由种子定分数，再倒推出几条问题项 |
| `engine/queueMachine.ts` | `queued → validating → passed / challenged / declined` |

测试只钉住「屏幕上不会自相矛盾」（分数与裁决一致、放行的单不出现 fail、同一笔单
反复看结果不变），不去验证业务规则是否合理 —— 那些规则本来就是编的。

状态存在 sessionStorage，刷新不丢，关掉标签页即重置。所有伪随机用
`seededRandom(种子)` 而非 `Math.random()`，否则重新渲染会让分数跳变，一眼穿帮。

原先接 Supabase 的真实应用代码保留在 `src/features/`、`src/lib/supabase.ts`、
`src/layouts/`，但不再挂路由，也已从 `src/App.tsx` 摘除（留着会在挂载时拉起
Supabase 客户端并发网络请求）。要接回来改 `src/routes.tsx` 和 `src/App.tsx` 即可。

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

## 部署

`npm run build` 产出三个入口：

```
dist/index.html        →  /
dist/desk.html         →  /desk.html
dist/app/index.html    →  /app/*
dist/assets/           →  构建产物 + 14 个 logo
```

**宿主必须配一条 rewrite 规则**：`/app/*` 下所有未命中静态文件的请求都返回
`dist/app/index.html`，否则用户刷新 `/app/queue` 会 404。这是客户端路由的常规要求，
但因为应用不在根路径，默认的 SPA 模板通常不覆盖这种情况。

本地 `npm run dev` 和 `npm run preview` 由 `vite.config.ts` 里的
`appHistoryFallback` 插件负责同样的重写，无需额外配置。

仓库刻意不带部署配置文件，规则请按实际宿主自行添加。

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm run preview` | 预览生产构建产物 |
| `npm test` | 跑 Vitest |

## 权限模型

每个账号只能访问自己的数据：

- **档案**：只能增删改查自己的（`counterparties.user_id = auth.uid()`）
- **订单**：只能看自己是买方或卖方的
- **状态流转**：付款方可标「已付款」，收款方可标「已完成」，待付款下双方可取消。
  由数据库 trigger 强制，前端只是灰掉按钮。

对手方通过 `display_id`（形如 `U000123`）精确查询，只返回 ID、角色、姓名 —— 
身份证号和银行账号在数据库层面就拿不到。把自己的 `display_id` 线下告诉交易对手。

## 已知的 npm audit 告警（不要“修”）

`npm audit` 会报一个 react-router 的 high severity 漏洞
（[GHSA-qwww-vcr4-c8h2](https://github.com/advisories/GHSA-qwww-vcr4-c8h2)）。
它针对的是 RSC（React Server Components）模式下的 CSRF 绕过，而本项目是纯客户端
SPA：没有 loader、没有 action、没有 server，不会触发这个漏洞路径。

`npm audit fix --force` 会把 react-router 升到 breaking 的 v8 大版本 —— 不要跑这个命令。
这条告警可以留着，它不适用于这个项目。

## 文档

- 设计文档：`docs/superpowers/specs/2026-08-06-advaita-web-design.md`
- 实施计划：`docs/superpowers/plans/2026-08-06-advaita-web.md`
- 自助注册设计文档：`docs/superpowers/specs/2026-08-06-self-registration-design.md`
- 自助注册实施计划：`docs/superpowers/plans/2026-08-06-self-registration.md`
- 落地页合并设计与计划：`docs/superpowers/specs/2026-08-07-landing-page-merge-design.md`、`docs/superpowers/plans/2026-08-07-landing-page-merge.md`
- 撮合演示设计与计划：`docs/superpowers/specs/2026-08-09-trading-desk-demo-design.md`、`docs/superpowers/plans/2026-08-09-trading-desk-demo.md`
- 交付说明（含手工验收清单，务必在上线前跑一遍）：`docs/HANDOFF.md`
