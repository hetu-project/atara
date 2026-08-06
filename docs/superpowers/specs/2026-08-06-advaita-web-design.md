# advaita-web 设计文档

日期：2026-08-06
状态：已确认

## 1. 目标

一个内部运营后台。单一账号登录后，维护买家和卖家档案，并为他们创建、跟踪 Crypto 或法币订单。形态参考币安 C2C 的信息结构，但所有数据由运营人员代填，没有 C2C 的撮合、聊天、申诉等流程。

数据全部存 Supabase，前端直连，不自建后端服务。

## 2. 技术栈

| 层 | 选型 |
|---|---|
| 构建 | Vite + React 18 + TypeScript |
| 样式 | Tailwind CSS，theme 中定义 velafi-web 的设计 token |
| 路由 | react-router v7 |
| 数据 | `@supabase/supabase-js` + `@tanstack/react-query` |
| 表单 | react-hook-form + zod |
| 测试 | Vitest |

选 Tailwind 而非 velafi 的 styled-components：本项目以表单和表格为主，Tailwind 开发更快，且不需要移植 velafi 的整套自研组件库。视觉一致性通过 token 对齐保证。

## 3. 设计语言

从 velafi-web 提取，写入 `tailwind.config.ts`：

```
颜色
  primary       #88ff9a   主按钮底色，配黑色文字
  primaryHover  #7af28c
  surface       rgba(0,0,0,0.02)   卡片/侧边栏弱化底色
  surfaceHover  rgba(0,0,0,0.04)
  line          rgba(0,0,0,0.06)   分割线
  success       #00c41f
  danger        #f270be   错误文案、校验失败
  accent        #f25fb7   徽标/角标

圆角
  card 28px    pill 999px（按钮）    input 12px

尺寸
  控件高度 md 44px / lg 56px
  侧边栏 249px    顶栏 60px（sticky）

其他
  字重 500 / 600 为主
  过渡统一 transition: all 0.3s ease-in-out
```

按钮三档，对齐 velafi：primary（薄荷绿底黑字）、second（白底黑字带边框）、third（黑底白字）。

## 4. 数据模型

三张表，均在 `public` schema。

### 4.1 `counterparties`

买家和卖家共用一张表，`role` 区分。同一个自然人若既做买家又做卖家，建两条记录。

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `display_id` | text unique not null | 展示用 ID，`U` + 6 位序号，如 `U000123`。由 DB sequence + trigger 生成 |
| `role` | text not null | `buyer` \| `seller` |
| `full_name` | text not null | |
| `id_type` | text | `passport` \| `id_card` \| `driver_license` |
| `id_number` | text | |
| `country` | text | ISO 3166-1 alpha-2 |
| `date_of_birth` | date | |
| `email` | text | |
| `phone` | text | |
| `telegram` | text | |
| `whatsapp` | text | |
| `bank_name` | text | 默认银行收款信息 |
| `bank_account_name` | text | |
| `bank_account_number` | text | |
| `bank_swift` | text | |
| `default_wallet_address` | text | 默认收款地址 |
| `default_wallet_chain` | text | `TRON` \| `ETH` \| `BSC` \| `SOL` \| `BTC` \| `POLYGON` |
| `note` | text | 自由备注 |
| `tags` | text[] | 内部标签 |
| `created_by` | uuid | `auth.uid()`，默认值由 DB 填 |
| `created_at` / `updated_at` | timestamptz | `updated_at` 由 trigger 维护 |

索引：`role`、`display_id`、`full_name`（用于搜索）。

### 4.2 `orders`

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | uuid PK | |
| `order_no` | text unique not null | `ORD` + YYYYMMDD + `-` + 当日 4 位序号，如 `ORD20260806-0001`。DB trigger 生成 |
| `buyer_id` | uuid FK → counterparties | not null |
| `seller_id` | uuid FK → counterparties | not null |
| `order_type` | text not null | `crypto` \| `fiat` |
| `status` | text not null | `pending_payment` \| `paid` \| `completed` \| `cancelled`，默认 `pending_payment` |
| `amount` | numeric(38,8) not null | > 0 |
| `payee` | text not null | `buyer` \| `seller`，标明这笔款收给谁 |
| `asset` | text | crypto 订单：USDT / USDC / BTC / ETH … |
| `chain` | text | crypto 订单的链 |
| `receiving_address` | text | crypto 订单收款地址 |
| `fiat_currency` | text | 法币订单：USD / INR / EUR … |
| `bank_name` | text | 法币订单收款银行信息 |
| `bank_account_name` | text | |
| `bank_account_number` | text | |
| `bank_swift` | text | |
| `note` | text | |
| `created_by` | uuid | |
| `created_at` / `updated_at` | timestamptz | |

数据库层 CHECK 约束：

```sql
CHECK (
  (order_type = 'crypto'
     AND asset IS NOT NULL AND chain IS NOT NULL AND receiving_address IS NOT NULL
     AND fiat_currency IS NULL)
  OR
  (order_type = 'fiat'
     AND fiat_currency IS NOT NULL AND bank_account_number IS NOT NULL
     AND asset IS NULL AND chain IS NULL AND receiving_address IS NULL)
)
CHECK (buyer_id <> seller_id)
CHECK (amount > 0)
```

买家记录的 `role` 必须是 `buyer`、卖家记录的 `role` 必须是 `seller` —— 这一条在表单层用「买家下拉只查 role=buyer」保证，不做 DB 约束（跨表约束需要 trigger，成本高于收益）。

索引：`buyer_id`、`seller_id`、`status`、`order_type`、`created_at desc`。

### 4.3 `order_status_logs`

| 字段 | 类型 |
|---|---|
| `id` | uuid PK |
| `order_id` | uuid FK → orders, on delete cascade |
| `from_status` | text（首次创建时为 null） |
| `to_status` | text not null |
| `changed_by` | uuid |
| `created_at` | timestamptz |

订单创建和每次状态变更各写一条。订单详情页按时间正序展示为时间线。

### 4.4 RLS

三张表启用 RLS，各自一条策略：`authenticated` 角色可 SELECT / INSERT / UPDATE / DELETE 全部行。

账号由管理员在 Supabase 后台手工创建，前端不开放注册，因此不做行级数据隔离。`created_by` 仅用于审计展示。

## 5. 页面与路由

```
/login                      邮箱 + 密码登录，无注册、无找回密码入口
/buyers                     买家列表
/buyers/new                 新建买家
/buyers/:id                 买家详情 / 编辑
/sellers                    卖家列表
/sellers/new                新建卖家
/sellers/:id                卖家详情 / 编辑
/orders                     订单列表
/orders/new                 新建订单
/orders/:id                 订单详情 + 状态变更
```

「买家端 / 卖家端」体现为侧边栏两个入口。二者共用同一套列表和表单组件，只是传入的 `role` 不同。

未登录访问受保护路由重定向到 `/login`；登录后访问 `/login` 重定向到 `/orders`。session 过期由 supabase-js 的 `onAuthStateChange` 捕获，清空 react-query 缓存并跳回登录页。

### 5.1 列表页

买家/卖家列表列：展示 ID、姓名、国家、联系方式、创建时间、操作。支持按姓名 / 展示 ID / 邮箱 / 手机号模糊搜索，分页每页 20 条。

订单列表列：订单号、类型、买家、卖家、金额+币种、状态徽标、创建时间。筛选：订单类型、状态、创建日期区间；搜索订单号。

状态徽标配色：待付款 = 中性灰、已付款 = `#f25fb7`、已完成 = `#00c41f`、已取消 = 中性灰描边。

### 5.2 档案表单

分四个分组：基础身份、联系方式、默认收款信息、备注与标签。

必填：`full_name`。其余选填 —— 运营常常只拿到部分信息，强制必填会挡住录入。填了则按格式校验（邮箱格式、出生日期不得晚于今天、国家取自枚举）。

保存成功后展示生成的 `display_id`。

### 5.3 订单表单

1. 选订单类型：Crypto / 法币（切换时清空类型相关字段）
2. 选买家、选卖家（下拉带搜索，各自只查对应 role）
3. 填金额
4. 选收款方 `payee` —— Crypto 订单默认买家、法币订单默认卖家
5. 收款信息：从 `payee` 指向的那条 counterparty 记录自动带出默认值，可就地覆盖
   - Crypto：币种、链、收款地址
   - 法币：法币币种、银行名称、户名、账号、SWIFT
6. 备注
7. 提交 → 生成订单号，状态为「待付款」，同时写一条 status log

### 5.4 订单详情

上半部展示订单全量信息和买卖双方摘要（点击可跳到档案页）。状态区是一个下拉，四个状态之间可任意手动切换，切换即写 log。下半部是状态变更时间线。

## 6. 目录结构

```
advaita-web/
  src/
    lib/
      supabase.ts          client 单例，从 import.meta.env 读配置
      queryClient.ts
      schema.ts            zod schema，前端校验与 TS 类型的唯一来源
      format.ts            金额、日期、地址缩略等格式化
    components/ui/         Button Input Select Textarea Table Modal Badge Field Pagination Toast
    layouts/
      AppLayout.tsx        侧边栏 + 顶栏 + Outlet
      AuthLayout.tsx       登录页外壳
      RequireAuth.tsx      路由守卫
    features/
      auth/                useSession.ts, LoginPage.tsx
      counterparties/      api.ts hooks.ts CounterpartyForm.tsx CounterpartyList.tsx CounterpartyPage.tsx
      orders/              api.ts hooks.ts OrderForm.tsx OrderList.tsx OrderDetail.tsx StatusTimeline.tsx
    routes.tsx
    main.tsx
    index.css
  supabase/migrations/
    0001_init.sql
  .env.example
  README.md
  tailwind.config.ts
  vite.config.ts
  vitest.config.ts
```

每个 feature 自包含：`api.ts` 是唯一直接调 supabase 的地方，`hooks.ts` 用 react-query 包装它，组件只消费 hook。页面组件负责组合，不放数据逻辑。单文件控制在 200 行以内。

## 7. 错误处理

- `api.ts` 层统一捕获 supabase 错误，映射为中文文案后抛出；UI 用 toast 展示，不裸露 PostgREST 报错
- 表单校验错误显示在字段下方，`#f270be`，12px
- 唯一约束冲突（如订单号并发碰撞）→ 提示「请重试」
- 网络错误 → react-query 重试 1 次后提示

## 8. 测试

Vitest 覆盖：

- `schema.ts` 的 zod 校验规则：crypto / 法币订单各自的必填字段、金额必须为正、买卖家不能同一人
- `format.ts` 的格式化函数
- 订单表单的「切换类型清空字段」「按 payee 带出默认收款信息」这两段纯函数逻辑

不做 Supabase 集成测试。DB 层约束由 migration 中的 CHECK 保证，这是内部工具，投入产出不划算。

## 9. 交付与部署

交付内容含：

- `supabase/migrations/0001_init.sql` —— 建表、sequence、trigger、索引、RLS 策略、CHECK 约束
- `.env.example` —— `VITE_SUPABASE_URL`、`VITE_SUPABASE_ANON_KEY`
- `README.md` 中的四步接入说明：
  1. 在 supabase.com 新建项目
  2. SQL Editor 里执行 `0001_init.sql`
  3. Authentication → Users 手工创建登录账号，并在 Providers 里关闭 email 自助注册
  4. 复制 `.env.example` 为 `.env`，填入 Project URL 和 anon key

## 10. 明确不做

- 注册、找回密码、多角色权限
- 订单撮合、聊天、申诉、自动放币
- 文件/证件照上传
- 国际化（界面中文单语）
- 深色模式
