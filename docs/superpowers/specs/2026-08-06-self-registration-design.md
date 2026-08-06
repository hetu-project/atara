# 买卖家自助注册 — 设计文档

日期：2026-08-06
分支：`feat/self-registration`
基线：`612f2cc`

## 1. 目标与动机

当前版本假设「账号由管理员在 Supabase 后台手工创建」，登录后可读写全部数据。本次变更把买卖家档案的录入交给买卖家本人：自助注册账号、自己填档案、自己拿到 `display_id`、自己创建订单。

**这不是微调。** 现有权限模型建立在「只有管理员在操作」这个前提上，而本次变更正是去掉这个前提。RLS、页面结构、订单表单的对手方选择三处都要重做。

## 2. 现状：为什么权限模型必须重写

`0001_init.sql:237-244` 当前的 policy：

```sql
create policy "authenticated full access" on public.counterparties
  for all to authenticated using (true) with check (true);
create policy "authenticated full access" on public.orders
  for all to authenticated using (true) with check (true);
create policy "authenticated read" on public.order_status_logs
  for select to authenticated using (true);
```

`using(true)` 意味着任何 `authenticated` 角色可读写全部行。在单管理员前提下这是设计文档 §4.4 明确接受的选择。开放注册后，它意味着任何人注册一个账号即可读取全部用户的 `id_number`（身份证号）、`date_of_birth`、`bank_account_number`、`default_wallet_address` 以及全部订单。`anon` key 打包在前端 JS 里，前端无法阻止直接调用 PostgREST。

因此 RLS 重写是本次变更的**前提条件**，不是可选项。

数据库从未部署过（见 `docs/HANDOFF.md`：SQL 一次都没执行过），因此直接修改 `0001_init.sql`，不新增 `0002` 迁移。

## 3. 决策记录

### 3.1 已由用户裁决

| 问题 | 裁决 |
|---|---|
| 注册面向谁 | 真实买卖家自助注册 |
| 一个账号几个档案 | 一个账号可兼两角色（最多一个买家档案 + 一个卖家档案） |
| 用户能否自建订单 | 能，自己那侧自动填，需选择对手方 |

### 3.2 由我推荐、用户批准，可一行回退

**A. 开启邮箱验证。** Supabase 默认开启，保持默认。理由：防垃圾账号；关闭则任何人可用不存在的邮箱注册。

代价：用户需点击邮件链接；需在 Supabase 后台配置 Site URL 与 Redirect URL。

回退方式：Supabase Dashboard → Authentication → Providers → Email → 关闭 "Confirm email"。纯后台配置，不改代码。前端需同时处理「已注册待验证」与「已注册可直接登录」两种返回，因此两种配置都能正常工作。

**B. 状态流转引入轻量状态机。** 原版是任意状态自由切换（单管理员前提下合理）。现在双方都是普通用户，自由切换意味着买家可单方面把未付款订单标为「已完成」。

新规则：

| 目标状态 | 谁可执行 | 前置状态 |
|---|---|---|
| `paid`（已付款） | 付款方 | `pending_payment` |
| `completed`（已完成） | 收款方 | `paid` |
| `cancelled`（已取消） | 双方任一 | `pending_payment` |

「付款方」= `payee` 指向的**对方**；「收款方」= `payee` 指向的一方。钱到没到只有收款方知道，因此只有收款方能确认完成。

`order_status_logs.changed_by` 已记录操作人，可追溯。

回退方式：`0001_init.sql` 的 `orders` UPDATE policy 换回 `using(<自己相关>) with check(<自己相关>)`，去掉状态与角色判断；前端 `allowedTransitions` 改为返回全部状态。两处改动，均有注释标注。

## 4. 数据模型变更

### 4.1 `counterparties`

```sql
user_id  uuid not null references auth.users (id) on delete cascade,
...
unique (user_id, role)
```

- **新增** `user_id`，**删除** `created_by`。`created_by` 语义是「谁录入的」，在自助模式下等同于「档案属于谁」，保留两列会产生两个可能不一致的真相来源。
- `unique (user_id, role)` 强制「一个账号每种角色最多一个档案」。
- `not null` + `default auth.uid()`：默认值让前端不必传，`not null` 让 service-role 或异常上下文下的漏传直接失败而非静默写入 NULL。

`orders.created_by` **保留** —— 那里语义是「谁下的单」，与「订单属于谁」确实不同（买卖双方都属于该订单，但只有一方创建了它）。

### 4.2 索引

新增 `idx_counterparties_user_id on public.counterparties (user_id)`。`orders` 的 RLS policy 会通过 `user_id` 反查 `counterparties`，每次订单查询都会命中。

删除 `idx_counterparties_role`：全表扫描 role 的场景（买家列表页/卖家列表页）随本次变更消失。保留 `full_name` 与 `created_at` 索引。

## 5. RLS 重写

### 5.1 `counterparties`

```sql
create policy "own profiles" on public.counterparties
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
```

`using` 管住读/改/删的可见行，`with check` 防止插入或改写为他人的 `user_id`。

### 5.2 `orders`

自己是买方或卖方即可见：

```sql
create or replace function public.is_my_counterparty(cp_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.counterparties
    where id = cp_id and user_id = auth.uid()
  );
$$;
```

`security definer` 是必需的：policy 内的子查询同样受 `counterparties` 的 RLS 约束，普通函数在这里会因可见性递归而给出错误结果。`stable` 允许 planner 在单条语句内缓存结果。

```sql
create policy "my orders read" on public.orders
  for select to authenticated
  using (is_my_counterparty(buyer_id) or is_my_counterparty(seller_id));

create policy "my orders insert" on public.orders
  for insert to authenticated
  with check (is_my_counterparty(buyer_id) or is_my_counterparty(seller_id));
```

UPDATE policy 实现 §3.2-B 的状态机。由于 policy 无法直接读取「新旧状态对比」之外的上下文，状态机拆成两层：

- **policy 层**：限制可 UPDATE 的行为「自己相关的订单」
- **trigger 层**（`before update of status`）：校验状态转移的合法性与操作人身份，非法则 `raise exception`

放在 trigger 而非 policy 的原因：policy 违规返回的是空结果集或通用权限错误，用户看到「更新了 0 行」这种无法理解的反馈；trigger 可以 `raise exception` 给出具体中文原因（如「只有收款方可以确认完成」）。

**「我是哪一方」的判定**（实现时最易错处）。`payee` 取值 `'buyer' | 'seller'`，指明**这笔钱付给谁**：

```
收款方档案 id = (payee = 'buyer' ? buyer_id : seller_id)
付款方档案 id = (payee = 'buyer' ? seller_id : buyer_id)
```

于是 trigger 内：

- 「我是收款方」 = `is_my_counterparty(收款方档案 id)`
- 「我是付款方」 = `is_my_counterparty(付款方档案 id)`

注意 `payee` 与 `order_type` 是独立的两个维度。原设计里 crypto 默认 payee 为买家、fiat 默认为卖家，但那只是**表单默认值**，用户可覆盖。因此 trigger 绝不能用 `order_type` 推断收款方 —— 必须读 `payee` 列。

同一个账号可能同时持有买家档案与卖家档案（§3.1），理论上可以自己跟自己下单，此时两个判定同时为真、任何转移都被允许。这不构成安全问题（数据都是他自己的），不额外拦截。

前端的 `allowedTransitions(order, myProfileIds)` 必须实现同一套判定。它是**便利镜像**，不是安全边界 —— trigger 才是。两处逻辑重复是有意的：前端用于灰掉按钮，DB 用于强制执行。§10 要求为前端这份镜像穷举测试。

### 5.3 `order_status_logs`

```sql
create policy "my order logs" on public.order_status_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = public.order_status_logs.order_id
    )
  );
```

`orders` 的 SELECT policy 会自动作用于这个子查询，因此无需重复表达可见性条件 —— 能看到订单即能看到其日志。

外层列必须写成表限定的 `public.order_status_logs.order_id`。裸写 `order_id` 依赖「子查询里的 `orders` 没有同名列」这一巧合来正确解析；`orders` 表当前确实没有 `order_id` 列，所以裸写今天能工作，但日后给 `orders` 加一个 `order_id` 列就会让这个谓词静默变成 `o.order_id = o.order_id`（恒真），把全部日志暴露给所有登录用户。表限定写法让它不依赖这个巧合。

### 5.4 `order_no_counters`

不变。已正确配置为「开启 RLS 且无任何 policy」。

## 6. 对手方选择：`display_id` 精确查询

### 6.1 问题

创建订单需要指定对手方，但 §5.1 的 RLS 只让用户看到自己的档案。现有的 `listCounterpartyOptions`（`src/features/counterparties/api.ts:124`）列出某角色全部档案 —— RLS 生效后它不会报错，而是**静默返回只含自己档案的列表**，下拉框近乎空白。静默失败比报错更难排查，因此该函数及其 `OPTION_SELECT`、`CounterpartyOption` 类型一并删除。

同时 `OPTION_SELECT` 当前查询了 `bank_account_number`、`default_wallet_address` 等字段（`api.ts:108`）。任何「列出对手方」的接口都不能返回这些字段。

### 6.2 方案

`security definer` RPC，仅接受精确 `display_id`：

```sql
create or replace function public.lookup_counterparty(p_display_id text)
returns table (id uuid, display_id text, role text, full_name text)
language sql stable security definer
set search_path = public, pg_temp as $$
  select c.id, c.display_id, c.role, c.full_name
  from public.counterparties c
  where c.display_id = upper(trim(p_display_id))
  limit 1;
$$;

revoke all on function public.lookup_counterparty(text) from public;
grant execute on function public.lookup_counterparty(text) to authenticated;
```

三重约束：

1. **只返回 4 个字段** —— 身份证号、出生日期、银行账号、钱包地址均不在返回列表内。这是硬约束：即使前端有 bug 也无法泄漏。
2. **精确匹配，无模糊查询** —— 不能用 `like` 枚举用户。
3. **`authenticated` 独占** —— `anon` 无执行权限，未登录不可调用。

`display_id` 形如 `U000123`（6 位序列），理论上可暴力枚举。这是**已接受的风险**：枚举结果只有姓名，而姓名在交易场景下本就要相互告知；真实防护在于返回字段的选择，不在于 ID 不可猜。若日后需要收紧，可加 `pg_net` 频率限制或改用不可枚举的邀请码 —— 当前 YAGNI。

`upper(trim())` 让用户输入 `u000123` 或带空格也能命中。

### 6.3 UI 流程

订单表单的对手方选择：输入框（`U______` 占位）→ 失焦或点「查询」→ 显示 `U000123 · 张三（买家）` 供确认 → 确认后写入 `buyer_id`/`seller_id`。

查不到时提示「未找到该用户 ID，请向对方确认」。查到的角色与所需角色不符时提示「该用户 ID 是买家档案，此处需要卖家」。

## 7. 收款信息不再自动带出（行为变更）

现状：`OrderForm` 从 `CounterpartyOption` 带出的银行账号/钱包地址自动填入收款字段。

变更后：

- **收款方是自己** → 从自己的档案自动带出（RLS 允许，且是自己的数据）
- **收款方是对手方** → 手工填写，字段旁提示「请填写对方提供的收款信息」

这不仅是 RLS 的限制，本身也是正确行为 —— 对方的银行账号不该在你的界面里自动出现。让 `lookup_counterparty` 返回收款信息是明确禁止的：那等于知道一个 ID 就能拿到任何人的收款账号。

`OrderForm` 中记录 auto-fill effect 安全前提的注释需相应更新 —— 原注释说明的前提是「路由结构保证买卖家列表页与订单表单互斥挂载」，而买卖家列表页在本次变更中被删除，该注释描述的机制已不存在。

## 8. 页面与路由

### 8.1 删除

- `/buyers`、`/buyers/new`、`/buyers/:id`
- `/sellers`、`/sellers/new`、`/sellers/:id`
- `CounterpartyListPage.tsx` 及其分页、搜索、筛选逻辑
- `listCounterparties`、`buildCounterpartyQuery`、`listCounterpartyOptions` 及相关测试

`sanitizeKeyword` 当前定义在 `counterparties/api.ts` 并被 `orders/api.ts` 导入（订单列表的关键词搜索仍需要它）。随 `buildCounterpartyQuery` 删除后会断链，移至 `src/lib/sanitizeKeyword.ts`，其测试一并移动。

### 8.2 新增与保留

```
/login                 登录（保留，去掉「账号由管理员创建」的暗示文案）
/register              注册：邮箱 + 密码 + 确认密码
/onboarding            首次登录且无任何档案时强制引导
/profile               我的档案：买家档案 + 卖家档案，各自可建可改
/orders                我的订单（RLS 自动过滤）
/orders/new            创建订单
/orders/:id            订单详情与状态变更
```

侧边栏：`我的档案` / `订单管理`。

### 8.3 引导流程

`RequireAuth` 之后加一层 `RequireProfile`：已登录但 `counterparties` 中无任何属于该用户的行 → 重定向 `/onboarding`。

`/onboarding` 让用户选角色（买家/卖家）→ 复用现有 `CounterpartyForm` → 提交后显示生成的 `display_id`，提示「这是你的用户 ID，创建订单时需要提供给对方」→ 进入 `/orders`。

`/onboarding` 自身不能被 `RequireProfile` 拦截，否则无限重定向。

### 8.4 档案页

`/profile` 展示两个卡片：买家档案、卖家档案。已存在则显示 `display_id` 与「编辑」；不存在则显示「创建买家档案」。

`CounterpartyForm` 组件复用，`mode="create" | "edit"` 不变，`role` 由页面传入不变 —— 表单本身几乎不用改。

## 9. 前端数据层变更

`src/features/counterparties/api.ts`：

| 函数 | 变更 |
|---|---|
| `listCounterparties` | 删除 |
| `buildCounterpartyQuery` | 删除 |
| `listCounterpartyOptions` | 删除 |
| `getCounterparty` | 保留 |
| `createCounterparty` | 保留（`user_id` 由 DB 默认值填充） |
| `updateCounterparty` | 保留 |
| `toNullablePayload` | 保留 |
| `getMyProfiles()` | **新增** —— 返回当前用户的全部档案（0–2 条） |
| `lookupCounterparty(displayId)` | **新增** —— 调用 §6.2 的 RPC |

`toNullablePayload` 处理「空字符串 → null」，这是最终 review 修掉的那个 Critical（选填字段永远清不掉）的修复所在，不得改动其行为。

`src/features/auth/useSession.ts` 新增 `signUp(email, password)`，需同时处理邮箱验证开启与关闭两种返回形态（§3.2-A）。

## 10. 测试策略

沿用现有约定：纯函数与关键组件行为测试，不做集成测试。

**必须新增：**

- `lookupCounterparty` 的输入规范化（`upper` + `trim`）
- `allowedTransitions(order, myRole)` —— §3.2-B 状态机的前端镜像，纯函数，穷举 4 状态 × 2 角色 × 2 payee 方向
- `RequireProfile` 的重定向判定：无档案 → `/onboarding`；有档案 → 放行；已在 `/onboarding` → 不重定向

**必须修改：**

- `counterparties/__tests__/api.test.ts` —— 删除 `buildCounterpartyQuery` 相关用例
- `orders/__tests__/formLogic.test.ts`、`formFieldNames.test.ts` —— 对手方选择与收款字段自动带出的逻辑变了
- `layouts/__tests__/Sidebar.test.tsx` —— 导航项从 3 个变 2 个
**必须删除：**

- `src/features/orders/CounterpartyOptionNotice.tsx` 及 `__tests__/CounterpartyOptionNotice.test.tsx` —— 该组件的唯一职责是在下拉框命中 500 条上限时警告结果被截断。下拉框本身被 §6 取代，组件失去存在理由。删除而非保留：一个永远不会渲染的警告组件会让后人误以为仍存在截断风险。

**时区钉死不得回退：** `vitest.config.ts` 顶部的 `process.env.TZ = 'Asia/Shanghai'` 必须保留，且必须在 `defineConfig` 之前。原因见 `docs/HANDOFF.md`：在 `TZ=UTC` 下日期筛选的 bug 代码与正确代码产出字节相同，测试对 bug 全绿。

**数据库仍无法验证：** 本机无 Postgres/Docker/Supabase CLI。所有 RLS policy、trigger 状态机、RPC 均只经人工审读，从未执行。这是本次变更最大的验证缺口 —— 而这次的 SQL 是安全边界，不只是数据结构。交付时必须给出针对 RLS 的手工验收清单，且清单必须包含「用两个不同账号交叉验证互相看不到对方档案」这一项。

## 11. 错误处理

`toFriendlyError`（`src/lib/errors.ts`）需新增映射：

- RLS 拒绝（PostgREST `42501` 或空结果）→ 「无权访问该数据」
- `unique (user_id, role)` 冲突（`23505`）→ 「你已创建过该角色的档案」
- 状态机 trigger 的 `raise exception` → 直接透出 trigger 的中文消息
- 注册时邮箱已存在 → 「该邮箱已注册，请直接登录」

trigger 抛出的消息会作为 PostgREST 错误的 `message` 字段返回。这些消息是唯一会原样展示给用户的 DB 文本，因此 SQL 里必须写成中文且不含表名、列名等实现细节。

## 12. 范围边界

**不做**（YAGNI）：

- 找回密码 —— Supabase 内置，需配邮件模板，本次不接
- 管理员视图 —— 用户明确选择「真实买卖家自助」而非「混合」
- 订单大厅 / 挂单接单 —— 用户明确选择「自己下单，选对手」
- 对手方模糊搜索 —— 见 §6.2，与隐私目标冲突
- 头像、资料完整度、KYC 状态机 —— 不在需求内

**已知遗留**（承接自 `docs/HANDOFF.md`，本次不修）：

- 订单号用 UTC，日期筛选用本地时区 —— 用户已裁决保持 UTC，搜索框已有提示
- 国家字段仅由 `<select>` 约束，DB 无 CHECK
- 列表页无「操作」列

## 13. 预估规模

7 个任务：

1. `0001_init.sql` 重写：`user_id`、索引、RLS policy、`is_my_counterparty`、`lookup_counterparty`、状态机 trigger
2. `sanitizeKeyword` 移至 `src/lib/`，删除 `listCounterparties` / `buildCounterpartyQuery` / `listCounterpartyOptions` 及测试
3. `signUp` + `/register` 页面
4. `getMyProfiles` + `RequireProfile` + `/onboarding`
5. `/profile` 页面（复用 `CounterpartyForm`）
6. `lookupCounterparty` + 订单表单对手方选择重做 + 收款字段自动带出规则变更
7. `allowedTransitions` + 订单详情状态变更 UI 收紧 + 侧边栏与路由清理

任务 1 是安全边界且无法执行验证，需最高强度审读。任务 6 是逻辑最密的一个。
