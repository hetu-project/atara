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
   但脚本本身用 `begin` / `commit` 包住了整段内容：中途报错会整体回滚，数据库保持原样，
   修好后重新粘贴即可，不会留下建了一半的 schema。这个保证来自脚本本身，
   不依赖 SQL Editor、psql 或 `supabase db push` 里的任何一种执行方式。
3. 打开 **Authentication → URL Configuration**，把 **Site URL** 设为应用地址
   （本地开发填 `http://localhost:5173`），否则验证邮件里的链接会指向错误地址。

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

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
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
