# advaita-web

买卖家档案与订单管理后台。React + Vite + Tailwind + Supabase。

## 本地运行

```bash
npm install
cp .env.example .env   # 填入下方获取的两个值
npm run dev
```

起来之后：

| 地址 | 内容 |
|---|---|
| `http://localhost:5173/` | Atara 落地页（静态） |
| `http://localhost:5173/desk.html` | Settlement desk（静态） |
| `http://localhost:5173/app/` | 运营后台（React 应用） |

落地页导航栏的 **Sign in** / **Get started** 直接进应用。

## Supabase 接入（四步）

1. 到 [supabase.com](https://supabase.com) 新建一个项目，记下数据库密码。
2. 打开项目的 **SQL Editor**，把 `supabase/migrations/0001_init.sql` 全文粘贴进去执行。
   执行成功后在 **Table Editor** 应能看到 `counterparties`、`orders`、`order_status_logs`、
   `order_no_counters` 四张表。
   脚本不是可重复执行的（用的是 `create table` 而非 `create table if not exists`），
   但脚本本身用 `begin` / `commit` 包住了整段内容：中途报错会整体回滚，数据库保持原样，
   修好后重新粘贴即可，不会留下建了一半的 schema。这个保证来自脚本本身，
   不依赖 SQL Editor、psql 或 `supabase db push` 里的任何一种执行方式。
3. 打开 **Authentication → URL Configuration**，把 **Site URL** 设为应用地址
   （本地开发填 `http://localhost:5173/app`），否则验证邮件里的链接会指向错误地址。

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
`dist/app/index.html`，否则用户刷新 `/app/orders` 会 404。这是客户端路由的常规要求，
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
- 交付说明（含手工验收清单，务必在上线前跑一遍）：`docs/HANDOFF.md`
