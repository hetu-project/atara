# advaita-web

买卖家档案与订单管理后台。React + Vite + Tailwind + Supabase。

## 本地运行

```bash
npm install
cp .env.example .env   # 填入下方获取的两个值
npm run dev
```

## Supabase 接入（四步）

1. 到 [supabase.com](https://supabase.com) 新建一个项目，记下数据库密码。
2. 打开项目的 **SQL Editor**，把 `supabase/migrations/0001_init.sql` 全文粘贴进去执行。
   执行成功后在 **Table Editor** 应能看到 `counterparties`、`orders`、`order_status_logs`、
   `order_no_counters` 四张表。
   脚本不是可重复执行的（用的是 `create table` 而非 `create table if not exists`），
   但 SQL Editor 会把整段包在一个事务里：中途报错会整体回滚，数据库保持原样，
   修好后重新粘贴即可，不会留下建了一半的 schema。
3. 打开 **Authentication → Providers → Email**，把 **Enable Sign Ups** 关掉（本项目不开放注册）；
   再到 **Authentication → Users → Add user**，手工创建登录账号（勾选 Auto Confirm User）。
4. 打开 **Project Settings → API**，复制 `Project URL` 和 `anon public` key，
   填进项目根目录的 `.env`：

   ```
   VITE_SUPABASE_URL=<Project URL>
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

   若 `npm run dev` 已经在跑，改完 `.env` 后必须重启它 —— Vite 只在启动时读取
   `import.meta.env`，不重启会看到 client 初始化失败。

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm test` | 跑 Vitest |

## 文档

- 设计文档：`docs/superpowers/specs/2026-08-06-advaita-web-design.md`
- 实施计划：`docs/superpowers/plans/2026-08-06-advaita-web.md`
