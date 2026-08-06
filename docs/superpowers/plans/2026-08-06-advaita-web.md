# advaita-web Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个内部运营后台，单账号登录后维护买家/卖家档案，并为双方创建、跟踪 Crypto 或法币订单，数据存 Supabase。

**Architecture:** 纯前端 SPA 直连 Supabase，无自建后端。`features/*/api.ts` 是唯一调用 supabase-js 的层，`hooks.ts` 用 react-query 包装，组件只消费 hook。展示 ID、订单号、状态日志全部由 Postgres trigger 生成，前端不参与。

**Tech Stack:** Vite 7 + React 18 + TypeScript 5 + Tailwind CSS 4 + react-router 7 + @supabase/supabase-js 2 + @tanstack/react-query 5 + react-hook-form 7 + zod 3 + Vitest 3

**Spec:** `docs/superpowers/specs/2026-08-06-advaita-web-design.md`

## Global Constraints

- 项目根目录：`/Users/fengpan/work/advaita/advaita-web`（已存在，已 `git init`，已有 1 个 commit）
- 包管理器：**npm**。不要用 yarn/pnpm。
- 界面文案**全部中文**，不引入 i18n 库。
- 只做浅色模式，不写任何 `dark:` 变体。
- 设计 token 固定值（不得自行调整）：
  - `primary` `#88ff9a`（配黑色文字）/ `primary-hover` `#7af28c`
  - `surface` `rgba(0,0,0,0.02)` / `surface-hover` `rgba(0,0,0,0.04)`
  - `line` `rgba(0,0,0,0.06)`
  - `success` `#00c41f` / `danger` `#f270be` / `accent` `#f25fb7`
  - 圆角：card `28px`、pill `999px`、input `12px`
  - 控件高度：md `44px`、lg `56px`
  - 侧边栏 `249px`、顶栏 `60px`
  - 全局过渡 `transition: all 0.3s ease-in-out`
- zod 固定为 `^3.25.0`（不要升到 v4，本计划使用的是 v3 API）
- **不创建 `tailwind.config.ts`**。Tailwind v4 是 CSS-first 配置，token 全部写在 `src/index.css` 的 `@theme` 块里。这是对 spec §6 文件清单的有意偏离。
- `@theme` 只定义 Tailwind v4 认识的命名空间（`--color-*`、`--radius-*`）。尺寸类（侧边栏宽、顶栏高、控件高）一律用任意值写法 `h-[44px]`、`w-[249px]`，**不要**自造 `--height-*`、`--spacing-sidebar` 这类变量 —— Tailwind v4 不会为它们生成工具类。
- 所有数据库枚举值用英文小写下划线（`pending_payment`），中文只出现在前端 label 映射里
- 每个 task 结束必须 commit，commit message 用 conventional commits 前缀（`feat:` `chore:` `test:` `docs:`）
- 单文件不超过 200 行；超了就拆

---

## File Structure

| 文件 | 职责 |
|---|---|
| `package.json` `vite.config.ts` `tsconfig*.json` `vitest.config.ts` | 构建与测试配置 |
| `src/index.css` | Tailwind v4 `@theme` 设计 token + 全局基础样式 |
| `supabase/migrations/0001_init.sql` | 建表、sequence、trigger、索引、RLS、CHECK |
| `.env.example` `README.md` | Supabase 接入说明 |
| `src/lib/schema.ts` | zod schema + 枚举常量 + TS 类型的唯一来源 |
| `src/lib/format.ts` | 金额/日期/地址格式化 + 中文 label 映射 |
| `src/lib/supabase.ts` | supabase client 单例 |
| `src/lib/queryClient.ts` | react-query 配置 |
| `src/components/ui/*.tsx` | Button Input Select Textarea Field Badge Table Pagination Modal Toast |
| `src/features/auth/*` | session hook、登录页、路由守卫 |
| `src/layouts/AppLayout.tsx` | 侧边栏 + 顶栏 + Outlet |
| `src/features/counterparties/*` | 买卖家 api / hooks / 列表 / 表单 |
| `src/features/orders/*` | 订单 api / hooks / 纯逻辑 / 列表 / 表单 / 详情 / 时间线 |
| `src/routes.tsx` `src/main.tsx` | 路由表与入口 |

---

## Task 1: 项目脚手架与设计 token

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `vitest.config.ts`, `index.html`, `.gitignore`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/vite-env.d.ts`
- Test: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: 无
- Produces: 可运行的 Vite 开发服务器；`npm test` 可跑通 Vitest；Tailwind 中可用 `bg-primary` `text-danger` `border-line` `rounded-card` `transition-base` 等 token 类名

- [ ] **Step 1: 初始化 npm 项目并安装依赖**

在 `/Users/fengpan/work/advaita/advaita-web` 执行：

```bash
npm init -y
npm i react@^18.3.1 react-dom@^18.3.1 react-router@^7.13.1 \
  @supabase/supabase-js@^2.58.0 @tanstack/react-query@^5.90.0 \
  react-hook-form@^7.54.0 @hookform/resolvers@^3.10.0 zod@^3.25.0
npm i -D vite@^7.1.0 @vitejs/plugin-react@^5.0.0 typescript@~5.6.2 \
  @types/react@^18.3.12 @types/react-dom@^18.3.1 @types/node@^22.10.0 \
  tailwindcss@^4.1.0 @tailwindcss/vite@^4.1.0 \
  vitest@^3.0.0 jsdom@^25.0.0 @testing-library/react@^16.1.0 \
  @testing-library/jest-dom@^6.6.0 @testing-library/user-event@^14.5.0
```

- [ ] **Step 2: 写配置文件**

`package.json` 的 `scripts` 与 `type` 字段改成：

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "test": "vitest run",
    "test:watch": "vitest"
  }
}
```

`vite.config.ts`：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
});
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
```

`src/test/setup.ts`：

```ts
import '@testing-library/jest-dom/vitest';
```

`tsconfig.json`：

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noEmit": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "resolveJsonModule": true,
    "types": ["vite/client", "vitest/globals"],
    "baseUrl": ".",
    "paths": { "@/*": ["src/*"] }
  },
  "include": ["src"],
  "references": [{ "path": "./tsconfig.node.json" }]
}
```

`tsconfig.node.json` —— 单独管构建脚本本身（`vite.config.ts` / `vitest.config.ts`）。这两个文件跑在 Node 里、不在 `include: ["src"]` 范围内；没有这个 project reference，它们完全不会被类型检查。`composite: true` 是被 `references` 引用的前提。

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2023"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noEmit": true,
    "composite": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": ["vite.config.ts", "vitest.config.ts"]
}
```

`types: ["node"]` 需要 `@types/node`，已在 Step 1 的 devDependencies 里（若漏装则补 `npm i -D @types/node`）。

`.gitignore` —— `tsconfig.tsbuildinfo` 是 `composite` 项目 `tsc -b` 的增量缓存产物，必须忽略：

```
node_modules
dist
.env
.env.local
*.log
*.tsbuildinfo
.DS_Store
```

`index.html`：

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

`src/vite-env.d.ts`：

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: 写 `src/index.css` 定义设计 token**

Tailwind v4 用 CSS-first 配置，没有 `tailwind.config.ts`。`@theme` 块里每个变量会自动生成对应的工具类。

```css
@import 'tailwindcss';

@theme {
  --color-primary: #88ff9a;
  --color-primary-hover: #7af28c;
  --color-surface: rgba(0, 0, 0, 0.02);
  --color-surface-hover: rgba(0, 0, 0, 0.04);
  --color-line: rgba(0, 0, 0, 0.06);
  --color-line-strong: rgba(0, 0, 0, 0.1);
  --color-success: #00c41f;
  --color-danger: #f270be;
  --color-accent: #f25fb7;
  --color-ink: rgba(0, 0, 0, 1);
  --color-ink-2: rgba(0, 0, 0, 0.8);
  --color-ink-3: rgba(0, 0, 0, 0.6);
  --color-ink-4: rgba(0, 0, 0, 0.4);

  --radius-card: 28px;
  --radius-input: 12px;
  --radius-pill: 999px;
}

@layer base {
  html,
  body,
  #root {
    height: 100%;
  }
  body {
    background: #ffffff;
    color: var(--color-ink);
    font-family:
      -apple-system, BlinkMacSystemFont, 'PingFang SC', 'Microsoft YaHei', 'Segoe UI', sans-serif;
    -webkit-font-smoothing: antialiased;
  }
  button,
  input,
  select,
  textarea {
    font: inherit;
  }
}

@utility transition-base {
  transition: all 0.3s ease-in-out;
}
```

生成规则：`--color-primary` → `bg-primary` / `text-primary` / `border-primary`；`--radius-card` → `rounded-card`。
控件高度、侧边栏宽、顶栏高不进 `@theme`，直接写 `h-[44px]`、`h-[56px]`、`w-[249px]`、`h-[60px]`。

- [ ] **Step 4: 写入口与占位页**

`src/main.tsx`：

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/App.tsx`：

```tsx
export default function App() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="rounded-card bg-surface px-10 py-8">
        <h1 className="text-2xl font-semibold">Advaita 运营后台</h1>
        <p className="mt-2 text-sm text-ink-3">脚手架就绪</p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: 写冒烟测试**

`src/lib/__tests__/smoke.test.ts`：

```ts
import { describe, expect, it } from 'vitest';

describe('测试环境', () => {
  it('可以跑通', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 验证构建、类型检查和测试全部通过**

```bash
npm test
npx tsc -b
npm run build
```

Expected: 测试 1 passed；tsc 无输出（成功）；build 产出 `dist/`。
如果 `npm run dev` 手动跑一下，浏览器应看到白底、圆角灰卡片、「Advaita 运营后台」。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: 初始化 Vite + React + Tailwind 脚手架与设计 token"
```

---

## Task 2: Supabase 数据库 migration 与接入文档

**Files:**
- Create: `supabase/migrations/0001_init.sql`, `.env.example`, `README.md`

**Interfaces:**
- Consumes: 无
- Produces: `counterparties` / `orders` / `order_status_logs` 三张表及其列名 —— 后续所有 `api.ts` 依赖这些列名；环境变量名 `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`

本任务没有自动化测试（SQL 由用户在 Supabase 控制台执行验证）。正确性靠 SQL 里的 CHECK 约束保证。

- [ ] **Step 1: 写 `supabase/migrations/0001_init.sql`**

```sql
-- ============================================================
-- advaita-web 初始化脚本
-- 在 Supabase SQL Editor 中整段执行
-- ============================================================

-- ---------- 通用：updated_at 自动维护 ----------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

-- ============================================================
-- counterparties：买家 / 卖家统一表
-- ============================================================
create sequence if not exists public.counterparty_display_seq start 1;

create table public.counterparties (
  id                     uuid primary key default gen_random_uuid(),
  display_id             text unique not null,
  role                   text not null check (role in ('buyer', 'seller')),

  full_name              text not null,
  id_type                text check (id_type in ('passport', 'id_card', 'driver_license')),
  id_number              text,
  country                text,
  date_of_birth          date,

  email                  text,
  phone                  text,
  telegram               text,
  whatsapp               text,

  bank_name              text,
  bank_account_name      text,
  bank_account_number    text,
  bank_swift             text,
  default_wallet_address text,
  default_wallet_chain   text check (default_wallet_chain in ('TRON','ETH','BSC','SOL','BTC','POLYGON')),

  note                   text,
  tags                   text[] not null default '{}',

  created_by             uuid default auth.uid(),
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create or replace function public.set_counterparty_display_id()
returns trigger language plpgsql as $$
begin
  if new.display_id is null or new.display_id = '' then
    new.display_id := 'U' || lpad(nextval('public.counterparty_display_seq')::text, 6, '0');
  end if;
  return new;
end;
$$;

create trigger trg_counterparty_display_id
  before insert on public.counterparties
  for each row execute function public.set_counterparty_display_id();

create trigger trg_counterparty_touch
  before update on public.counterparties
  for each row execute function public.touch_updated_at();

create index idx_counterparties_role       on public.counterparties (role);
create index idx_counterparties_full_name  on public.counterparties (full_name);
create index idx_counterparties_created_at on public.counterparties (created_at desc);

-- ============================================================
-- orders
-- ============================================================
create table public.order_no_counters (
  day date primary key,
  seq int not null default 0
);

create table public.orders (
  id                  uuid primary key default gen_random_uuid(),
  order_no            text unique not null,

  buyer_id            uuid not null references public.counterparties (id) on delete restrict,
  seller_id           uuid not null references public.counterparties (id) on delete restrict,

  order_type          text not null check (order_type in ('crypto', 'fiat')),
  status              text not null default 'pending_payment'
                        check (status in ('pending_payment', 'paid', 'completed', 'cancelled')),
  amount              numeric(38, 8) not null check (amount > 0),
  payee               text not null check (payee in ('buyer', 'seller')),

  -- crypto
  asset               text,
  chain               text check (chain in ('TRON','ETH','BSC','SOL','BTC','POLYGON')),
  receiving_address   text,

  -- fiat
  fiat_currency       text,
  bank_name           text,
  bank_account_name   text,
  bank_account_number text,
  bank_swift          text,

  note                text,
  created_by          uuid default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_parties_differ check (buyer_id <> seller_id),
  constraint orders_type_fields check (
    (order_type = 'crypto'
      and asset is not null
      and chain is not null
      and receiving_address is not null
      and fiat_currency is null)
    or
    (order_type = 'fiat'
      and fiat_currency is not null
      and bank_account_number is not null
      and asset is null
      and chain is null
      and receiving_address is null)
  )
);

create or replace function public.set_order_no()
returns trigger language plpgsql as $$
declare
  d date := (now() at time zone 'utc')::date;
  n int;
begin
  if new.order_no is null or new.order_no = '' then
    insert into public.order_no_counters (day, seq)
      values (d, 1)
      on conflict (day) do update set seq = public.order_no_counters.seq + 1
      returning seq into n;
    new.order_no := 'ORD' || to_char(d, 'YYYYMMDD') || '-' || lpad(n::text, 4, '0');
  end if;
  return new;
end;
$$;

create trigger trg_order_no
  before insert on public.orders
  for each row execute function public.set_order_no();

create trigger trg_order_touch
  before update on public.orders
  for each row execute function public.touch_updated_at();

create index idx_orders_buyer      on public.orders (buyer_id);
create index idx_orders_seller     on public.orders (seller_id);
create index idx_orders_status     on public.orders (status);
create index idx_orders_type       on public.orders (order_type);
create index idx_orders_created_at on public.orders (created_at desc);

-- ============================================================
-- order_status_logs
-- ============================================================
create table public.order_status_logs (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references public.orders (id) on delete cascade,
  from_status text,
  to_status   text not null,
  changed_by  uuid default auth.uid(),
  created_at  timestamptz not null default now()
);

create index idx_order_status_logs_order on public.order_status_logs (order_id, created_at);

create or replace function public.log_order_status()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    insert into public.order_status_logs (order_id, from_status, to_status, changed_by)
      values (new.id, null, new.status, auth.uid());
  elsif new.status is distinct from old.status then
    insert into public.order_status_logs (order_id, from_status, to_status, changed_by)
      values (new.id, old.status, new.status, auth.uid());
  end if;
  return new;
end;
$$;

create trigger trg_order_status_log_insert
  after insert on public.orders
  for each row execute function public.log_order_status();

create trigger trg_order_status_log_update
  after update of status on public.orders
  for each row execute function public.log_order_status();

-- ============================================================
-- RLS：登录用户可全量读写（账号由管理员手工创建，不开放注册）
-- ============================================================
alter table public.counterparties    enable row level security;
alter table public.orders            enable row level security;
alter table public.order_status_logs enable row level security;

create policy "authenticated full access" on public.counterparties
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on public.orders
  for all to authenticated using (true) with check (true);

create policy "authenticated read" on public.order_status_logs
  for select to authenticated using (true);
```

注意 `order_status_logs` 只给 SELECT 策略 —— 写入由 trigger（`security invoker` 默认，但 trigger 内的 insert 会绕过 RLS 吗？不会）完成。因此需要额外给 trigger 函数加 `security definer`。修正：把 `log_order_status` 的定义改成带 `security definer`：

```sql
create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public as $$
```

（写 SQL 时直接用这个带 `security definer` 的版本，上面的完整脚本里把那一行替换掉。）

- [ ] **Step 2: 写 `.env.example`**

```
# Supabase 项目设置 → API 页面获取
VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

- [ ] **Step 3: 写 `README.md`**

````markdown
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
   执行成功后在 **Table Editor** 应能看到 `counterparties`、`orders`、`order_status_logs` 三张表。
3. 打开 **Authentication → Providers → Email**，把 **Enable Sign Ups** 关掉（本项目不开放注册）；
   再到 **Authentication → Users → Add user**，手工创建登录账号（勾选 Auto Confirm User）。
4. 打开 **Project Settings → API**，复制 `Project URL` 和 `anon public` key，
   填进项目根目录的 `.env`：

   ```
   VITE_SUPABASE_URL=<Project URL>
   VITE_SUPABASE_ANON_KEY=<anon public key>
   ```

## 脚本

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发服务器 |
| `npm run build` | 类型检查 + 生产构建 |
| `npm test` | 跑 Vitest |

## 文档

- 设计文档：`docs/superpowers/specs/2026-08-06-advaita-web-design.md`
- 实施计划：`docs/superpowers/plans/2026-08-06-advaita-web.md`
````

- [ ] **Step 4: 验证 SQL 语法**

本地没有 Postgres 时，逐行人工核对：所有 `create table` 有对应的 `);`，所有函数体用 `$$` 成对包裹，所有 `create trigger` 引用的函数已在其之前定义。

如果本机有 psql 和 docker，可选验证：

```bash
docker run --rm -d --name pgcheck -e POSTGRES_PASSWORD=x -p 55432:5432 postgres:16
sleep 5
psql "postgres://postgres:x@localhost:55432/postgres" -c "create schema if not exists auth; create or replace function auth.uid() returns uuid language sql as 'select null::uuid';"
psql "postgres://postgres:x@localhost:55432/postgres" -f supabase/migrations/0001_init.sql
docker rm -f pgcheck
```

Expected: 无 ERROR 输出（`create policy ... to authenticated` 会因缺少 authenticated role 报错，可先 `create role authenticated;`）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat: Supabase 建表 migration 与接入文档"
```

---

## Task 3: zod schema 与格式化工具（TDD）

**Files:**
- Create: `src/lib/schema.ts`, `src/lib/format.ts`
- Test: `src/lib/__tests__/schema.test.ts`, `src/lib/__tests__/format.test.ts`
- Delete: `src/lib/__tests__/smoke.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - 常量：`ROLES` `ID_TYPES` `CHAINS` `ASSETS` `FIAT_CURRENCIES` `ORDER_TYPES` `ORDER_STATUSES` `PAYEES`
  - schema：`counterpartySchema`、`orderSchema`、`cryptoOrderSchema`、`fiatOrderSchema`
  - 类型：`Role` `IdType` `Chain` `Asset` `FiatCurrency` `OrderType` `OrderStatus` `Payee` `CounterpartyInput` `OrderInput` `Counterparty` `Order` `OrderStatusLog`
  - 格式化：`formatAmount(v, dp?)` `formatDateTime(iso)` `formatDate(iso)` `shortenAddress(addr)`
  - label 映射：`ROLE_LABEL` `ID_TYPE_LABEL` `ORDER_TYPE_LABEL` `ORDER_STATUS_LABEL` `PAYEE_LABEL`

- [ ] **Step 1: 写失败的 schema 测试**

`src/lib/__tests__/schema.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { counterpartySchema, orderSchema } from '@/lib/schema';

const buyerId = '11111111-1111-4111-8111-111111111111';
const sellerId = '22222222-2222-4222-8222-222222222222';

describe('counterpartySchema', () => {
  it('姓名为空时报错', () => {
    const r = counterpartySchema.safeParse({ role: 'buyer', full_name: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('请填写姓名');
  });

  it('只填姓名和角色即可通过', () => {
    const r = counterpartySchema.safeParse({ role: 'seller', full_name: '张三' });
    expect(r.success).toBe(true);
  });

  it('空字符串的选填字段归一为 undefined', () => {
    const r = counterpartySchema.parse({ role: 'buyer', full_name: '张三', email: '', phone: '' });
    expect(r.email).toBeUndefined();
    expect(r.phone).toBeUndefined();
  });

  it('邮箱格式非法时报错', () => {
    const r = counterpartySchema.safeParse({ role: 'buyer', full_name: '张三', email: 'not-an-email' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('邮箱格式不正确');
  });

  it('出生日期晚于今天时报错', () => {
    const r = counterpartySchema.safeParse({ role: 'buyer', full_name: '张三', date_of_birth: '2999-01-01' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('出生日期不能晚于今天');
  });

  it('tags 缺省为空数组', () => {
    expect(counterpartySchema.parse({ role: 'buyer', full_name: '张三' }).tags).toEqual([]);
  });
});

describe('orderSchema - crypto', () => {
  const base = {
    order_type: 'crypto' as const,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: 100,
    payee: 'buyer' as const,
    asset: 'USDT' as const,
    chain: 'TRON' as const,
    receiving_address: 'TXk...abc',
  };

  it('完整的 crypto 订单通过', () => {
    expect(orderSchema.safeParse(base).success).toBe(true);
  });

  it('缺收款地址时报错', () => {
    const r = orderSchema.safeParse({ ...base, receiving_address: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('请填写收款地址');
  });

  it('金额为 0 时报错', () => {
    const r = orderSchema.safeParse({ ...base, amount: 0 });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('金额必须大于 0');
  });

  it('金额字符串会被转成数字', () => {
    const r = orderSchema.parse({ ...base, amount: '250.5' });
    expect(r.amount).toBe(250.5);
  });

  it('买卖家为同一人时报错', () => {
    const r = orderSchema.safeParse({ ...base, seller_id: buyerId });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('买家和卖家不能是同一人');
    expect(r.error?.issues[0].path).toEqual(['seller_id']);
  });
});

describe('orderSchema - fiat', () => {
  const base = {
    order_type: 'fiat' as const,
    buyer_id: buyerId,
    seller_id: sellerId,
    amount: 8000,
    payee: 'seller' as const,
    fiat_currency: 'USD' as const,
    bank_account_number: '6222 0000 1111 2222',
  };

  it('完整的法币订单通过', () => {
    expect(orderSchema.safeParse(base).success).toBe(true);
  });

  it('缺收款账号时报错', () => {
    const r = orderSchema.safeParse({ ...base, bank_account_number: '' });
    expect(r.success).toBe(false);
    expect(r.error?.issues[0].message).toBe('请填写收款账号');
  });

  it('法币订单不接受 crypto 字段的必填校验', () => {
    // 只要不带 asset/chain 也能过，说明分支判定正确
    expect(orderSchema.safeParse({ ...base }).success).toBe(true);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- schema`
Expected: FAIL，报 `Failed to resolve import "@/lib/schema"`。

- [ ] **Step 3: 实现 `src/lib/schema.ts`**

```ts
import { z } from 'zod';

// ---------------- 枚举常量 ----------------
export const ROLES = ['buyer', 'seller'] as const;
export const ID_TYPES = ['passport', 'id_card', 'driver_license'] as const;
export const CHAINS = ['TRON', 'ETH', 'BSC', 'SOL', 'BTC', 'POLYGON'] as const;
export const ASSETS = ['USDT', 'USDC', 'BTC', 'ETH', 'TRX', 'BNB'] as const;
export const FIAT_CURRENCIES = ['USD', 'EUR', 'INR', 'GBP', 'AED', 'HKD', 'CNY'] as const;
export const ORDER_TYPES = ['crypto', 'fiat'] as const;
export const ORDER_STATUSES = ['pending_payment', 'paid', 'completed', 'cancelled'] as const;
export const PAYEES = ['buyer', 'seller'] as const;

export type Role = (typeof ROLES)[number];
export type IdType = (typeof ID_TYPES)[number];
export type Chain = (typeof CHAINS)[number];
export type Asset = (typeof ASSETS)[number];
export type FiatCurrency = (typeof FIAT_CURRENCIES)[number];
export type OrderType = (typeof ORDER_TYPES)[number];
export type OrderStatus = (typeof ORDER_STATUSES)[number];
export type Payee = (typeof PAYEES)[number];

// ---------------- 选填字段辅助 ----------------
const blankToUndefined = (v: unknown) => (v === '' || v === null ? undefined : v);
const optText = z.preprocess(blankToUndefined, z.string().trim().max(200).optional());
const optLongText = z.preprocess(blankToUndefined, z.string().trim().max(2000).optional());
const optEnum = <T extends readonly [string, ...string[]]>(values: T) =>
  z.preprocess(blankToUndefined, z.enum(values).optional());

// ---------------- counterparty ----------------
export const counterpartySchema = z.object({
  role: z.enum(ROLES),
  full_name: z.string().trim().min(1, '请填写姓名').max(200),

  id_type: optEnum(ID_TYPES),
  id_number: optText,
  country: optText,
  date_of_birth: z.preprocess(
    blankToUndefined,
    z
      .string()
      .refine((v) => !Number.isNaN(Date.parse(v)), '日期格式不正确')
      .refine((v) => new Date(v) <= new Date(), '出生日期不能晚于今天')
      .optional(),
  ),

  email: z.preprocess(blankToUndefined, z.string().email('邮箱格式不正确').optional()),
  phone: optText,
  telegram: optText,
  whatsapp: optText,

  bank_name: optText,
  bank_account_name: optText,
  bank_account_number: optText,
  bank_swift: optText,
  default_wallet_address: optText,
  default_wallet_chain: optEnum(CHAINS),

  note: optLongText,
  tags: z.array(z.string()).default([]),
});

export type CounterpartyInput = z.infer<typeof counterpartySchema>;

// ---------------- order ----------------
const orderBase = {
  buyer_id: z.string().uuid('请选择买家'),
  seller_id: z.string().uuid('请选择卖家'),
  amount: z.coerce.number().positive('金额必须大于 0'),
  payee: z.enum(PAYEES),
  note: optLongText,
};

export const cryptoOrderSchema = z.object({
  ...orderBase,
  order_type: z.literal('crypto'),
  asset: z.enum(ASSETS),
  chain: z.enum(CHAINS),
  receiving_address: z.string().trim().min(1, '请填写收款地址'),
});

export const fiatOrderSchema = z.object({
  ...orderBase,
  order_type: z.literal('fiat'),
  fiat_currency: z.enum(FIAT_CURRENCIES),
  bank_account_number: z.string().trim().min(1, '请填写收款账号'),
  bank_name: optText,
  bank_account_name: optText,
  bank_swift: optText,
});

export const orderSchema = z
  .discriminatedUnion('order_type', [cryptoOrderSchema, fiatOrderSchema])
  .refine((d) => d.buyer_id !== d.seller_id, {
    message: '买家和卖家不能是同一人',
    path: ['seller_id'],
  });

export type OrderInput = z.infer<typeof orderSchema>;

// ---------------- DB 行类型 ----------------
// 注意：选填列在 Postgres 里是 null，不是 undefined。这里必须如实写 `| null`，
// 否则回填表单时会把 null 塞进 <input value>，React 会报 uncontrolled 警告。
export interface Counterparty {
  id: string;
  display_id: string;
  role: Role;
  full_name: string;
  id_type: IdType | null;
  id_number: string | null;
  country: string | null;
  date_of_birth: string | null;
  email: string | null;
  phone: string | null;
  telegram: string | null;
  whatsapp: string | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_swift: string | null;
  default_wallet_address: string | null;
  default_wallet_chain: Chain | null;
  note: string | null;
  tags: string[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Order {
  id: string;
  order_no: string;
  buyer_id: string;
  seller_id: string;
  order_type: OrderType;
  status: OrderStatus;
  amount: string;
  payee: Payee;
  asset: Asset | null;
  chain: Chain | null;
  receiving_address: string | null;
  fiat_currency: FiatCurrency | null;
  bank_name: string | null;
  bank_account_name: string | null;
  bank_account_number: string | null;
  bank_swift: string | null;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

/** 列表/详情查询带出的关联方摘要 */
export interface OrderWithParties extends Order {
  buyer: Pick<Counterparty, 'id' | 'display_id' | 'full_name'> | null;
  seller: Pick<Counterparty, 'id' | 'display_id' | 'full_name'> | null;
}

export interface OrderStatusLog {
  id: string;
  order_id: string;
  from_status: OrderStatus | null;
  to_status: OrderStatus;
  changed_by: string | null;
  created_at: string;
}
```

`amount` 在 `Order` 里是 `string`：Postgres `numeric` 经 PostgREST 返回的是字符串，避免精度丢失。展示时走 `formatAmount`。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- schema`
Expected: PASS，17 个用例全绿。

- [ ] **Step 5: 写失败的 format 测试**

`src/lib/__tests__/format.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  formatAmount,
  formatDate,
  formatDateTime,
  shortenAddress,
} from '@/lib/format';

describe('formatAmount', () => {
  it('字符串金额按千分位展示', () => {
    expect(formatAmount('1234567.5')).toBe('1,234,567.50');
  });
  it('可指定小数位', () => {
    expect(formatAmount('0.12345678', 8)).toBe('0.12345678');
  });
  it('空值返回短横线', () => {
    expect(formatAmount(null)).toBe('-');
    expect(formatAmount('')).toBe('-');
  });
});

describe('formatDateTime / formatDate', () => {
  it('格式化 ISO 时间', () => {
    expect(formatDateTime('2026-08-06T03:04:05Z')).toMatch(/^2026-08-06 \d{2}:\d{2}$/);
  });
  it('只取日期部分', () => {
    expect(formatDate('2026-08-06T03:04:05Z')).toBe('2026-08-06');
  });
  it('空值返回短横线', () => {
    expect(formatDateTime(null)).toBe('-');
  });
});

describe('shortenAddress', () => {
  it('长地址中间省略', () => {
    expect(shortenAddress('TXkabcdefghijklmnopqrstuvwxyz1234')).toBe('TXkabc...1234');
  });
  it('短地址原样返回', () => {
    expect(shortenAddress('TXk123')).toBe('TXk123');
  });
  it('空值返回短横线', () => {
    expect(shortenAddress(null)).toBe('-');
  });
});

describe('label 映射', () => {
  it('订单状态有全部四个中文 label', () => {
    expect(ORDER_STATUS_LABEL.pending_payment).toBe('待付款');
    expect(ORDER_STATUS_LABEL.paid).toBe('已付款');
    expect(ORDER_STATUS_LABEL.completed).toBe('已完成');
    expect(ORDER_STATUS_LABEL.cancelled).toBe('已取消');
  });
  it('订单类型 label', () => {
    expect(ORDER_TYPE_LABEL.crypto).toBe('Crypto');
    expect(ORDER_TYPE_LABEL.fiat).toBe('法币');
  });
});
```

- [ ] **Step 6: 运行测试确认失败**

Run: `npm test -- format`
Expected: FAIL，`Failed to resolve import "@/lib/format"`。

- [ ] **Step 7: 实现 `src/lib/format.ts`**

```ts
import type { IdType, OrderStatus, OrderType, Payee, Role } from '@/lib/schema';

const DASH = '-';

export function formatAmount(value: string | number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || value === '') return DASH;
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return DASH;
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function shortenAddress(addr: string | null | undefined, head = 6, tail = 4): string {
  if (!addr) return DASH;
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export const ROLE_LABEL: Record<Role, string> = {
  buyer: '买家',
  seller: '卖家',
};

export const ID_TYPE_LABEL: Record<IdType, string> = {
  passport: '护照',
  id_card: '身份证',
  driver_license: '驾照',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  crypto: 'Crypto',
  fiat: '法币',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  completed: '已完成',
  cancelled: '已取消',
};

export const PAYEE_LABEL: Record<Payee, string> = {
  buyer: '买家',
  seller: '卖家',
};
```

注意 `formatDateTime` 用本地时区，测试里用正则匹配小时分钟就是为了不依赖 CI 时区。

- [ ] **Step 8: 删除冒烟测试并跑全量**

```bash
rm src/lib/__tests__/smoke.test.ts
npm test
npx tsc -b
```

Expected: 全部 PASS，tsc 无错误。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: zod schema 与格式化工具"
```

---

## Task 4: Supabase client、登录与路由守卫

**Files:**
- Create: `src/lib/supabase.ts`, `src/lib/queryClient.ts`, `src/lib/errors.ts`, `src/features/auth/useSession.ts`, `src/features/auth/LoginPage.tsx`, `src/features/auth/RequireAuth.tsx`, `src/routes.tsx`
- Modify: `src/App.tsx`, `src/main.tsx`
- Test: `src/lib/__tests__/errors.test.ts`

**Interfaces:**
- Consumes: 无
- Produces:
  - `supabase`（`SupabaseClient` 单例）
  - `queryClient`（`QueryClient` 实例）
  - `toFriendlyError(error: unknown): Error` —— 所有 `api.ts` 用它包装 supabase 错误
  - `useSession(): { session: Session | null; loading: boolean }`
  - `<RequireAuth>`（路由包装组件）
  - `router`（从 `src/routes.tsx` 默认导出）

- [ ] **Step 1: 写失败的错误映射测试**

`src/lib/__tests__/errors.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { toFriendlyError } from '@/lib/errors';

describe('toFriendlyError', () => {
  it('唯一约束冲突给出重试提示', () => {
    expect(toFriendlyError({ code: '23505', message: 'duplicate key' }).message).toBe(
      '数据重复，请重试',
    );
  });

  it('CHECK 约束冲突提示字段有误', () => {
    expect(toFriendlyError({ code: '23514', message: 'violates check constraint' }).message).toBe(
      '填写的内容不符合规则，请检查后重试',
    );
  });

  it('外键约束冲突提示被引用', () => {
    expect(toFriendlyError({ code: '23503', message: 'fk' }).message).toBe(
      '该记录已被订单引用，无法删除',
    );
  });

  it('登录凭证错误', () => {
    expect(toFriendlyError({ message: 'Invalid login credentials' }).message).toBe('邮箱或密码不正确');
  });

  it('未知错误保留原始 message', () => {
    expect(toFriendlyError({ message: 'boom' }).message).toBe('boom');
  });

  it('完全无法识别时给兜底文案', () => {
    expect(toFriendlyError(null).message).toBe('操作失败，请稍后重试');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- errors`
Expected: FAIL，`Failed to resolve import "@/lib/errors"`。

- [ ] **Step 3: 实现 `src/lib/errors.ts`**

```ts
const PG_CODE_MESSAGES: Record<string, string> = {
  '23505': '数据重复，请重试',
  '23514': '填写的内容不符合规则，请检查后重试',
  '23503': '该记录已被订单引用，无法删除',
};

const MESSAGE_MAP: Array<[RegExp, string]> = [
  [/Invalid login credentials/i, '邮箱或密码不正确'],
  [/Email not confirmed/i, '账号尚未激活，请联系管理员'],
  [/Failed to fetch|NetworkError/i, '网络异常，请检查网络后重试'],
  [/JWT expired|token is expired/i, '登录已过期，请重新登录'],
];

export function toFriendlyError(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error('操作失败，请稍后重试');

  const e = error as { code?: string; message?: string };

  if (e.code && PG_CODE_MESSAGES[e.code]) return new Error(PG_CODE_MESSAGES[e.code]);

  if (e.message) {
    for (const [pattern, text] of MESSAGE_MAP) {
      if (pattern.test(e.message)) return new Error(text);
    }
    return new Error(e.message);
  }

  return new Error('操作失败，请稍后重试');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- errors`
Expected: PASS，6 个用例。

- [ ] **Step 5: 实现 supabase client 与 queryClient**

`src/lib/supabase.ts`：

```ts
import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error('缺少 VITE_SUPABASE_URL 或 VITE_SUPABASE_ANON_KEY，请检查 .env 文件');
}

export const supabase = createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
});
```

`src/lib/queryClient.ts`：

```ts
import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 30_000,
    },
    mutations: { retry: 0 },
  },
});
```

- [ ] **Step 6: 实现 session hook**

`src/features/auth/useSession.ts`：

```ts
import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { queryClient } from '@/lib/queryClient';

export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === 'SIGNED_OUT') queryClient.clear();
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading };
}

export async function signIn(email: string, password: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
}
```

- [ ] **Step 7: 实现登录页**

`src/features/auth/LoginPage.tsx`。设计对齐 velafi 登录页：居中 475px 卡片，`rounded-card`、`bg-surface`、34px 内边距、56px 输入框、胶囊主按钮。

```tsx
import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router';
import { signIn, useSession } from './useSession';
import { toFriendlyError } from '@/lib/errors';

export default function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/orders" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await signIn(email.trim(), password);
      navigate('/orders', { replace: true });
    } catch (err) {
      setError(toFriendlyError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="rounded-card bg-surface w-[475px] max-w-full p-[34px]">
        <h1 className="mb-[30px] text-center text-[30px] leading-[38px] font-semibold">登录</h1>

        <input
          className="rounded-input border-line-strong transition-base h-[56px] w-full border bg-white px-4 outline-none focus:border-black"
          type="email"
          autoComplete="username"
          placeholder="请输入邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <input
          className="rounded-input border-line-strong transition-base mt-4 h-[56px] w-full border bg-white px-4 outline-none focus:border-black"
          type="password"
          autoComplete="current-password"
          placeholder="请输入密码"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        <p className="text-danger min-h-[34px] px-2 py-[10px] text-xs">{error}</p>

        <button
          type="submit"
          disabled={!email || !password || submitting}
          className="rounded-pill bg-primary hover:bg-primary-hover transition-base h-[56px] w-full text-base font-semibold text-black disabled:cursor-not-allowed disabled:bg-[#d3fcd9] disabled:text-black/30"
        >
          {submitting ? '登录中...' : '登录'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 8: 实现路由守卫与路由表**

`src/features/auth/RequireAuth.tsx`：

```tsx
import { Navigate, Outlet } from 'react-router';
import { useSession } from './useSession';

export default function RequireAuth() {
  const { session, loading } = useSession();

  if (loading) {
    return <div className="text-ink-4 flex h-full items-center justify-center text-sm">加载中...</div>;
  }
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
```

`src/routes.tsx`（本任务先只挂登录页和一个占位首页，Task 6 会补齐全部业务路由）：

```tsx
import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RequireAuth from '@/features/auth/RequireAuth';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      { path: '/', element: <Navigate to="/orders" replace /> },
      { path: '/orders', element: <div className="p-10">订单页占位</div> },
    ],
  },
  { path: '*', element: <Navigate to="/orders" replace /> },
]);

export default router;
```

`src/App.tsx` 改为：

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { queryClient } from '@/lib/queryClient';
import router from '@/routes';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

- [ ] **Step 9: 验证**

```bash
npm test
npx tsc -b
```

Expected: 全绿。

手动验证（需要 `.env` 已配好真实 Supabase）：`npm run dev` → 访问 `/orders` 应被重定向到 `/login`；输错密码应显示「邮箱或密码不正确」；输对后跳到 `/orders` 占位页。若 `.env` 未配，页面会抛「缺少 VITE_SUPABASE_URL...」，属预期。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: Supabase client、邮箱密码登录与路由守卫"
```

---

## Task 5: UI 基础组件库

**Files:**
- Create: `src/components/ui/Button.tsx`, `Input.tsx`, `Select.tsx`, `Textarea.tsx`, `Field.tsx`, `FormSection.tsx`, `Badge.tsx`, `Table.tsx`, `Pagination.tsx`, `Modal.tsx`, `Toast.tsx`, `cn.ts`, `index.ts`
- Test: `src/components/ui/__tests__/Button.test.tsx`, `src/components/ui/__tests__/Pagination.test.tsx`

**Interfaces:**
- Consumes: 无
- Produces（后续所有页面从 `@/components/ui` 导入）：
  - `<Button variant?: 'primary'|'second'|'third'|'text' size?: 'md'|'lg' loading?: boolean>`
  - `<Input>`（原生 input props + `invalid?: boolean`）
  - `<Select options={{value,label}[]} placeholder?>`（原生 select props + `invalid?`）
  - `<Textarea>`（原生 textarea props + `invalid?`）
  - `<Field label required? error? hint?>{children}</Field>`
  - `<FormSection title>{children}</FormSection>` —— 表单分组容器（两列网格），Task 8/10 共用
  - `<Badge tone: 'neutral'|'accent'|'success'|'outline'>`
  - `<Table columns={Column<T>[]} rows={T[]} rowKey={(r)=>string} onRowClick?={(r)=>void} empty?: ReactNode>`，`Column<T> = { key: string; title: string; render: (row: T) => ReactNode; width?: string }`
  - `<Pagination page total pageSize onChange />`
  - `<Modal open title onClose>{children}</Modal>`
  - `<ToastProvider>` + `useToast(): { success(msg): void; error(msg): void }`

- [ ] **Step 1: 写 `cn.ts` 与失败的 Button 测试**

`src/components/ui/cn.ts`：

```ts
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(' ');
}
```

`src/components/ui/__tests__/Button.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Button from '@/components/ui/Button';

describe('Button', () => {
  it('渲染文字并响应点击', async () => {
    const onClick = vi.fn();
    render(<Button onClick={onClick}>保存</Button>);
    await userEvent.click(screen.getByRole('button', { name: '保存' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('loading 时禁用且不触发点击', async () => {
    const onClick = vi.fn();
    render(
      <Button loading onClick={onClick}>
        保存
      </Button>,
    );
    const btn = screen.getByRole('button');
    expect(btn).toBeDisabled();
    await userEvent.click(btn);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('disabled 时禁用', () => {
    render(<Button disabled>保存</Button>);
    expect(screen.getByRole('button')).toBeDisabled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- Button`
Expected: FAIL，`Failed to resolve import "@/components/ui/Button"`。

- [ ] **Step 3: 实现 Button**

`src/components/ui/Button.tsx`：

```tsx
import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

type Variant = 'primary' | 'second' | 'third' | 'text';
type Size = 'md' | 'lg';

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children'> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  block?: boolean;
  children: ReactNode;
}

const VARIANT: Record<Variant, string> = {
  primary: 'bg-primary text-black hover:bg-primary-hover disabled:bg-[#d3fcd9] disabled:text-black/30',
  second:
    'bg-white text-black border border-line-strong hover:bg-[#e5e5e5] disabled:text-black/30 disabled:hover:bg-white',
  third: 'bg-black text-white hover:bg-black/60 disabled:bg-black/30',
  text: 'text-success hover:opacity-60 disabled:text-black/30',
};

const SIZE: Record<Size, string> = {
  md: 'h-[44px] px-6 text-sm',
  lg: 'h-[56px] px-8 text-base',
};

export default function Button({
  variant = 'primary',
  size = 'md',
  loading = false,
  block = false,
  disabled,
  className,
  children,
  ...rest
}: Props) {
  return (
    <button
      {...rest}
      disabled={disabled || loading}
      className={cn(
        'rounded-pill transition-base inline-flex items-center justify-center font-semibold disabled:cursor-not-allowed',
        VARIANT[variant],
        SIZE[size],
        block && 'w-full',
        className,
      )}
    >
      {loading ? '处理中...' : children}
    </button>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- Button`
Expected: PASS，3 个用例。

- [ ] **Step 5: 实现表单类组件**

`src/components/ui/Input.tsx`：

```tsx
import { forwardRef, type InputHTMLAttributes } from 'react';
import { cn } from './cn';

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

const Input = forwardRef<HTMLInputElement, Props>(function Input({ invalid, className, ...rest }, ref) {
  return (
    <input
      ref={ref}
      {...rest}
      className={cn(
        'rounded-input transition-base h-[44px] w-full border bg-white px-4 text-sm outline-none placeholder:text-black/30',
        invalid ? 'border-danger' : 'border-line-strong focus:border-black',
        className,
      )}
    />
  );
});

export default Input;
```

`src/components/ui/Select.tsx`：

```tsx
import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cn } from './cn';

export interface Option {
  value: string;
  label: string;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  options: Option[];
  placeholder?: string;
  invalid?: boolean;
}

const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { options, placeholder, invalid, className, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      {...rest}
      className={cn(
        'rounded-input transition-base h-[44px] w-full border bg-white px-4 text-sm outline-none',
        invalid ? 'border-danger' : 'border-line-strong focus:border-black',
        className,
      )}
    >
      {placeholder ? <option value="">{placeholder}</option> : null}
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
});

export default Select;
```

`src/components/ui/Textarea.tsx`：

```tsx
import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cn } from './cn';

interface Props extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = forwardRef<HTMLTextAreaElement, Props>(function Textarea(
  { invalid, className, ...rest },
  ref,
) {
  return (
    <textarea
      ref={ref}
      rows={3}
      {...rest}
      className={cn(
        'rounded-input transition-base w-full border bg-white px-4 py-3 text-sm outline-none placeholder:text-black/30',
        invalid ? 'border-danger' : 'border-line-strong focus:border-black',
        className,
      )}
    />
  );
});

export default Textarea;
```

`src/components/ui/FormSection.tsx`（Task 8 的档案表单和 Task 10 的订单表单都用它做分组容器，放在这里避免两处重复）：

```tsx
import type { ReactNode } from 'react';

export default function FormSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-card bg-surface mb-5 p-6">
      <h2 className="mb-5 text-sm font-semibold">{title}</h2>
      <div className="grid grid-cols-2 gap-x-5 gap-y-4">{children}</div>
    </section>
  );
}
```

`src/components/ui/Field.tsx`：

```tsx
import type { ReactNode } from 'react';

interface Props {
  label: string;
  required?: boolean;
  error?: string;
  hint?: string;
  children: ReactNode;
}

export default function Field({ label, required, error, hint, children }: Props) {
  return (
    <label className="block">
      <span className="mb-2 block text-xs text-black/50">
        {label}
        {required ? <span className="text-danger ml-1">*</span> : null}
      </span>
      {children}
      {error ? <p className="text-danger mt-1.5 px-2 text-xs">{error}</p> : null}
      {!error && hint ? <p className="text-ink-4 mt-1.5 px-2 text-xs">{hint}</p> : null}
    </label>
  );
}
```

- [ ] **Step 6: 实现展示类组件**

`src/components/ui/Badge.tsx`：

```tsx
import type { ReactNode } from 'react';
import { cn } from './cn';

type Tone = 'neutral' | 'accent' | 'success' | 'outline';

const TONE: Record<Tone, string> = {
  neutral: 'bg-black/6 text-black/60',
  accent: 'bg-accent text-white',
  success: 'bg-success text-white',
  outline: 'border border-line-strong text-black/40',
};

export default function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={cn('rounded-pill inline-flex h-6 items-center px-3 text-xs font-semibold', TONE[tone])}>
      {children}
    </span>
  );
}
```

`src/components/ui/Table.tsx`：

```tsx
import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  title: string;
  width?: string;
  render: (row: T) => ReactNode;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  loading?: boolean;
  empty?: ReactNode;
}

export default function Table<T>({ columns, rows, rowKey, onRowClick, loading, empty }: Props<T>) {
  if (loading) {
    return <div className="text-ink-4 py-20 text-center text-sm">加载中...</div>;
  }
  if (rows.length === 0) {
    return <div className="text-ink-4 py-20 text-center text-sm">{empty ?? '暂无数据'}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[1100px] border-collapse text-sm">
        <thead>
          <tr className="border-line border-b">
            {columns.map((c) => (
              <th
                key={c.key}
                style={{ width: c.width }}
                className="px-4 py-3 text-left text-xs font-semibold text-black/50"
              >
                {c.title}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={rowKey(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={
                onRowClick
                  ? 'border-line hover:bg-surface-hover transition-base cursor-pointer border-b'
                  : 'border-line border-b'
              }
            >
              {columns.map((c) => (
                <td key={c.key} className="px-4 py-4">
                  {c.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

`src/components/ui/Modal.tsx`：

```tsx
import type { ReactNode } from 'react';

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function Modal({ open, title, onClose, children }: Props) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div
        className="rounded-card max-h-[80vh] w-[440px] max-w-full overflow-auto bg-white p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="mb-5 text-lg font-semibold">{title}</h3>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 7: 写失败的 Pagination 测试**

`src/components/ui/__tests__/Pagination.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Pagination from '@/components/ui/Pagination';

describe('Pagination', () => {
  it('展示总数与当前页', () => {
    render(<Pagination page={2} total={45} pageSize={20} onChange={vi.fn()} />);
    expect(screen.getByText('共 45 条')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('第一页时上一页禁用', () => {
    render(<Pagination page={1} total={45} pageSize={20} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  });

  it('最后一页时下一页禁用', () => {
    render(<Pagination page={3} total={45} pageSize={20} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('点下一页回调页码 +1', async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} total={45} pageSize={20} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('总数为 0 时不渲染', () => {
    const { container } = render(<Pagination page={1} total={0} pageSize={20} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
```

- [ ] **Step 8: 运行测试确认失败**

Run: `npm test -- Pagination`
Expected: FAIL，模块不存在。

- [ ] **Step 9: 实现 Pagination**

`src/components/ui/Pagination.tsx`：

```tsx
import Button from './Button';

interface Props {
  page: number;
  total: number;
  pageSize: number;
  onChange: (page: number) => void;
}

export default function Pagination({ page, total, pageSize, onChange }: Props) {
  if (total === 0) return null;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  return (
    <div className="flex items-center justify-end gap-4 py-4 text-sm">
      <span className="text-ink-4">共 {total} 条</span>
      <Button variant="second" size="md" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        上一页
      </Button>
      <span className="text-ink-3">
        {page} / {pageCount}
      </span>
      <Button variant="second" size="md" disabled={page >= pageCount} onClick={() => onChange(page + 1)}>
        下一页
      </Button>
    </div>
  );
}
```

- [ ] **Step 10: 实现 Toast**

`src/components/ui/Toast.tsx`：

```tsx
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { cn } from './cn';

interface ToastItem {
  id: number;
  tone: 'success' | 'error';
  message: string;
}

interface ToastApi {
  success: (message: string) => void;
  error: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

let nextId = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const push = useCallback((tone: ToastItem['tone'], message: string) => {
    const id = nextId++;
    setItems((prev) => [...prev, { id, tone, message }]);
    setTimeout(() => setItems((prev) => prev.filter((i) => i.id !== id)), 3000);
  }, []);

  const api = useMemo<ToastApi>(
    () => ({ success: (m) => push('success', m), error: (m) => push('error', m) }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="fixed top-5 left-1/2 z-[100] flex -translate-x-1/2 flex-col gap-2">
        {items.map((i) => (
          <div
            key={i.id}
            className={cn(
              'rounded-pill px-5 py-2.5 text-sm font-semibold shadow-[0px_4px_10px_rgba(208,208,208,0.4)]',
              i.tone === 'success' ? 'bg-primary text-black' : 'bg-danger text-white',
            )}
          >
            {i.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast 必须在 ToastProvider 内使用');
  return ctx;
}
```

`src/components/ui/index.ts`：

```ts
export { default as Badge } from './Badge';
export { default as Button } from './Button';
export { default as Field } from './Field';
export { default as FormSection } from './FormSection';
export { default as Input } from './Input';
export { default as Modal } from './Modal';
export { default as Pagination } from './Pagination';
export { default as Select } from './Select';
export { default as Table } from './Table';
export { default as Textarea } from './Textarea';
export { ToastProvider, useToast } from './Toast';
export type { Option } from './Select';
export type { Column } from './Table';
```

- [ ] **Step 11: 把 ToastProvider 挂到 App**

`src/App.tsx` 改为：

```tsx
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from 'react-router';
import { ToastProvider } from '@/components/ui';
import { queryClient } from '@/lib/queryClient';
import router from '@/routes';

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  );
}
```

- [ ] **Step 12: 验证**

```bash
npm test
npx tsc -b
```

Expected: 全绿（Button 3 + Pagination 5 + 之前的 schema/format/errors）。

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat: UI 基础组件库"
```

---

## Task 6: 应用布局与完整路由表

**Files:**
- Create: `src/layouts/AppLayout.tsx`, `src/layouts/Sidebar.tsx`, `src/layouts/Header.tsx`, `src/components/PageHeader.tsx`
- Modify: `src/routes.tsx`
- Test: `src/layouts/__tests__/Sidebar.test.tsx`

**Interfaces:**
- Consumes: `useSession` / `signOut`（Task 4）、`Button`（Task 5）
- Produces：`<AppLayout>`（内含 `<Outlet />`）；`<PageHeader title actions?>`；`/buyers` `/sellers` `/orders` 三组路由的占位挂载点

- [ ] **Step 1: 写失败的 Sidebar 测试**

`src/layouts/__tests__/Sidebar.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Sidebar from '@/layouts/Sidebar';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('渲染三个导航入口', () => {
    renderAt('/orders');
    expect(screen.getByRole('link', { name: '买家管理' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '卖家管理' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '订单管理' })).toBeInTheDocument();
  });

  it('当前路由的入口标记为选中', () => {
    renderAt('/buyers');
    expect(screen.getByRole('link', { name: '买家管理' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '订单管理' })).not.toHaveAttribute('aria-current');
  });

  it('子路由也算选中', () => {
    renderAt('/orders/abc-123');
    expect(screen.getByRole('link', { name: '订单管理' })).toHaveAttribute('aria-current', 'page');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- Sidebar`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 Sidebar**

`src/layouts/Sidebar.tsx`。对齐 velafi：249px 宽、`bg-surface`、22px 横向内边距、12px 纵向内边距、hover `bg-surface-hover`、12px 半粗字。

```tsx
import { NavLink } from 'react-router';
import { cn } from '@/components/ui/cn';

const NAV = [
  { to: '/buyers', label: '买家管理' },
  { to: '/sellers', label: '卖家管理' },
  { to: '/orders', label: '订单管理' },
];

export default function Sidebar() {
  return (
    <nav className="bg-surface w-[249px] shrink-0 py-3.5">
      <div className="px-[22px] py-4 text-base font-semibold">Advaita</div>
      <hr className="border-line mx-[22px] my-5" />
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'transition-base block px-[22px] py-3 text-xs font-semibold select-none',
              isActive ? 'bg-surface-hover text-black' : 'text-ink-3 hover:bg-surface-hover',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
```

`NavLink` 在匹配时自动加 `aria-current="page"`，测试依赖这个行为。`/orders/abc-123` 会匹配 `/orders`（react-router 默认前缀匹配，非 `end`）。

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- Sidebar`
Expected: PASS，3 个用例。

- [ ] **Step 5: 实现 Header 与 AppLayout**

`src/layouts/Header.tsx`：

```tsx
import { useSession, signOut } from '@/features/auth/useSession';

export default function Header() {
  const { session } = useSession();

  return (
    <header className="border-line sticky top-0 z-40 flex h-[60px] shrink-0 items-center justify-end gap-4 border-b bg-white px-[46px]">
      <span className="text-ink-3 text-sm">{session?.user.email}</span>
      <button
        onClick={() => signOut()}
        className="text-ink-3 transition-base text-sm font-medium hover:text-black"
      >
        退出登录
      </button>
    </header>
  );
}
```

`src/layouts/AppLayout.tsx`：

```tsx
import { Outlet } from 'react-router';
import Header from './Header';
import Sidebar from './Sidebar';

export default function AppLayout() {
  return (
    <div className="flex h-full min-h-screen items-stretch">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Header />
        <main className="flex-1 px-[46px] py-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
```

`src/components/PageHeader.tsx`：

```tsx
import type { ReactNode } from 'react';

export default function PageHeader({ title, actions }: { title: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex items-center justify-between">
      <h1 className="text-2xl font-semibold">{title}</h1>
      {actions}
    </div>
  );
}
```

- [ ] **Step 6: 更新路由表**

`src/routes.tsx`（业务页面本任务先用占位 div，Task 7-11 逐个替换）：

```tsx
import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RequireAuth from '@/features/auth/RequireAuth';
import AppLayout from '@/layouts/AppLayout';

const placeholder = (name: string) => <div className="text-ink-4">{name}（待实现）</div>;

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        element: <AppLayout />,
        children: [
          { path: '/', element: <Navigate to="/orders" replace /> },

          { path: '/buyers', element: placeholder('买家列表') },
          { path: '/buyers/new', element: placeholder('新建买家') },
          { path: '/buyers/:id', element: placeholder('买家详情') },

          { path: '/sellers', element: placeholder('卖家列表') },
          { path: '/sellers/new', element: placeholder('新建卖家') },
          { path: '/sellers/:id', element: placeholder('卖家详情') },

          { path: '/orders', element: placeholder('订单列表') },
          { path: '/orders/new', element: placeholder('新建订单') },
          { path: '/orders/:id', element: placeholder('订单详情') },

          { path: '*', element: <Navigate to="/orders" replace /> },
        ],
      },
    ],
  },
]);

export default router;
```

- [ ] **Step 7: 验证**

```bash
npm test
npx tsc -b
```

Expected: 全绿。手动 `npm run dev` 登录后应看到左侧 249px 灰色侧边栏、右上角邮箱与退出登录、点击三个入口能切换并高亮。

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: 侧边栏布局与完整路由表"
```

---

## Task 7: 买卖家数据层与列表页

**Files:**
- Create: `src/features/counterparties/api.ts`, `src/features/counterparties/hooks.ts`, `src/features/counterparties/CounterpartyListPage.tsx`
- Modify: `src/routes.tsx`
- Test: `src/features/counterparties/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `supabase`、`toFriendlyError`、`Counterparty` / `CounterpartyInput` / `Role`、UI 组件
- Produces:
  - `buildCounterpartyQuery(params)` —— 纯函数，把筛选参数转成 `{ from, to, orFilter }`，供测试
  - `listCounterparties(params: { role: Role; keyword?: string; page: number; pageSize: number }): Promise<{ rows: Counterparty[]; total: number }>`
  - `getCounterparty(id: string): Promise<Counterparty>`
  - `createCounterparty(input: CounterpartyInput): Promise<Counterparty>`
  - `updateCounterparty(id: string, input: CounterpartyInput): Promise<Counterparty>`
  - `listCounterpartyOptions(role: Role): Promise<CounterpartyOption[]>` 及类型 `CounterpartyOption`（含默认收款信息，Task 10 依赖）
  - `useCounterpartyList(params)` / `useCounterparty(id)` / `useCounterpartyOptions(role)` / `useCreateCounterparty()` / `useUpdateCounterparty(id)`
  - `counterpartyKeys`（react-query key 工厂）

- [ ] **Step 1: 写失败的查询构造测试**

`src/features/counterparties/__tests__/api.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildCounterpartyQuery } from '@/features/counterparties/api';

describe('buildCounterpartyQuery', () => {
  it('计算分页 range', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', page: 1, pageSize: 20 })).toMatchObject({
      from: 0,
      to: 19,
    });
    expect(buildCounterpartyQuery({ role: 'buyer', page: 3, pageSize: 20 })).toMatchObject({
      from: 40,
      to: 59,
    });
  });

  it('无关键词时不生成 or 过滤', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', page: 1, pageSize: 20 }).orFilter).toBeUndefined();
  });

  it('有关键词时对四个字段做模糊匹配', () => {
    expect(buildCounterpartyQuery({ role: 'seller', keyword: '张三', page: 1, pageSize: 20 }).orFilter).toBe(
      'full_name.ilike.%张三%,display_id.ilike.%张三%,email.ilike.%张三%,phone.ilike.%张三%',
    );
  });

  it('关键词首尾空格被裁剪，纯空格视为无关键词', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', keyword: '  ', page: 1, pageSize: 20 }).orFilter).toBeUndefined();
    expect(buildCounterpartyQuery({ role: 'buyer', keyword: ' ab ', page: 1, pageSize: 20 }).orFilter).toContain(
      '%ab%',
    );
  });

  it('关键词里的逗号被剔除，避免破坏 or 语法', () => {
    expect(buildCounterpartyQuery({ role: 'buyer', keyword: 'a,b', page: 1, pageSize: 20 }).orFilter).toContain(
      '%ab%',
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- counterparties`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `api.ts`**

```ts
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import type { Counterparty, CounterpartyInput, Role } from '@/lib/schema';

export interface ListParams {
  role: Role;
  keyword?: string;
  page: number;
  pageSize: number;
}

const SEARCH_FIELDS = ['full_name', 'display_id', 'email', 'phone'];

/** 纯函数：把筛选参数转成 supabase 查询片段 */
export function buildCounterpartyQuery(params: ListParams): {
  from: number;
  to: number;
  orFilter?: string;
} {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  const keyword = (params.keyword ?? '').replace(/,/g, '').trim();
  if (!keyword) return { from, to };

  return {
    from,
    to,
    orFilter: SEARCH_FIELDS.map((f) => `${f}.ilike.%${keyword}%`).join(','),
  };
}

export async function listCounterparties(params: ListParams) {
  const { from, to, orFilter } = buildCounterpartyQuery(params);

  let q = supabase
    .from('counterparties')
    .select('*', { count: 'exact' })
    .eq('role', params.role)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (orFilter) q = q.or(orFilter);

  const { data, error, count } = await q;
  if (error) throw toFriendlyError(error);

  return { rows: (data ?? []) as Counterparty[], total: count ?? 0 };
}

export async function getCounterparty(id: string): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').select('*').eq('id', id).single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

export async function createCounterparty(input: CounterpartyInput): Promise<Counterparty> {
  const { data, error } = await supabase.from('counterparties').insert(input).select('*').single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

export async function updateCounterparty(id: string, input: CounterpartyInput): Promise<Counterparty> {
  const { data, error } = await supabase
    .from('counterparties')
    .update(input)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toFriendlyError(error);
  return data as Counterparty;
}

/**
 * 下拉选择用。除了展示所需的 id / display_id / full_name，
 * 还带上默认收款信息 —— Task 10 的订单表单要用它自动带出收款字段。
 */
const OPTION_SELECT =
  'id, display_id, full_name, bank_name, bank_account_name, bank_account_number, bank_swift, default_wallet_address, default_wallet_chain';

export type CounterpartyOption = Pick<
  Counterparty,
  | 'id'
  | 'display_id'
  | 'full_name'
  | 'bank_name'
  | 'bank_account_name'
  | 'bank_account_number'
  | 'bank_swift'
  | 'default_wallet_address'
  | 'default_wallet_chain'
>;

export async function listCounterpartyOptions(role: Role): Promise<CounterpartyOption[]> {
  const { data, error } = await supabase
    .from('counterparties')
    .select(OPTION_SELECT)
    .eq('role', role)
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw toFriendlyError(error);
  return (data ?? []) as CounterpartyOption[];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- counterparties`
Expected: PASS，5 个用例。

- [ ] **Step 5: 实现 `hooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CounterpartyInput, Role } from '@/lib/schema';
import {
  createCounterparty,
  getCounterparty,
  listCounterparties,
  listCounterpartyOptions,
  updateCounterparty,
  type ListParams,
} from './api';

export const counterpartyKeys = {
  all: ['counterparties'] as const,
  list: (p: ListParams) => ['counterparties', 'list', p] as const,
  options: (role: Role) => ['counterparties', 'options', role] as const,
  detail: (id: string) => ['counterparties', 'detail', id] as const,
};

export function useCounterpartyList(params: ListParams) {
  return useQuery({
    queryKey: counterpartyKeys.list(params),
    queryFn: () => listCounterparties(params),
  });
}

export function useCounterpartyOptions(role: Role) {
  return useQuery({
    queryKey: counterpartyKeys.options(role),
    queryFn: () => listCounterpartyOptions(role),
  });
}

export function useCounterparty(id: string | undefined) {
  return useQuery({
    queryKey: counterpartyKeys.detail(id ?? ''),
    queryFn: () => getCounterparty(id!),
    enabled: Boolean(id),
  });
}

export function useCreateCounterparty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CounterpartyInput) => createCounterparty(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: counterpartyKeys.all }),
  });
}

export function useUpdateCounterparty(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CounterpartyInput) => updateCounterparty(id, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: counterpartyKeys.all }),
  });
}
```

- [ ] **Step 6: 实现列表页**

`src/features/counterparties/CounterpartyListPage.tsx`：

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, Input, Pagination, Table, type Column } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Counterparty, Role } from '@/lib/schema';
import { useCounterpartyList } from './hooks';

const PAGE_SIZE = 20;

export default function CounterpartyListPage({ role }: { role: Role }) {
  const navigate = useNavigate();
  const label = role === 'buyer' ? '买家' : '卖家';
  const basePath = role === 'buyer' ? '/buyers' : '/sellers';

  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading } = useCounterpartyList({ role, keyword: search, page, pageSize: PAGE_SIZE });

  const columns: Column<Counterparty>[] = [
    { key: 'display_id', title: '用户 ID', width: '120px', render: (r) => <span className="font-semibold">{r.display_id}</span> },
    { key: 'full_name', title: '姓名', render: (r) => r.full_name },
    { key: 'country', title: '国家', width: '100px', render: (r) => r.country || '-' },
    { key: 'email', title: '邮箱', render: (r) => r.email || '-' },
    { key: 'phone', title: '手机号', render: (r) => r.phone || '-' },
    { key: 'created_at', title: '创建时间', width: '160px', render: (r) => formatDateTime(r.created_at) },
  ];

  function applySearch() {
    setPage(1);
    setSearch(keyword);
  }

  return (
    <>
      <PageHeader
        title={`${label}管理`}
        actions={<Button onClick={() => navigate(`${basePath}/new`)}>新建{label}</Button>}
      />

      <div className="mb-4 flex gap-3">
        <Input
          className="w-[320px]"
          placeholder="搜索姓名 / 用户 ID / 邮箱 / 手机号"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applySearch()}
        />
        <Button variant="second" onClick={applySearch}>
          搜索
        </Button>
      </div>

      <div className="rounded-card bg-surface p-2">
        <Table
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => navigate(`${basePath}/${r.id}`)}
          empty={`暂无${label}，点右上角新建`}
        />
      </div>

      <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
```

- [ ] **Step 7: 挂到路由**

`src/routes.tsx` 中把 `/buyers` 和 `/sellers` 两条占位替换：

```tsx
import CounterpartyListPage from '@/features/counterparties/CounterpartyListPage';

// ...
{ path: '/buyers', element: <CounterpartyListPage role="buyer" /> },
{ path: '/sellers', element: <CounterpartyListPage role="seller" /> },
```

- [ ] **Step 8: 验证**

```bash
npm test
npx tsc -b
```

Expected: 全绿。手动验证：登录后 `/buyers` 显示空表格与「暂无买家，点右上角新建」。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 买卖家数据层与列表页"
```

---

## Task 8: 买卖家表单页

**Files:**
- Create: `src/features/counterparties/CounterpartyForm.tsx`, `src/features/counterparties/CounterpartyFormPage.tsx`, `src/lib/countries.ts`
- Modify: `src/routes.tsx`
- Test: `src/features/counterparties/__tests__/CounterpartyForm.test.tsx`

**Interfaces:**
- Consumes: `counterpartySchema`、`useCounterparty` / `useCreateCounterparty` / `useUpdateCounterparty`、UI 组件
- Produces: `<CounterpartyForm role defaultValues? submitting onSubmit>`；`COUNTRIES: Option[]`

- [ ] **Step 1: 写 `src/lib/countries.ts`**

```ts
import type { Option } from '@/components/ui';

export const COUNTRIES: Option[] = [
  { value: 'CN', label: '中国' },
  { value: 'HK', label: '中国香港' },
  { value: 'SG', label: '新加坡' },
  { value: 'IN', label: '印度' },
  { value: 'AE', label: '阿联酋' },
  { value: 'US', label: '美国' },
  { value: 'GB', label: '英国' },
  { value: 'DE', label: '德国' },
  { value: 'JP', label: '日本' },
  { value: 'KR', label: '韩国' },
  { value: 'MY', label: '马来西亚' },
  { value: 'TH', label: '泰国' },
  { value: 'VN', label: '越南' },
  { value: 'ID', label: '印度尼西亚' },
  { value: 'PH', label: '菲律宾' },
  { value: 'TR', label: '土耳其' },
  { value: 'NG', label: '尼日利亚' },
  { value: 'BR', label: '巴西' },
  { value: 'RU', label: '俄罗斯' },
  { value: 'OTHER', label: '其他' },
];
```

- [ ] **Step 2: 写失败的表单测试**

`src/features/counterparties/__tests__/CounterpartyForm.test.tsx`：

```tsx
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CounterpartyForm from '@/features/counterparties/CounterpartyForm';

describe('CounterpartyForm', () => {
  it('姓名为空时提交显示错误且不回调', async () => {
    const onSubmit = vi.fn();
    render(<CounterpartyForm role="buyer" submitting={false} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('请填写姓名')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('填了姓名即可提交，role 带上', async () => {
    const onSubmit = vi.fn();
    render(<CounterpartyForm role="seller" submitting={false} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^姓名/), '李四');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ role: 'seller', full_name: '李四' });
  });

  it('邮箱格式错误时阻止提交', async () => {
    const onSubmit = vi.fn();
    render(<CounterpartyForm role="buyer" submitting={false} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^姓名/), '王五');
    await userEvent.type(screen.getByLabelText(/^邮箱/), 'bad-email');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('邮箱格式不正确')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('回填默认值', () => {
    render(
      <CounterpartyForm
        role="buyer"
        submitting={false}
        onSubmit={vi.fn()}
        defaultValues={{ role: 'buyer', full_name: '赵六', email: 'a@b.com', tags: [] }}
      />,
    );
    expect(screen.getByLabelText(/^姓名/)).toHaveValue('赵六');
    expect(screen.getByLabelText(/^邮箱/)).toHaveValue('a@b.com');
  });

  it('submitting 时按钮禁用', () => {
    render(<CounterpartyForm role="buyer" submitting onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: '处理中...' })).toBeDisabled();
  });
});
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npm test -- CounterpartyForm`
Expected: FAIL，模块不存在。

- [ ] **Step 4: 实现 `CounterpartyForm.tsx`**

两个约束来自测试：

1. 测试用 `getByLabelText(/^姓名/)` 定位，所以 `Field` 的 `<label>` 必须真的包住 input —— Task 5 的 `Field` 已是 `<label>` 包裹结构，满足。用正则而非精确串是因为必填项的可访问名会带上星号（「姓名 *」）。
2. `defaultValues` 里不能出现 `null`（DB 选填列返回 null），否则受控 input 报警告。转换在 `CounterpartyFormPage`（Step 6）里做。

```tsx
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FormSection, Input, Select, Textarea } from '@/components/ui';
import { COUNTRIES } from '@/lib/countries';
import { ID_TYPE_LABEL } from '@/lib/format';
import { CHAINS, ID_TYPES, counterpartySchema, type CounterpartyInput, type Role } from '@/lib/schema';

interface Props {
  role: Role;
  defaultValues?: Partial<CounterpartyInput>;
  submitting: boolean;
  onSubmit: (values: CounterpartyInput) => void;
}

const ID_TYPE_OPTIONS = ID_TYPES.map((v) => ({ value: v, label: ID_TYPE_LABEL[v] }));
const CHAIN_OPTIONS = CHAINS.map((v) => ({ value: v, label: v }));

export default function CounterpartyForm({ role, defaultValues, submitting, onSubmit }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<CounterpartyInput>({
    resolver: zodResolver(counterpartySchema),
    defaultValues: { role, tags: [], ...defaultValues },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-[900px]">
      <input type="hidden" {...register('role')} value={role} />

      <FormSection title="基础身份">
        <Field label="姓名" required error={errors.full_name?.message}>
          <Input {...register('full_name')} invalid={!!errors.full_name} placeholder="请输入姓名" />
        </Field>
        <Field label="国家" error={errors.country?.message as string}>
          <Select {...register('country')} options={COUNTRIES} placeholder="请选择国家" />
        </Field>
        <Field label="证件类型" error={errors.id_type?.message as string}>
          <Select {...register('id_type')} options={ID_TYPE_OPTIONS} placeholder="请选择证件类型" />
        </Field>
        <Field label="证件号" error={errors.id_number?.message as string}>
          <Input {...register('id_number')} placeholder="请输入证件号" />
        </Field>
        <Field label="出生日期" error={errors.date_of_birth?.message as string}>
          <Input type="date" {...register('date_of_birth')} invalid={!!errors.date_of_birth} />
        </Field>
      </FormSection>

      <FormSection title="联系方式">
        <Field label="邮箱" error={errors.email?.message as string}>
          <Input {...register('email')} invalid={!!errors.email} placeholder="name@example.com" />
        </Field>
        <Field label="手机号" error={errors.phone?.message as string}>
          <Input {...register('phone')} placeholder="含国际区号，如 +86 138..." />
        </Field>
        <Field label="Telegram" error={errors.telegram?.message as string}>
          <Input {...register('telegram')} placeholder="@username" />
        </Field>
        <Field label="WhatsApp" error={errors.whatsapp?.message as string}>
          <Input {...register('whatsapp')} placeholder="含国际区号" />
        </Field>
      </FormSection>

      <FormSection title="默认收款信息">
        <Field label="银行名称" error={errors.bank_name?.message as string}>
          <Input {...register('bank_name')} placeholder="请输入银行名称" />
        </Field>
        <Field label="银行户名" error={errors.bank_account_name?.message as string}>
          <Input {...register('bank_account_name')} placeholder="请输入户名" />
        </Field>
        <Field label="银行账号" error={errors.bank_account_number?.message as string}>
          <Input {...register('bank_account_number')} placeholder="请输入账号" />
        </Field>
        <Field label="SWIFT / IFSC" error={errors.bank_swift?.message as string}>
          <Input {...register('bank_swift')} placeholder="选填" />
        </Field>
        <Field label="默认收款地址" error={errors.default_wallet_address?.message as string}>
          <Input {...register('default_wallet_address')} placeholder="请输入钱包地址" />
        </Field>
        <Field label="默认收款链" error={errors.default_wallet_chain?.message as string}>
          <Select {...register('default_wallet_chain')} options={CHAIN_OPTIONS} placeholder="请选择链" />
        </Field>
      </FormSection>

      <FormSection title="备注">
        <div className="col-span-2">
          <Field label="备注" error={errors.note?.message as string}>
            <Textarea {...register('note')} placeholder="内部备注，选填" />
          </Field>
        </div>
      </FormSection>

      <Button type="submit" size="lg" loading={submitting}>
        保存
      </Button>
    </form>
  );
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npm test -- CounterpartyForm`
Expected: PASS，5 个用例。

- [ ] **Step 6: 实现表单页容器**

`src/features/counterparties/CounterpartyFormPage.tsx`：

```tsx
import { useNavigate, useParams } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, useToast } from '@/components/ui';
import { formatDateTime } from '@/lib/format';
import type { Counterparty, CounterpartyInput, Role } from '@/lib/schema';
import CounterpartyForm from './CounterpartyForm';
import { useCounterparty, useCreateCounterparty, useUpdateCounterparty } from './hooks';

/** DB 行 → 表单默认值：把 null 转成 undefined，避免受控 input 收到 null */
function toFormValues(row: Counterparty | undefined): Partial<CounterpartyInput> | undefined {
  if (!row) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === 'id' || k === 'display_id' || k === 'created_by' || k === 'created_at' || k === 'updated_at') {
      continue;
    }
    out[k] = v === null ? undefined : v;
  }
  return out as Partial<CounterpartyInput>;
}

export default function CounterpartyFormPage({ role, mode }: { role: Role; mode: 'create' | 'edit' }) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const label = role === 'buyer' ? '买家' : '卖家';
  const basePath = role === 'buyer' ? '/buyers' : '/sellers';

  const detail = useCounterparty(mode === 'edit' ? id : undefined);
  const create = useCreateCounterparty();
  const update = useUpdateCounterparty(id ?? '');

  if (mode === 'edit' && detail.isLoading) {
    return <div className="text-ink-4 text-sm">加载中...</div>;
  }
  if (mode === 'edit' && detail.isError) {
    return <div className="text-danger text-sm">加载失败：{(detail.error as Error).message}</div>;
  }

  function handleSubmit(values: CounterpartyInput) {
    if (mode === 'create') {
      create.mutate(values, {
        onSuccess: (row) => {
          toast.success(`创建成功，用户 ID ${row.display_id}`);
          navigate(`${basePath}/${row.id}`, { replace: true });
        },
        onError: (e) => toast.error((e as Error).message),
      });
    } else {
      update.mutate(values, {
        onSuccess: () => toast.success('保存成功'),
        onError: (e) => toast.error((e as Error).message),
      });
    }
  }

  return (
    <>
      <PageHeader
        title={mode === 'create' ? `新建${label}` : `${label}详情`}
        actions={
          <Button variant="second" onClick={() => navigate(basePath)}>
            返回列表
          </Button>
        }
      />

      {mode === 'edit' && detail.data ? (
        <div className="rounded-card bg-surface mb-5 flex gap-10 px-6 py-4 text-sm">
          <span>
            用户 ID <b className="ml-2">{detail.data.display_id}</b>
          </span>
          <span className="text-ink-3">创建于 {formatDateTime(detail.data.created_at)}</span>
        </div>
      ) : null}

      <CounterpartyForm
        role={role}
        key={detail.data?.id ?? 'new'}
        defaultValues={toFormValues(detail.data)}
        submitting={create.isPending || update.isPending}
        onSubmit={handleSubmit}
      />
    </>
  );
}
```

- [ ] **Step 7: 挂到路由**

`src/routes.tsx` 中替换四条占位：

```tsx
import CounterpartyFormPage from '@/features/counterparties/CounterpartyFormPage';

// ...
{ path: '/buyers/new', element: <CounterpartyFormPage role="buyer" mode="create" /> },
{ path: '/buyers/:id', element: <CounterpartyFormPage role="buyer" mode="edit" /> },
{ path: '/sellers/new', element: <CounterpartyFormPage role="seller" mode="create" /> },
{ path: '/sellers/:id', element: <CounterpartyFormPage role="seller" mode="edit" /> },
```

- [ ] **Step 8: 验证**

```bash
npm test
npx tsc -b
```

Expected: 全绿。手动验证：新建买家只填姓名即可保存，保存后 toast 显示生成的 `U000001` 并跳转详情页。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 买卖家档案表单页"
```

---

## Task 9: 订单数据层与列表页

**Files:**
- Create: `src/features/orders/api.ts`, `src/features/orders/hooks.ts`, `src/features/orders/OrderStatusBadge.tsx`, `src/features/orders/OrderListPage.tsx`
- Modify: `src/routes.tsx`
- Test: `src/features/orders/__tests__/api.test.ts`

**Interfaces:**
- Consumes: `supabase`、`toFriendlyError`、`Order` / `OrderWithParties` / `OrderInput` / `OrderStatus` / `OrderType`、UI 组件
- Produces:
  - `buildOrderQuery(params: OrderListParams): { from; to; filters: Array<[string, string]>; orFilter?: string }`
  - `listOrders(params)` / `getOrder(id)` / `createOrder(input)` / `updateOrderStatus(id, status)` / `listOrderStatusLogs(orderId)`
  - `useOrderList` / `useOrder` / `useCreateOrder` / `useUpdateOrderStatus` / `useOrderStatusLogs`
  - `orderKeys`
  - `<OrderStatusBadge status />`
  - `ORDER_SELECT`（带关联方的 select 字符串常量）

- [ ] **Step 1: 写失败的查询构造测试**

`src/features/orders/__tests__/api.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { buildOrderQuery } from '@/features/orders/api';

describe('buildOrderQuery', () => {
  it('计算分页 range', () => {
    expect(buildOrderQuery({ page: 2, pageSize: 20 })).toMatchObject({ from: 20, to: 39 });
  });

  it('无筛选时 filters 为空', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20 }).filters).toEqual([]);
  });

  it('按类型和状态筛选', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20, orderType: 'crypto', status: 'paid' }).filters).toEqual([
      ['order_type', 'crypto'],
      ['status', 'paid'],
    ]);
  });

  it('订单号搜索走 ilike', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20, keyword: 'ORD2026' }).orFilter).toBe(
      'order_no.ilike.%ORD2026%',
    );
  });

  it('空关键词不生成 orFilter', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20, keyword: '   ' }).orFilter).toBeUndefined();
  });

  it('日期区间转成 gte / lte', () => {
    const r = buildOrderQuery({ page: 1, pageSize: 20, dateFrom: '2026-08-01', dateTo: '2026-08-06' });
    expect(r.range).toEqual({ gte: '2026-08-01T00:00:00.000Z', lte: '2026-08-06T23:59:59.999Z' });
  });

  it('只填开始日期时只有 gte', () => {
    const r = buildOrderQuery({ page: 1, pageSize: 20, dateFrom: '2026-08-01' });
    expect(r.range).toEqual({ gte: '2026-08-01T00:00:00.000Z' });
  });

  it('无日期时 range 为 undefined', () => {
    expect(buildOrderQuery({ page: 1, pageSize: 20 }).range).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- orders`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `api.ts`**

```ts
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import type {
  Order,
  OrderInput,
  OrderStatus,
  OrderStatusLog,
  OrderType,
  OrderWithParties,
} from '@/lib/schema';

export const ORDER_SELECT =
  '*, buyer:buyer_id (id, display_id, full_name), seller:seller_id (id, display_id, full_name)';

export interface OrderListParams {
  page: number;
  pageSize: number;
  orderType?: OrderType;
  status?: OrderStatus;
  keyword?: string;
  dateFrom?: string;
  dateTo?: string;
}

export function buildOrderQuery(params: OrderListParams): {
  from: number;
  to: number;
  filters: Array<[string, string]>;
  orFilter?: string;
  range?: { gte?: string; lte?: string };
} {
  const from = (params.page - 1) * params.pageSize;
  const to = from + params.pageSize - 1;

  const filters: Array<[string, string]> = [];
  if (params.orderType) filters.push(['order_type', params.orderType]);
  if (params.status) filters.push(['status', params.status]);

  const keyword = (params.keyword ?? '').replace(/,/g, '').trim();
  const orFilter = keyword ? `order_no.ilike.%${keyword}%` : undefined;

  let range: { gte?: string; lte?: string } | undefined;
  if (params.dateFrom || params.dateTo) {
    range = {};
    if (params.dateFrom) range.gte = `${params.dateFrom}T00:00:00.000Z`;
    if (params.dateTo) range.lte = `${params.dateTo}T23:59:59.999Z`;
  }

  return { from, to, filters, orFilter, range };
}

export async function listOrders(params: OrderListParams) {
  const { from, to, filters, orFilter, range } = buildOrderQuery(params);

  let q = supabase
    .from('orders')
    .select(ORDER_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, to);

  for (const [col, val] of filters) q = q.eq(col, val);
  if (orFilter) q = q.or(orFilter);
  if (range?.gte) q = q.gte('created_at', range.gte);
  if (range?.lte) q = q.lte('created_at', range.lte);

  const { data, error, count } = await q;
  if (error) throw toFriendlyError(error);

  return { rows: (data ?? []) as unknown as OrderWithParties[], total: count ?? 0 };
}

export async function getOrder(id: string): Promise<OrderWithParties> {
  const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('id', id).single();
  if (error) throw toFriendlyError(error);
  return data as unknown as OrderWithParties;
}

export async function createOrder(input: OrderInput): Promise<Order> {
  const { data, error } = await supabase.from('orders').insert(input).select('*').single();
  if (error) throw toFriendlyError(error);
  return data as Order;
}

export async function updateOrderStatus(id: string, status: OrderStatus): Promise<Order> {
  const { data, error } = await supabase
    .from('orders')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw toFriendlyError(error);
  return data as Order;
}

export async function listOrderStatusLogs(orderId: string): Promise<OrderStatusLog[]> {
  const { data, error } = await supabase
    .from('order_status_logs')
    .select('*')
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });
  if (error) throw toFriendlyError(error);
  return (data ?? []) as OrderStatusLog[];
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- orders`
Expected: PASS，8 个用例。

- [ ] **Step 5: 实现 `hooks.ts`**

```ts
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { OrderInput, OrderStatus } from '@/lib/schema';
import {
  createOrder,
  getOrder,
  listOrderStatusLogs,
  listOrders,
  updateOrderStatus,
  type OrderListParams,
} from './api';

export const orderKeys = {
  all: ['orders'] as const,
  list: (p: OrderListParams) => ['orders', 'list', p] as const,
  detail: (id: string) => ['orders', 'detail', id] as const,
  logs: (id: string) => ['orders', 'logs', id] as const,
};

export function useOrderList(params: OrderListParams) {
  return useQuery({ queryKey: orderKeys.list(params), queryFn: () => listOrders(params) });
}

export function useOrder(id: string | undefined) {
  return useQuery({
    queryKey: orderKeys.detail(id ?? ''),
    queryFn: () => getOrder(id!),
    enabled: Boolean(id),
  });
}

export function useOrderStatusLogs(id: string | undefined) {
  return useQuery({
    queryKey: orderKeys.logs(id ?? ''),
    queryFn: () => listOrderStatusLogs(id!),
    enabled: Boolean(id),
  });
}

export function useCreateOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OrderInput) => createOrder(input),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all }),
  });
}

export function useUpdateOrderStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (status: OrderStatus) => updateOrderStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: orderKeys.all }),
  });
}
```

- [ ] **Step 6: 实现状态徽标**

`src/features/orders/OrderStatusBadge.tsx`：

```tsx
import { Badge } from '@/components/ui';
import { ORDER_STATUS_LABEL } from '@/lib/format';
import type { OrderStatus } from '@/lib/schema';

const TONE = {
  pending_payment: 'neutral',
  paid: 'accent',
  completed: 'success',
  cancelled: 'outline',
} as const;

export default function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return <Badge tone={TONE[status]}>{ORDER_STATUS_LABEL[status]}</Badge>;
}
```

- [ ] **Step 7: 实现订单列表页**

`src/features/orders/OrderListPage.tsx`：

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, Input, Pagination, Select, Table, type Column } from '@/components/ui';
import {
  ORDER_STATUS_LABEL,
  ORDER_TYPE_LABEL,
  formatAmount,
  formatDateTime,
  shortenAddress,
} from '@/lib/format';
import { ORDER_STATUSES, ORDER_TYPES, type OrderStatus, type OrderType, type OrderWithParties } from '@/lib/schema';
import OrderStatusBadge from './OrderStatusBadge';
import { useOrderList } from './hooks';

const PAGE_SIZE = 20;
const TYPE_OPTIONS = ORDER_TYPES.map((v) => ({ value: v, label: ORDER_TYPE_LABEL[v] }));
const STATUS_OPTIONS = ORDER_STATUSES.map((v) => ({ value: v, label: ORDER_STATUS_LABEL[v] }));

export default function OrderListPage() {
  const navigate = useNavigate();

  const [page, setPage] = useState(1);
  const [orderType, setOrderType] = useState<OrderType | ''>('');
  const [status, setStatus] = useState<OrderStatus | ''>('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');

  const { data, isLoading } = useOrderList({
    page,
    pageSize: PAGE_SIZE,
    orderType: orderType || undefined,
    status: status || undefined,
    dateFrom: dateFrom || undefined,
    dateTo: dateTo || undefined,
    keyword: search || undefined,
  });

  const columns: Column<OrderWithParties>[] = [
    { key: 'order_no', title: '订单号', width: '180px', render: (r) => <span className="font-semibold">{r.order_no}</span> },
    { key: 'order_type', title: '类型', width: '90px', render: (r) => ORDER_TYPE_LABEL[r.order_type] },
    { key: 'buyer', title: '买家', render: (r) => r.buyer ? `${r.buyer.full_name} (${r.buyer.display_id})` : '-' },
    { key: 'seller', title: '卖家', render: (r) => r.seller ? `${r.seller.full_name} (${r.seller.display_id})` : '-' },
    {
      key: 'amount',
      title: '金额',
      width: '180px',
      render: (r) =>
        r.order_type === 'crypto'
          ? `${formatAmount(r.amount, 8)} ${r.asset ?? ''}`
          : `${formatAmount(r.amount)} ${r.fiat_currency ?? ''}`,
    },
    {
      key: 'payto',
      title: '收款信息',
      width: '180px',
      render: (r) =>
        r.order_type === 'crypto'
          ? `${shortenAddress(r.receiving_address)}${r.chain ? ` · ${r.chain}` : ''}`
          : shortenAddress(r.bank_account_number, 4, 4),
    },
    { key: 'status', title: '状态', width: '110px', render: (r) => <OrderStatusBadge status={r.status} /> },
    { key: 'created_at', title: '创建时间', width: '160px', render: (r) => formatDateTime(r.created_at) },
  ];

  function reset(fn: () => void) {
    setPage(1);
    fn();
  }

  return (
    <>
      <PageHeader title="订单管理" actions={<Button onClick={() => navigate('/orders/new')}>新建订单</Button>} />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Select
          className="w-[140px]"
          options={TYPE_OPTIONS}
          placeholder="全部类型"
          value={orderType}
          onChange={(e) => reset(() => setOrderType(e.target.value as OrderType | ''))}
        />
        <Select
          className="w-[140px]"
          options={STATUS_OPTIONS}
          placeholder="全部状态"
          value={status}
          onChange={(e) => reset(() => setStatus(e.target.value as OrderStatus | ''))}
        />
        <Input
          className="w-[160px]"
          type="date"
          value={dateFrom}
          onChange={(e) => reset(() => setDateFrom(e.target.value))}
        />
        <span className="text-ink-4">至</span>
        <Input
          className="w-[160px]"
          type="date"
          value={dateTo}
          onChange={(e) => reset(() => setDateTo(e.target.value))}
        />
        <Input
          className="w-[220px]"
          placeholder="搜索订单号"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && reset(() => setSearch(keyword))}
        />
        <Button variant="second" onClick={() => reset(() => setSearch(keyword))}>
          搜索
        </Button>
      </div>

      <div className="rounded-card bg-surface p-2">
        <Table
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(r) => r.id}
          loading={isLoading}
          onRowClick={(r) => navigate(`/orders/${r.id}`)}
          empty="暂无订单，点右上角新建"
        />
      </div>

      <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
    </>
  );
}
```

- [ ] **Step 8: 挂到路由**

`src/routes.tsx` 中替换 `/orders` 占位：

```tsx
import OrderListPage from '@/features/orders/OrderListPage';
// ...
{ path: '/orders', element: <OrderListPage /> },
```

- [ ] **Step 9: 验证**

```bash
npm test
npx tsc -b
```

Expected: 全绿。手动验证：`/orders` 显示筛选栏与空表格。

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: 订单数据层与列表页"
```

---

## Task 10: 订单表单

**Files:**
- Create: `src/features/orders/formLogic.ts`, `src/features/orders/OrderForm.tsx`, `src/features/orders/OrderCreatePage.tsx`
- Modify: `src/routes.tsx`
- Test: `src/features/orders/__tests__/formLogic.test.ts`

**Interfaces:**
- Consumes: `orderSchema`、`useCounterpartyOptions`（Task 7）、`useCreateOrder`（Task 9）、UI 组件
- Produces:
  - `defaultPayee(orderType: OrderType): Payee`
  - `clearTypeFields(values: Record<string, unknown>, nextType: OrderType): Record<string, unknown>`
  - `payeeDefaults(orderType: OrderType, party: CounterpartyDefaults | undefined): Record<string, string>`，其中 `CounterpartyDefaults = Pick<Counterparty, 'bank_name'|'bank_account_name'|'bank_account_number'|'bank_swift'|'default_wallet_address'|'default_wallet_chain'>`
  - `<OrderForm submitting onSubmit>`

- [ ] **Step 1: 写失败的纯逻辑测试**

`src/features/orders/__tests__/formLogic.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { clearTypeFields, defaultPayee, payeeDefaults } from '@/features/orders/formLogic';

describe('defaultPayee', () => {
  it('crypto 订单默认收款方是买家', () => {
    expect(defaultPayee('crypto')).toBe('buyer');
  });
  it('法币订单默认收款方是卖家', () => {
    expect(defaultPayee('fiat')).toBe('seller');
  });
});

describe('clearTypeFields', () => {
  const values = {
    buyer_id: 'b',
    seller_id: 's',
    amount: 100,
    payee: 'buyer',
    asset: 'USDT',
    chain: 'TRON',
    receiving_address: 'TXk',
    fiat_currency: 'USD',
    bank_name: 'ICBC',
    bank_account_name: '张三',
    bank_account_number: '6222',
    bank_swift: 'ICBKCNBJ',
    note: 'n',
  };

  it('切到 crypto 时清空法币字段并保留通用字段', () => {
    const r = clearTypeFields(values, 'crypto');
    expect(r.fiat_currency).toBe('');
    expect(r.bank_name).toBe('');
    expect(r.bank_account_number).toBe('');
    expect(r.bank_swift).toBe('');
    expect(r.buyer_id).toBe('b');
    expect(r.amount).toBe(100);
    expect(r.note).toBe('n');
  });

  it('切到 crypto 时重置 payee 为买家', () => {
    expect(clearTypeFields({ ...values, payee: 'seller' }, 'crypto').payee).toBe('buyer');
  });

  it('切到 fiat 时清空 crypto 字段', () => {
    const r = clearTypeFields(values, 'fiat');
    expect(r.asset).toBe('');
    expect(r.chain).toBe('');
    expect(r.receiving_address).toBe('');
    expect(r.payee).toBe('seller');
  });

  it('order_type 被设为目标类型', () => {
    expect(clearTypeFields(values, 'fiat').order_type).toBe('fiat');
  });
});

describe('payeeDefaults', () => {
  const party = {
    bank_name: 'ICBC',
    bank_account_name: '张三',
    bank_account_number: '6222000011112222',
    bank_swift: 'ICBKCNBJ',
    default_wallet_address: 'TXkabc',
    default_wallet_chain: 'TRON' as const,
  };

  it('crypto 订单带出钱包地址和链', () => {
    expect(payeeDefaults('crypto', party)).toEqual({
      receiving_address: 'TXkabc',
      chain: 'TRON',
    });
  });

  it('法币订单带出银行信息', () => {
    expect(payeeDefaults('fiat', party)).toEqual({
      bank_name: 'ICBC',
      bank_account_name: '张三',
      bank_account_number: '6222000011112222',
      bank_swift: 'ICBKCNBJ',
    });
  });

  it('对方没有默认值时返回空字符串', () => {
    expect(payeeDefaults('crypto', undefined)).toEqual({ receiving_address: '', chain: '' });
    expect(payeeDefaults('fiat', {})).toEqual({
      bank_name: '',
      bank_account_name: '',
      bank_account_number: '',
      bank_swift: '',
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- formLogic`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `formLogic.ts`**

```ts
import type { Counterparty, OrderType, Payee } from '@/lib/schema';

export type CounterpartyDefaults = Partial<
  Pick<
    Counterparty,
    | 'bank_name'
    | 'bank_account_name'
    | 'bank_account_number'
    | 'bank_swift'
    | 'default_wallet_address'
    | 'default_wallet_chain'
  >
>;

const CRYPTO_FIELDS = ['asset', 'chain', 'receiving_address'] as const;
const FIAT_FIELDS = ['fiat_currency', 'bank_name', 'bank_account_name', 'bank_account_number', 'bank_swift'] as const;

/** crypto 订单默认买家收币；法币订单默认卖家收款 */
export function defaultPayee(orderType: OrderType): Payee {
  return orderType === 'crypto' ? 'buyer' : 'seller';
}

/** 切换订单类型时，清空另一类型的字段并重置收款方 */
export function clearTypeFields<T extends Record<string, unknown>>(
  values: T,
  nextType: OrderType,
): T & Record<string, unknown> {
  const next: Record<string, unknown> = { ...values, order_type: nextType, payee: defaultPayee(nextType) };
  const toClear = nextType === 'crypto' ? FIAT_FIELDS : CRYPTO_FIELDS;
  for (const f of toClear) next[f] = '';
  return next as T & Record<string, unknown>;
}

/** 从收款方档案带出默认收款信息 */
export function payeeDefaults(
  orderType: OrderType,
  party: CounterpartyDefaults | undefined,
): Record<string, string> {
  if (orderType === 'crypto') {
    return {
      receiving_address: party?.default_wallet_address ?? '',
      chain: party?.default_wallet_chain ?? '',
    };
  }
  return {
    bank_name: party?.bank_name ?? '',
    bank_account_name: party?.bank_account_name ?? '',
    bank_account_number: party?.bank_account_number ?? '',
    bank_swift: party?.bank_swift ?? '',
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- formLogic`
Expected: PASS，10 个用例。

- [ ] **Step 5: 实现 `OrderForm.tsx`**

表单用 `useForm` 的 `watch` + `setValue` 驱动动态字段。收款信息带出逻辑：监听 `payee`、`order_type`、`buyer_id`、`seller_id` 四个值，任一变化就调 `payeeDefaults` 回填（用户手动改过之后再触发会被覆盖，这是刻意的 —— 换收款方就该换收款信息）。

```tsx
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button, Field, FormSection, Input, Select, Textarea, type Option } from '@/components/ui';
import { ORDER_TYPE_LABEL, PAYEE_LABEL } from '@/lib/format';
import {
  ASSETS,
  CHAINS,
  FIAT_CURRENCIES,
  ORDER_TYPES,
  PAYEES,
  orderSchema,
  type OrderInput,
  type OrderType,
  type Payee,
} from '@/lib/schema';
import type { CounterpartyOption } from '@/features/counterparties/api';
import { useCounterpartyOptions } from '@/features/counterparties/hooks';
import { clearTypeFields, defaultPayee, payeeDefaults } from './formLogic';

const TYPE_OPTIONS = ORDER_TYPES.map((v) => ({ value: v, label: ORDER_TYPE_LABEL[v] }));
const PAYEE_OPTIONS = PAYEES.map((v) => ({ value: v, label: PAYEE_LABEL[v] }));
const ASSET_OPTIONS = ASSETS.map((v) => ({ value: v, label: v }));
const CHAIN_OPTIONS = CHAINS.map((v) => ({ value: v, label: v }));
const FIAT_OPTIONS = FIAT_CURRENCIES.map((v) => ({ value: v, label: v }));

function toOptions(rows: CounterpartyOption[] | undefined): Option[] {
  return (rows ?? []).map((r) => ({ value: r.id, label: `${r.full_name}（${r.display_id}）` }));
}

export default function OrderForm({
  submitting,
  onSubmit,
}: {
  submitting: boolean;
  onSubmit: (values: OrderInput) => void;
}) {
  const buyers = useCounterpartyOptions('buyer');
  const sellers = useCounterpartyOptions('seller');

  const {
    register,
    handleSubmit,
    watch,
    getValues,
    reset,
    setValue,
    formState: { errors },
  } = useForm<any>({
    resolver: zodResolver(orderSchema),
    defaultValues: {
      order_type: 'crypto' as OrderType,
      payee: defaultPayee('crypto'),
      buyer_id: '',
      seller_id: '',
      amount: '',
      asset: '',
      chain: '',
      receiving_address: '',
      fiat_currency: '',
      bank_name: '',
      bank_account_name: '',
      bank_account_number: '',
      bank_swift: '',
      note: '',
    },
  });

  const orderType = watch('order_type') as OrderType;
  const payee = watch('payee') as Payee;
  const buyerId = watch('buyer_id') as string;
  const sellerId = watch('seller_id') as string;

  // 收款方或订单类型变化时，从对应档案带出默认收款信息
  useEffect(() => {
    const partyId = payee === 'buyer' ? buyerId : sellerId;
    if (!partyId) return;
    const rows = payee === 'buyer' ? buyers.data : sellers.data;
    const full = (rows ?? []).find((r) => r.id === partyId);
    for (const [k, v] of Object.entries(payeeDefaults(orderType, full))) {
      setValue(k, v, { shouldValidate: false });
    }
  }, [orderType, payee, buyerId, sellerId, buyers.data, sellers.data, setValue]);

  function handleTypeChange(next: OrderType) {
    reset(clearTypeFields(getValues(), next));
  }

  const err = (name: string) => (errors as Record<string, { message?: string } | undefined>)[name]?.message;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="max-w-[900px]">
      <FormSection title="订单基础">
        <Field label="订单类型" required error={err('order_type')}>
          <Select
            options={TYPE_OPTIONS}
            value={orderType}
            onChange={(e) => handleTypeChange(e.target.value as OrderType)}
          />
        </Field>
        <Field label="收款方" required error={err('payee')}>
          <Select {...register('payee')} options={PAYEE_OPTIONS} invalid={!!err('payee')} />
        </Field>
        <Field label="买家" required error={err('buyer_id')}>
          <Select
            {...register('buyer_id')}
            options={toOptions(buyers.data)}
            placeholder="请选择买家"
            invalid={!!err('buyer_id')}
          />
        </Field>
        <Field label="卖家" required error={err('seller_id')}>
          <Select
            {...register('seller_id')}
            options={toOptions(sellers.data)}
            placeholder="请选择卖家"
            invalid={!!err('seller_id')}
          />
        </Field>
        <Field label="金额" required error={err('amount')}>
          <Input {...register('amount')} inputMode="decimal" placeholder="请输入金额" invalid={!!err('amount')} />
        </Field>
      </FormSection>

      {orderType === 'crypto' ? (
        <FormSection title="Crypto 收款信息">
          <Field label="币种" required error={err('asset')}>
            <Select {...register('asset')} options={ASSET_OPTIONS} placeholder="请选择币种" invalid={!!err('asset')} />
          </Field>
          <Field label="链" required error={err('chain')}>
            <Select {...register('chain')} options={CHAIN_OPTIONS} placeholder="请选择链" invalid={!!err('chain')} />
          </Field>
          <div className="col-span-2">
            <Field
              label="收款地址"
              required
              error={err('receiving_address')}
              hint="已按所选收款方的默认地址带出，可修改"
            >
              <Input
                {...register('receiving_address')}
                placeholder="请输入收款地址"
                invalid={!!err('receiving_address')}
              />
            </Field>
          </div>
        </FormSection>
      ) : (
        <FormSection title="法币收款信息">
          <Field label="法币币种" required error={err('fiat_currency')}>
            <Select
              {...register('fiat_currency')}
              options={FIAT_OPTIONS}
              placeholder="请选择币种"
              invalid={!!err('fiat_currency')}
            />
          </Field>
          <Field label="银行名称" error={err('bank_name')}>
            <Input {...register('bank_name')} placeholder="请输入银行名称" />
          </Field>
          <Field label="银行户名" error={err('bank_account_name')}>
            <Input {...register('bank_account_name')} placeholder="请输入户名" />
          </Field>
          <Field label="SWIFT / IFSC" error={err('bank_swift')}>
            <Input {...register('bank_swift')} placeholder="选填" />
          </Field>
          <div className="col-span-2">
            <Field
              label="收款账号"
              required
              error={err('bank_account_number')}
              hint="已按所选收款方的默认账号带出，可修改"
            >
              <Input
                {...register('bank_account_number')}
                placeholder="请输入收款账号"
                invalid={!!err('bank_account_number')}
              />
            </Field>
          </div>
        </FormSection>
      )}

      <FormSection title="备注">
        <div className="col-span-2">
          <Field label="备注" error={err('note')}>
            <Textarea {...register('note')} placeholder="内部备注，选填" />
          </Field>
        </div>
      </FormSection>

      <Button type="submit" size="lg" loading={submitting}>
        创建订单
      </Button>
    </form>
  );
}
```

- [ ] **Step 6: 实现新建订单页并挂路由**

`src/features/orders/OrderCreatePage.tsx`：

```tsx
import { useNavigate } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, useToast } from '@/components/ui';
import type { OrderInput } from '@/lib/schema';
import OrderForm from './OrderForm';
import { useCreateOrder } from './hooks';

export default function OrderCreatePage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateOrder();

  return (
    <>
      <PageHeader
        title="新建订单"
        actions={
          <Button variant="second" onClick={() => navigate('/orders')}>
            返回列表
          </Button>
        }
      />
      <OrderForm
        submitting={create.isPending}
        onSubmit={(values: OrderInput) =>
          create.mutate(values, {
            onSuccess: (order) => {
              toast.success(`创建成功，订单号 ${order.order_no}`);
              navigate(`/orders/${order.id}`, { replace: true });
            },
            onError: (e) => toast.error((e as Error).message),
          })
        }
      />
    </>
  );
}
```

`src/routes.tsx` 替换 `/orders/new`：

```tsx
import OrderCreatePage from '@/features/orders/OrderCreatePage';
// ...
{ path: '/orders/new', element: <OrderCreatePage /> },
```

- [ ] **Step 8: 验证**

```bash
npm test
npx tsc -b
```

Expected: 全绿。手动验证：先建一个买家（填了默认钱包地址）和一个卖家（填了银行账号）。进 `/orders/new`：默认 Crypto 类型、收款方为买家；选中买家后收款地址自动带出；切到「法币」后 Crypto 字段消失、收款方变成卖家、银行账号自动带出；提交后 toast 显示 `ORD20260806-0001`。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 订单创建表单"
```

---

## Task 11: 订单详情、状态变更与时间线

**Files:**
- Create: `src/features/orders/OrderDetailPage.tsx`, `src/features/orders/StatusTimeline.tsx`, `src/features/orders/OrderInfoGrid.tsx`
- Modify: `src/routes.tsx`
- Test: `src/features/orders/__tests__/StatusTimeline.test.tsx`

**Interfaces:**
- Consumes: `useOrder` / `useOrderStatusLogs` / `useUpdateOrderStatus`（Task 9）、`OrderStatusBadge`、UI 组件
- Produces: 无（终端页面）

- [ ] **Step 1: 写失败的时间线测试**

`src/features/orders/__tests__/StatusTimeline.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import StatusTimeline from '@/features/orders/StatusTimeline';
import type { OrderStatusLog } from '@/lib/schema';

const logs: OrderStatusLog[] = [
  {
    id: '1',
    order_id: 'o',
    from_status: null,
    to_status: 'pending_payment',
    changed_by: null,
    created_at: '2026-08-06T01:00:00Z',
  },
  {
    id: '2',
    order_id: 'o',
    from_status: 'pending_payment',
    to_status: 'paid',
    changed_by: null,
    created_at: '2026-08-06T02:00:00Z',
  },
];

describe('StatusTimeline', () => {
  it('首条显示为创建订单', () => {
    render(<StatusTimeline logs={logs} loading={false} />);
    expect(screen.getByText('创建订单，状态为 待付款')).toBeInTheDocument();
  });

  it('后续条目显示状态流转', () => {
    render(<StatusTimeline logs={logs} loading={false} />);
    expect(screen.getByText('待付款 → 已付款')).toBeInTheDocument();
  });

  it('无记录时显示占位', () => {
    render(<StatusTimeline logs={[]} loading={false} />);
    expect(screen.getByText('暂无状态记录')).toBeInTheDocument();
  });

  it('加载中显示加载态', () => {
    render(<StatusTimeline logs={[]} loading />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npm test -- StatusTimeline`
Expected: FAIL，模块不存在。

- [ ] **Step 3: 实现 `StatusTimeline.tsx`**

```tsx
import { ORDER_STATUS_LABEL, formatDateTime } from '@/lib/format';
import type { OrderStatusLog } from '@/lib/schema';

export default function StatusTimeline({ logs, loading }: { logs: OrderStatusLog[]; loading: boolean }) {
  if (loading) return <p className="text-ink-4 py-6 text-sm">加载中...</p>;
  if (logs.length === 0) return <p className="text-ink-4 py-6 text-sm">暂无状态记录</p>;

  return (
    <ol className="relative pl-5">
      {logs.map((log) => (
        <li key={log.id} className="border-line relative border-l pb-6 pl-5 last:border-l-0 last:pb-0">
          <span className="bg-primary absolute top-1 -left-[5px] h-2.5 w-2.5 rounded-full" />
          <p className="text-sm font-semibold">
            {log.from_status
              ? `${ORDER_STATUS_LABEL[log.from_status]} → ${ORDER_STATUS_LABEL[log.to_status]}`
              : `创建订单，状态为 ${ORDER_STATUS_LABEL[log.to_status]}`}
          </p>
          <p className="text-ink-4 mt-1 text-xs">{formatDateTime(log.created_at)}</p>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npm test -- StatusTimeline`
Expected: PASS，4 个用例。

- [ ] **Step 5: 实现信息展示网格**

`src/features/orders/OrderInfoGrid.tsx`：

```tsx
import { Link } from 'react-router';
import { ORDER_TYPE_LABEL, PAYEE_LABEL, formatAmount, formatDateTime } from '@/lib/format';
import type { OrderWithParties } from '@/lib/schema';

function Item({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-black/50">{label}</p>
      <p className="text-sm font-medium break-all">{children ?? '-'}</p>
    </div>
  );
}

export default function OrderInfoGrid({ order }: { order: OrderWithParties }) {
  return (
    <div className="grid grid-cols-3 gap-x-6 gap-y-5">
      <Item label="订单号">{order.order_no}</Item>
      <Item label="订单类型">{ORDER_TYPE_LABEL[order.order_type]}</Item>
      <Item label="收款方">{PAYEE_LABEL[order.payee]}</Item>

      <Item label="买家">
        {order.buyer ? (
          <Link className="underline" to={`/buyers/${order.buyer.id}`}>
            {order.buyer.full_name}（{order.buyer.display_id}）
          </Link>
        ) : null}
      </Item>
      <Item label="卖家">
        {order.seller ? (
          <Link className="underline" to={`/sellers/${order.seller.id}`}>
            {order.seller.full_name}（{order.seller.display_id}）
          </Link>
        ) : null}
      </Item>
      <Item label="金额">
        {order.order_type === 'crypto'
          ? `${formatAmount(order.amount, 8)} ${order.asset ?? ''}`
          : `${formatAmount(order.amount)} ${order.fiat_currency ?? ''}`}
      </Item>

      {order.order_type === 'crypto' ? (
        <>
          <Item label="链">{order.chain}</Item>
          <div className="col-span-2">
            <Item label="收款地址">{order.receiving_address}</Item>
          </div>
        </>
      ) : (
        <>
          <Item label="银行名称">{order.bank_name}</Item>
          <Item label="银行户名">{order.bank_account_name}</Item>
          <Item label="收款账号">{order.bank_account_number}</Item>
          <Item label="SWIFT / IFSC">{order.bank_swift}</Item>
        </>
      )}

      <Item label="创建时间">{formatDateTime(order.created_at)}</Item>
      <Item label="更新时间">{formatDateTime(order.updated_at)}</Item>
      <div className="col-span-3">
        <Item label="备注">{order.note}</Item>
      </div>
    </div>
  );
}
```

- [ ] **Step 6: 实现详情页**

`src/features/orders/OrderDetailPage.tsx`：

```tsx
import { useNavigate, useParams } from 'react-router';
import PageHeader from '@/components/PageHeader';
import { Button, Select, useToast } from '@/components/ui';
import { ORDER_STATUS_LABEL } from '@/lib/format';
import { ORDER_STATUSES, type OrderStatus } from '@/lib/schema';
import OrderInfoGrid from './OrderInfoGrid';
import OrderStatusBadge from './OrderStatusBadge';
import StatusTimeline from './StatusTimeline';
import { useOrder, useOrderStatusLogs, useUpdateOrderStatus } from './hooks';

const STATUS_OPTIONS = ORDER_STATUSES.map((v) => ({ value: v, label: ORDER_STATUS_LABEL[v] }));

export default function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const toast = useToast();

  const order = useOrder(id);
  const logs = useOrderStatusLogs(id);
  const updateStatus = useUpdateOrderStatus(id ?? '');

  if (order.isLoading) return <div className="text-ink-4 text-sm">加载中...</div>;
  if (order.isError) return <div className="text-danger text-sm">加载失败：{(order.error as Error).message}</div>;
  if (!order.data) return null;

  function handleStatusChange(next: OrderStatus) {
    if (next === order.data!.status) return;
    updateStatus.mutate(next, {
      onSuccess: () => toast.success(`已更新为「${ORDER_STATUS_LABEL[next]}」`),
      onError: (e) => toast.error((e as Error).message),
    });
  }

  return (
    <>
      <PageHeader
        title="订单详情"
        actions={
          <Button variant="second" onClick={() => navigate('/orders')}>
            返回列表
          </Button>
        }
      />

      <div className="rounded-card bg-surface mb-5 flex items-center gap-5 px-6 py-4">
        <span className="text-sm text-black/50">当前状态</span>
        <OrderStatusBadge status={order.data.status} />
        <Select
          className="w-[160px]"
          options={STATUS_OPTIONS}
          value={order.data.status}
          disabled={updateStatus.isPending}
          onChange={(e) => handleStatusChange(e.target.value as OrderStatus)}
        />
        <span className="text-ink-4 text-xs">状态可在四种之间手动切换，每次变更都会记录</span>
      </div>

      <div className="rounded-card bg-surface mb-5 p-6">
        <h2 className="mb-5 text-sm font-semibold">订单信息</h2>
        <OrderInfoGrid order={order.data} />
      </div>

      <div className="rounded-card bg-surface p-6">
        <h2 className="mb-5 text-sm font-semibold">状态变更记录</h2>
        <StatusTimeline logs={logs.data ?? []} loading={logs.isLoading} />
      </div>
    </>
  );
}
```

- [ ] **Step 7: 挂到路由**

`src/routes.tsx` 替换 `/orders/:id`：

```tsx
import OrderDetailPage from '@/features/orders/OrderDetailPage';
// ...
{ path: '/orders/:id', element: <OrderDetailPage /> },
```

此时 `placeholder` 辅助函数已无引用，删掉它。

- [ ] **Step 8: 全量验证**

```bash
npm test
npx tsc -b
npm run build
```

Expected: 所有测试通过（约 55 个用例），tsc 无错误，构建成功。

手动端到端验证清单：

1. 登录 → 跳转 `/orders`
2. 新建买家（填姓名 + 默认钱包地址 TRON）→ toast 显示 `U000001`
3. 新建卖家（填姓名 + 银行账号）→ toast 显示 `U000002`
4. 新建 Crypto 订单：选买家卖家、填金额、地址自动带出 → toast 显示订单号
5. 新建法币订单：切类型后 Crypto 字段消失、收款方变卖家、银行账号自动带出
6. 订单列表能按类型、状态、日期、订单号筛选
7. 订单详情把状态改成「已完成」→ 徽标变绿、时间线新增一条
8. 退出登录 → 回到 `/login`，直接访问 `/orders` 被拦截

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: 订单详情、状态变更与时间线"
```

---

## 附：完成后的核对

- [ ] `npm run build` 通过
- [ ] `npm test` 全绿
- [ ] `README.md` 的四步 Supabase 接入说明与实际字段一致
- [ ] `.env` 未被提交（`.gitignore` 已含）
- [ ] 所有页面在 1440px 宽下布局正常
