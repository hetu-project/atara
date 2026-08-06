# 买卖家自助注册 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把买卖家档案的录入从「管理员后台手工建号」改为「买卖家自助注册、自己填档案、自己下单」，并重写权限模型使每个账号只能访问自己的数据。

**Architecture:** Supabase RLS 从 `using(true)` 全量开放改为按 `counterparties.user_id = auth.uid()` 隔离；订单可见性通过 `security definer` 函数反查买卖双方档案归属；对手方选择由「下拉列出全部」改为「按 `display_id` 精确查询的受限 RPC」，只返回 4 个非敏感字段；订单状态流转由「任意切换」收紧为 DB trigger 强制的状态机。

**Tech Stack:** React 18 + Vite + TypeScript + Tailwind v4 + react-router v7 + @tanstack/react-query + react-hook-form + zod + @supabase/supabase-js + Vitest + @testing-library/react

**基线：** `0fa092b`（分支 `feat/self-registration`）
**Spec：** `docs/superpowers/specs/2026-08-06-self-registration-design.md`

## Global Constraints

- 包管理器 npm；界面文案全部中文，不引入 i18n 库
- 只做浅色模式，不写任何 `dark:` 变体
- 设计 token 通过类名消费，不硬编码 hex/rgba；尺寸类用任意值写法（如 `h-[56px]`）
- 单文件不超过 200 行；commit message 用 conventional commits 前缀
- `vitest.config.ts` 顶部的 `process.env.TZ = 'Asia/Shanghai'` **必须保留且必须在 `defineConfig` 之前**。原因：`TZ=UTC` 下日期筛选的 bug 代码与正确代码产出字节相同，测试对 bug 全绿。改动或移除此行即为回归。
- `toNullablePayload`（`src/features/counterparties/api.ts:79`）的「空字符串 → null」行为不得改动。它是上一轮最终 review 修掉的 Critical（选填字段永远清不掉）的修复所在。
- 数据库从未部署过，直接修改 `supabase/migrations/0001_init.sql`，**不新增 0002 迁移**。
- 本机无 Postgres / Docker / Supabase CLI，SQL **无法执行验证**。所有 SQL 只经人工审读。
- 每个任务结束前必须跑 `npm test` 与 `npx tsc -b`，两者都必须干净。

---

### Task 1: RLS 重写与安全边界 SQL

**这是本计划唯一的安全边界，且无法执行验证。** 逐字转写，不要自行发挥。

**Files:**
- Modify: `supabase/migrations/0001_init.sql`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无（首个任务）
- Produces: DB 层契约，后续任务依赖：
  - `counterparties.user_id uuid not null default auth.uid()`，且 `unique (user_id, role)` 约束名为 `counterparties_user_id_role_key`
  - `counterparties.created_by` **已删除**
  - RPC `public.lookup_counterparty(p_display_id text)` → `table (id uuid, display_id text, role text, full_name text)`
  - 状态机 trigger 抛出的中文异常消息：`只有付款方可以标记为已付款`、`只有收款方可以确认完成`、`只有待付款的订单可以取消`、`不允许的状态变更`

- [ ] **Step 1: 修改 `counterparties` 表定义**

在 `supabase/migrations/0001_init.sql` 中，把 `counterparties` 的 `created_by` 那一行：

```sql
  created_by             uuid default auth.uid(),
```

替换为：

```sql
  -- 档案归属。自助注册模式下「谁录入的」与「档案属于谁」是同一件事，
  -- 保留两列会产生两个可能不一致的真相来源，因此取代原来的 created_by。
  -- default auth.uid() 让前端不必传；not null 让 service-role 或异常上下文
  -- 下的漏传直接失败，而不是静默写入 NULL 绕过 RLS。
  user_id                uuid not null default auth.uid()
                           references auth.users (id) on delete cascade,
```

并在同一个 `create table` 的最后一列 `updated_at ...` 之后、右括号之前加入表级约束：

```sql
  ,
  -- 一个账号每种角色最多一个档案（可同时是买家和卖家）
  constraint counterparties_user_id_role_key unique (user_id, role)
```

- [ ] **Step 2: 调整索引**

把这一行删除：

```sql
create index idx_counterparties_role       on public.counterparties (role);
```

理由：全表按 role 扫描的场景（买家列表页 / 卖家列表页）随本次变更消失。

在原位置加入：

```sql
-- orders 的 RLS policy 会通过 user_id 反查 counterparties，每次订单查询都命中
create index idx_counterparties_user_id    on public.counterparties (user_id);
```

保留 `idx_counterparties_full_name` 与 `idx_counterparties_created_at`。

- [ ] **Step 3: 提交表结构改动**

```bash
git add supabase/migrations/0001_init.sql
git commit -m "feat: counterparties 加 user_id 归属列与角色唯一约束"
```

- [ ] **Step 4: 加入归属判定函数**

在文件末尾的 `-- RLS` 段之前（即 `alter table ... enable row level security;` 那几行之前）插入：

```sql
-- ============================================================
-- 归属判定
-- ============================================================
-- security definer 是必须的：本函数会在 orders 的 policy 内被调用，
-- 而 policy 内的子查询同样受 counterparties 的 RLS 约束。普通函数在这里
-- 会因可见性递归而给出错误结果（policy 判定依赖一张正被 policy 保护的表）。
-- stable 允许 planner 在单条语句内缓存结果，避免每行重复查询。
create or replace function public.is_my_counterparty(cp_id uuid)
returns boolean language sql stable security definer
set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.counterparties
    where id = cp_id and user_id = auth.uid()
  );
$$;

-- 收款方 / 付款方的档案 id。
-- payee 取值 'buyer' | 'seller'，指明这笔钱付给谁。
-- 绝不能用 order_type 推断收款方 —— crypto 默认买家收币、fiat 默认卖家收款
-- 只是表单默认值，用户可以覆盖。必须读 payee 列。
create or replace function public.order_payee_id(o public.orders)
returns uuid language sql immutable as $$
  select case when o.payee = 'buyer' then o.buyer_id else o.seller_id end;
$$;

create or replace function public.order_payer_id(o public.orders)
returns uuid language sql immutable as $$
  select case when o.payee = 'buyer' then o.seller_id else o.buyer_id end;
$$;
```

- [ ] **Step 5: 加入状态机 trigger**

紧接 Step 4 的内容之后插入：

```sql
-- ============================================================
-- 状态流转状态机
-- ============================================================
-- 放在 trigger 而非 policy 里，是为了能给出具体的中文原因。
-- policy 违规返回空结果集或通用权限错误，用户只会看到"更新了 0 行"。
--
-- 下面 raise exception 的消息是唯一会原样展示给最终用户的 DB 文本
-- （前端 toFriendlyError 直接透出），因此必须是中文且不含表名列名。
--
-- 同一账号可能同时持有买家和卖家档案，此时自己跟自己下单会让两个判定
-- 同时为真、任何转移都被允许。数据都是他自己的，不构成安全问题，不额外拦截。
create or replace function public.check_status_transition()
returns trigger language plpgsql security definer
set search_path = public, pg_temp as $$
declare
  is_payee boolean := public.is_my_counterparty(public.order_payee_id(new));
  is_payer boolean := public.is_my_counterparty(public.order_payer_id(new));
begin
  if new.status = old.status then
    return new;
  end if;

  if new.status = 'paid' then
    if old.status <> 'pending_payment' then
      raise exception '不允许的状态变更';
    end if;
    if not is_payer then
      raise exception '只有付款方可以标记为已付款';
    end if;

  elsif new.status = 'completed' then
    if old.status <> 'paid' then
      raise exception '不允许的状态变更';
    end if;
    if not is_payee then
      raise exception '只有收款方可以确认完成';
    end if;

  elsif new.status = 'cancelled' then
    if old.status <> 'pending_payment' then
      raise exception '只有待付款的订单可以取消';
    end if;
    if not (is_payer or is_payee) then
      raise exception '不允许的状态变更';
    end if;

  else
    raise exception '不允许的状态变更';
  end if;

  return new;
end;
$$;

-- 必须在 trg_order_status_log_update 之前执行：本 trigger 拒绝时应当
-- 阻止日志写入。同为 before/after 时 PostgreSQL 按名称字母序执行，
-- 而 log_order_status 是 after update、check 是 before update，
-- before 总在 after 之前，因此顺序天然正确。
create trigger trg_order_check_status
  before update of status on public.orders
  for each row execute function public.check_status_transition();
```

- [ ] **Step 6: 加入对手方查询 RPC**

紧接 Step 5 的内容之后插入：

```sql
-- ============================================================
-- 对手方查询
-- ============================================================
-- 创建订单需要指定对手方，但 RLS 只让用户看到自己的档案。
-- 这个 RPC 是唯一的例外通道，三重约束：
--   1. 只返回 4 个字段 —— 身份证号、出生日期、银行账号、钱包地址都不在内。
--      这是硬约束：即使前端有 bug 也无法泄漏。**永远不要往返回列表里加字段。**
--   2. 精确匹配，无 like —— 不能用来枚举用户。
--   3. 只授权 authenticated —— 未登录不可调用。
--
-- display_id 形如 U000123，理论上可暴力枚举。这是已接受的风险：
-- 枚举结果只有姓名，而姓名在交易场景下本就要相互告知。真实防护在于
-- 返回字段的选择，不在于 ID 不可猜。
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

- [ ] **Step 7: 重写 RLS policy 段**

把文件末尾整个 RLS 段（从 `-- RLS：登录用户可全量读写` 的注释块开始，到 `commit;` 之前的全部内容）替换为：

```sql
-- ============================================================
-- RLS：每个账号只能访问自己的数据
-- ============================================================
alter table public.counterparties    enable row level security;
alter table public.orders            enable row level security;
alter table public.order_status_logs enable row level security;
alter table public.order_no_counters enable row level security;

-- using 管住读/改/删的可见行，with check 防止插入或改写为他人的 user_id
create policy "own profiles" on public.counterparties
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 自己是买方或卖方即可见
create policy "my orders read" on public.orders
  for select to authenticated
  using (
    public.is_my_counterparty(buyer_id) or public.is_my_counterparty(seller_id)
  );

create policy "my orders insert" on public.orders
  for insert to authenticated
  with check (
    public.is_my_counterparty(buyer_id) or public.is_my_counterparty(seller_id)
  );

-- policy 只管"能不能改这一行"，状态转移的合法性由
-- trg_order_check_status trigger 强制（那里能给出具体中文原因）
create policy "my orders update" on public.orders
  for update to authenticated
  using (
    public.is_my_counterparty(buyer_id) or public.is_my_counterparty(seller_id)
  )
  with check (
    public.is_my_counterparty(buyer_id) or public.is_my_counterparty(seller_id)
  );

-- 刻意不给 DELETE policy：订单不允许删除，只能取消。

-- 外层列必须写成表限定的 public.order_status_logs.order_id。
-- 裸写 order_id 依赖"子查询里的 orders 没有同名列"这一巧合来正确解析；
-- 日后给 orders 加一个 order_id 列，谓词会静默变成 o.order_id = o.order_id
-- （恒真），把全部日志暴露给所有登录用户。
--
-- 无需重复表达可见性条件：orders 的 SELECT policy 会自动作用于这个子查询，
-- 能看到订单即能看到其日志。
create policy "my order logs" on public.order_status_logs
  for select to authenticated
  using (
    exists (
      select 1 from public.orders o
      where o.id = public.order_status_logs.order_id
    )
  );

-- order_no_counters 刻意不给任何 policy：
-- 它只被 set_order_no（security definer，以属主身份运行）读写，
-- 任何前端角色都不该碰它。开 RLS 且无 policy = 对 anon/authenticated 完全关闭。
```

- [ ] **Step 8: 人工审读 SQL（无法执行，这是唯一关卡）**

逐项对照检查，把结论写进任务报告：

1. `begin;` / `commit;` 仍然包裹全部语句
2. 所有 `$$ ... $$` 成对
3. `is_my_counterparty` 定义在它被首次引用（RLS policy 段）之前
4. `order_payee_id` / `order_payer_id` 定义在 `check_status_transition` 之前
5. `check_status_transition` 的四个分支（paid / completed / cancelled / else）都有 `raise exception` 或正常返回
6. 三个 `security definer` 函数都有 `set search_path = public, pg_temp`
7. `counterparties` 里已无 `created_by`，`orders` 里的 `created_by` **仍保留**
8. `grep -c "created_by" supabase/migrations/0001_init.sql` 的结果应为 1（只剩 orders 那一处）

- [ ] **Step 9: 更新 README**

`README.md` 的 `## Supabase 接入（四步）` 是一个 `1. / 2. / 3. / 4.` 的有序列表。
把**第 3 项整项**（现内容为「关掉 Enable Sign Ups ... Add user 手工创建账号」）
替换为下面这一项。**保持列表项格式 `3. `，不要用 `###` 标题**，缩进续行对齐 3 个空格，
与相邻的第 2、4 项一致。第 4 项（Project Settings → API 那项）原样保留、不要动，
标题里的「四步」也不变（仍是四步）。

注意第 3 项原文要求关掉 Enable Sign Ups —— 本次变更开放自助注册，这一句必须消失，
否则 README 会与 `/register` 功能直接矛盾。

```markdown
3. 打开 **Authentication → URL Configuration**，把 **Site URL** 设为应用地址
   （本地开发填 `http://localhost:5173`），否则验证邮件里的链接会指向错误地址。

   用户在应用内自助注册（`/register`），无需在后台手工建号；
   **Enable Sign Ups 必须保持开启**。

   **邮箱验证默认开启**，注册后需点邮件里的链接才能登录。
   如需关闭：**Authentication → Providers → Email** → 取消 **Confirm email**。
   前端两种配置都能正常工作，不需要改代码。
```

并在 README 中新增一节：

```markdown
## 权限模型

每个账号只能访问自己的数据：

- **档案**：只能增删改查自己的（`counterparties.user_id = auth.uid()`）
- **订单**：只能看自己是买方或卖方的
- **状态流转**：付款方可标「已付款」，收款方可标「已完成」，待付款下双方可取消。
  由数据库 trigger 强制，前端只是灰掉按钮。

对手方通过 `display_id`（形如 `U000123`）精确查询，只返回 ID、角色、姓名 —— 
身份证号和银行账号在数据库层面就拿不到。把自己的 `display_id` 线下告诉交易对手。
```

- [ ] **Step 10: 提交**

```bash
git add supabase/migrations/0001_init.sql README.md
git commit -m "feat: RLS 按账号隔离、状态机 trigger 与对手方查询 RPC"
```

---

### Task 2: 清理全量列表数据层

删除 RLS 收紧后会**静默返回空结果**的查询函数。静默失败比报错难查，因此删除而非修改。

**Files:**
- Create: `src/lib/sanitizeKeyword.ts`
- Create: `src/lib/__tests__/sanitizeKeyword.test.ts`
- Delete: `src/features/counterparties/CounterpartyListPage.tsx`
- Delete: `src/features/orders/CounterpartyOptionNotice.tsx`
- Delete: `src/features/orders/__tests__/CounterpartyOptionNotice.test.tsx`
- Modify: `src/features/counterparties/api.ts`
- Modify: `src/features/counterparties/hooks.ts`
- Modify: `src/features/counterparties/__tests__/api.test.ts`
- Modify: `src/features/orders/api.ts`

**Interfaces:**
- Consumes: 无（不依赖 Task 1 的 SQL）
- Produces:
  - `sanitizeKeyword(raw: string | undefined): string` 从 `@/lib/sanitizeKeyword` 导出
  - `src/features/counterparties/api.ts` 保留导出：`getCounterparty`、`createCounterparty`、`updateCounterparty`、`toNullablePayload`、`ListParams`
  - **已删除**：`listCounterparties`、`buildCounterpartyQuery`、`listCounterpartyOptions`、`CounterpartyOption`、`OPTION_SELECT`、`sanitizeKeyword`（迁出）

- [ ] **Step 1: 把 sanitizeKeyword 的测试移到新位置**

`sanitizeKeyword` 当前定义在 `counterparties/api.ts:21`，被 `orders/api.ts` 导入用于订单列表搜索。它随 `buildCounterpartyQuery` 删除会断链，因此先迁出。

创建 `src/lib/__tests__/sanitizeKeyword.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { sanitizeKeyword } from '@/lib/sanitizeKeyword';

describe('sanitizeKeyword', () => {
  it('undefined 与空串返回空串', () => {
    expect(sanitizeKeyword(undefined)).toBe('');
    expect(sanitizeKeyword('')).toBe('');
  });

  it('去掉首尾空格', () => {
    expect(sanitizeKeyword('  张三  ')).toBe('张三');
  });

  it('剥掉会破坏 PostgREST or 语法的字符', () => {
    expect(sanitizeKeyword('a(b)c,d"e\\f')).toBe('abcdef');
  });

  it('保留中文与常规字符', () => {
    expect(sanitizeKeyword('张三 U000123')).toBe('张三 U000123');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/__tests__/sanitizeKeyword.test.ts`
Expected: FAIL —— `Failed to resolve import "@/lib/sanitizeKeyword"`

- [ ] **Step 3: 创建 sanitizeKeyword 模块**

创建 `src/lib/sanitizeKeyword.ts`：

```typescript
/**
 * 清洗搜索关键词。
 *
 * 剥掉 ( ) , " \ 这几个字符：它们是 PostgREST `or=(...)` 过滤语法的
 * 结构字符，原样传入会让后端返回语法错误，而那个错误消息会带上
 * 内部的列名与查询结构泄漏给用户。
 */
export function sanitizeKeyword(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/[(),"\\]/g, '').trim();
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/__tests__/sanitizeKeyword.test.ts`
Expected: PASS，4 个用例全绿

- [ ] **Step 5: 从 counterparties/api.ts 删除全量查询**

在 `src/features/counterparties/api.ts` 中删除以下内容：

- `sanitizeKeyword` 函数定义（已迁至 `@/lib/sanitizeKeyword`）
- `buildCounterpartyQuery` 函数
- `listCounterparties` 函数
- `OPTION_SELECT` 常量及其上方的注释块
- `CounterpartyOption` 类型
- `listCounterpartyOptions` 函数
- 因上述删除而不再使用的 import（`Role` 可能变为未使用 —— 由 `tsc -b` 报出）

保留 `ListParams` 接口（订单列表的 `ListParams` 是独立定义在 `orders/api.ts` 的；此处若确认无任何引用则一并删除，由 `tsc -b` 判定）。

保留：`getCounterparty`、`toNullablePayload`、`createCounterparty`、`updateCounterparty`。

**`toNullablePayload` 的行为不得改动** —— 见 Global Constraints。

- [ ] **Step 6: 修正 orders/api.ts 的 import**

在 `src/features/orders/api.ts` 中，把从 `@/features/counterparties/api` 导入 `sanitizeKeyword` 的那一行改为：

```typescript
import { sanitizeKeyword } from '@/lib/sanitizeKeyword';
```

若该文件同时从 counterparties/api 导入了其他仍存在的符号，保留那部分 import。

- [ ] **Step 7: 清理 hooks 与被删页面的引用**

在 `src/features/counterparties/hooks.ts` 中删除 `useCounterpartyList`、`useCounterpartyOptions` 及其 query key 定义（保留 `useCounterparty`、`useCreateCounterparty`、`useUpdateCounterparty` 等仍在用的）。具体名称以文件实际内容为准，判据是：**任何调用已删除 api 函数的 hook 都要删掉**。

删除文件：

```bash
git rm src/features/counterparties/CounterpartyListPage.tsx
git rm src/features/orders/CounterpartyOptionNotice.tsx
git rm src/features/orders/__tests__/CounterpartyOptionNotice.test.tsx
```

`CounterpartyOptionNotice` 的唯一职责是在下拉框命中 500 条上限时警告结果被截断。下拉框被 Task 6 取代，组件失去存在理由。删除而非保留：一个永远不会渲染的警告组件会让后人误以为仍存在截断风险。

- [ ] **Step 8: 从 api.test.ts 删除对应用例**

在 `src/features/counterparties/__tests__/api.test.ts` 中删除全部 `buildCounterpartyQuery` 与 `sanitizeKeyword` 相关的 describe / it 块。若删完后整个文件不再有任何用例，则 `git rm` 掉该文件。

`sanitizeKeyword` 的测试已在 Step 1 迁至 `src/lib/__tests__/sanitizeKeyword.test.ts`，不要在两处重复。

- [ ] **Step 9: 临时处理 routes.tsx 与 OrderForm 的编译错误**

`routes.tsx` 引用了已删除的 `CounterpartyListPage`，`OrderForm.tsx` 引用了已删除的 `useCounterpartyOptions` 与 `CounterpartyOptionNotice`。这两处的正式改造分别在 Task 7 与 Task 6。

本任务只做**让编译通过的最小改动**：

在 `src/routes.tsx` 中，把 `/buyers` 与 `/sellers` 两条列表路由整行删除（保留 `/buyers/new`、`/buyers/:id`、`/sellers/new`、`/sellers/:id`，它们在 Task 7 才被 `/profile` 取代），并删除 `CounterpartyListPage` 的 import。

在 `src/features/orders/OrderForm.tsx` 中：
- 删除 `useCounterpartyOptions`、`CounterpartyOption`、`CounterpartyOptionNotice` 三个 import
- 删除 `const buyers = ...` / `const sellers = ...` 两行
- 删除 `toOptions` 函数
- 把买家/卖家两个 `<Select>` 暂时换成 `<Input {...register('buyer_id')} placeholder="买家档案 ID" />` 与 `seller_id` 同理
- 删除渲染 `CounterpartyOptionNotice` 的那个 `<div className="col-span-2 ...">` 块
- 删除 auto-fill `useEffect` 整块，以及 `payeeDefaults` 的 import

**注意**：那个 `useEffect` 上方的长注释描述的安全前提是「路由一次只挂载一个页面，/buyers、/sellers 与本表单互斥」。买卖家列表页在本任务中被删除，该注释描述的机制已不存在，因此注释随 effect 一并删除，不要保留。

- [ ] **Step 10: 运行全部测试与类型检查**

Run: `npm test`
Expected: 全绿。相比基线，`CounterpartyOptionNotice` 与 `buildCounterpartyQuery` 的用例数减少，`sanitizeKeyword` 的 4 个用例出现在新位置。

Run: `npx tsc -b`
Expected: 无输出。若报未使用的 import 或未使用的变量，删掉它们再跑。

把两条命令的实际用例数写进任务报告。

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "refactor: 删除全量列表查询，sanitizeKeyword 迁至 lib"
```

---

### Task 3: 注册功能与错误映射

**Files:**
- Create: `src/features/auth/RegisterPage.tsx`
- Modify: `src/features/auth/useSession.ts`
- Modify: `src/features/auth/LoginPage.tsx`
- Modify: `src/lib/errors.ts`
- Modify: `src/lib/__tests__/errors.test.ts`
- Modify: `src/routes.tsx`

**Interfaces:**
- Consumes: Task 1 的 `counterparties_user_id_role_key` 约束名
- Produces:
  - `signUp(email: string, password: string): Promise<{ needsEmailConfirm: boolean }>` from `@/features/auth/useSession`
  - `RegisterPage` 默认导出，路由 `/register`

- [ ] **Step 1: 为错误映射写失败测试**

在 `src/lib/__tests__/errors.test.ts` 的末尾追加：

```typescript
describe('toFriendlyError —— 自助注册相关', () => {
  it('角色档案重复给出具体原因，而非通用的数据重复', () => {
    const err = {
      code: '23505',
      message: 'duplicate key value violates unique constraint "counterparties_user_id_role_key"',
    };
    expect(toFriendlyError(err).message).toBe('你已创建过该角色的档案');
  });

  it('其他 23505 冲突仍走通用文案', () => {
    const err = { code: '23505', message: 'duplicate key value violates unique constraint "orders_order_no_key"' };
    expect(toFriendlyError(err).message).toBe('数据重复，请重试');
  });

  it('RLS 拒绝给出无权访问', () => {
    expect(toFriendlyError({ code: '42501', message: 'permission denied' }).message).toBe('无权访问该数据');
  });

  it('邮箱已注册', () => {
    expect(toFriendlyError({ message: 'User already registered' }).message).toBe('该邮箱已注册，请直接登录');
  });

  it('未验证邮箱的提示指向邮件，不再指向管理员', () => {
    expect(toFriendlyError({ message: 'Email not confirmed' }).message).toBe('邮箱尚未验证，请查收验证邮件');
  });

  it('状态机 trigger 的中文消息原样透出', () => {
    expect(toFriendlyError({ code: 'P0001', message: '只有收款方可以确认完成' }).message).toBe(
      '只有收款方可以确认完成',
    );
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/lib/__tests__/errors.test.ts`
Expected: FAIL。第一个用例拿到「数据重复，请重试」而非「你已创建过该角色的档案」；`42501` 与 `User already registered` 走到兜底分支。

- [ ] **Step 3: 修改 errors.ts**

`23505` 在 `PG_CODE_MESSAGES` 里已被占用为通用文案，且它的检查早于 `MESSAGE_MAP`，所以不能靠加正则解决 —— 必须在码表命中之前先按约束名判定。

把 `src/lib/errors.ts` 整体替换为：

```typescript
const PG_CODE_MESSAGES: Record<string, string> = {
  '23505': '数据重复，请重试',
  '23514': '填写的内容不符合规则，请检查后重试',
  '42501': '无权访问该数据',
};

/**
 * 按约束名给出具体文案。
 *
 * 必须在 PG_CODE_MESSAGES 之前判定：23505 已被占用为通用的"数据重复"，
 * 而 unique (user_id, role) 冲突需要一句用户能看懂的话。
 */
const CONSTRAINT_MESSAGES: Array<[string, string]> = [
  ['counterparties_user_id_role_key', '你已创建过该角色的档案'],
];

const MESSAGE_MAP: Array<[RegExp, string]> = [
  [/Invalid login credentials/i, '邮箱或密码不正确'],
  [/Email not confirmed/i, '邮箱尚未验证，请查收验证邮件'],
  [/User already registered/i, '该邮箱已注册，请直接登录'],
  [/Password should be at least/i, '密码至少 6 位'],
  [/Failed to fetch|NetworkError/i, '网络异常，请检查网络后重试'],
  [/JWT expired|token is expired/i, '登录已过期，请重新登录'],
];

export function toFriendlyError(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error('操作失败，请稍后重试');

  const e = error as { code?: string; message?: string };

  if (e.message) {
    for (const [constraint, text] of CONSTRAINT_MESSAGES) {
      if (e.message.includes(constraint)) return new Error(text);
    }
  }

  if (e.code && PG_CODE_MESSAGES[e.code]) return new Error(PG_CODE_MESSAGES[e.code]);

  if (e.message) {
    for (const [pattern, text] of MESSAGE_MAP) {
      if (pattern.test(e.message)) return new Error(text);
    }
    // 兜底原样透出。状态机 trigger 抛出的中文消息（P0001）走这条路径 ——
    // 那些消息是刻意写成中文、不含表名列名的，就是为了直接展示给用户。
    return new Error(e.message);
  }

  return new Error('操作失败，请稍后重试');
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/lib/__tests__/errors.test.ts`
Expected: PASS，含原有用例与新增 6 个用例。

- [ ] **Step 5: 加入 signUp**

在 `src/features/auth/useSession.ts` 的 `signIn` 之后加入：

```typescript
/**
 * 注册。
 *
 * 返回 needsEmailConfirm 让调用方区分两种 Supabase 配置：
 * - 开启邮箱验证（默认）：data.session 为 null，用户需先点邮件链接
 * - 关闭邮箱验证：data.session 已就绪，可直接进应用
 *
 * 两种配置都能正常工作，切换配置不需要改代码。
 */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsEmailConfirm: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return { needsEmailConfirm: !data.session };
}
```

- [ ] **Step 6: 创建注册页**

创建 `src/features/auth/RegisterPage.tsx`：

```tsx
import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router';
import { signUp, useSession } from './useSession';
import { toFriendlyError } from '@/lib/errors';

const INPUT_CLASS =
  'rounded-input border-line-strong transition-base h-[56px] w-full border bg-white px-4 outline-none focus:border-black';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { session, loading } = useSession();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return <div className="text-ink-4 flex h-full items-center justify-center text-sm">加载中...</div>;
  }
  if (session) return <Navigate to="/orders" replace />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirm) {
      setError('两次输入的密码不一致');
      return;
    }
    setSubmitting(true);
    try {
      const { needsEmailConfirm } = await signUp(email.trim(), password);
      if (needsEmailConfirm) setSent(true);
      else navigate('/onboarding', { replace: true });
    } catch (err) {
      setError(toFriendlyError(err).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="flex min-h-full items-center justify-center px-6 py-16">
        <div className="rounded-card bg-surface w-[475px] max-w-full p-[34px] text-center">
          <h1 className="mb-4 text-[30px] leading-[38px] font-semibold">请查收验证邮件</h1>
          <p className="text-ink-3 mb-8 text-sm">
            我们已向 {email.trim()} 发送验证邮件，点击邮件中的链接完成注册后即可登录。
          </p>
          <Link to="/login" className="text-sm font-semibold underline">
            返回登录
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-full items-center justify-center px-6 py-16">
      <form onSubmit={handleSubmit} className="rounded-card bg-surface w-[475px] max-w-full p-[34px]">
        <h1 className="mb-[30px] text-center text-[30px] leading-[38px] font-semibold">注册</h1>

        <input
          className={INPUT_CLASS}
          type="email"
          autoComplete="username"
          placeholder="请输入邮箱"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          className={`${INPUT_CLASS} mt-4`}
          type="password"
          autoComplete="new-password"
          placeholder="请设置密码（至少 6 位）"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <input
          className={`${INPUT_CLASS} mt-4`}
          type="password"
          autoComplete="new-password"
          placeholder="请再次输入密码"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />

        <p className="text-danger min-h-[34px] px-2 py-[10px] text-xs">{error}</p>

        <button
          type="submit"
          disabled={!email || !password || !confirm || submitting}
          className="rounded-pill bg-primary hover:bg-primary-hover transition-base h-[56px] w-full text-base font-semibold text-black disabled:cursor-not-allowed disabled:bg-primary-disabled disabled:text-black/30"
        >
          {submitting ? '注册中...' : '注册'}
        </button>

        <p className="text-ink-3 mt-5 text-center text-xs">
          已有账号？
          <Link to="/login" className="ml-1 font-semibold text-black underline">
            去登录
          </Link>
        </p>
      </form>
    </div>
  );
}
```

- [ ] **Step 7: 登录页加注册入口**

在 `src/features/auth/LoginPage.tsx` 中：

把 `import { Navigate, useNavigate } from 'react-router';` 改为 `import { Link, Navigate, useNavigate } from 'react-router';`

在提交按钮的 `</button>` 之后、`</form>` 之前插入：

```tsx
        <p className="text-ink-3 mt-5 text-center text-xs">
          还没有账号？
          <Link to="/register" className="ml-1 font-semibold text-black underline">
            去注册
          </Link>
        </p>
```

- [ ] **Step 8: 注册路由**

在 `src/routes.tsx` 中加入 `RegisterPage` 的 import，并在 `{ path: '/login', ... }` 之后加入：

```tsx
  { path: '/register', element: <RegisterPage /> },
```

- [ ] **Step 9: 全部测试与类型检查**

Run: `npm test`
Expected: 全绿

Run: `npx tsc -b`
Expected: 无输出

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "feat: 自助注册页与错误映射"
```

---

### Task 4: 我的档案数据层与引导守卫

**Files:**
- Create: `src/features/counterparties/myProfiles.ts`
- Create: `src/features/counterparties/__tests__/myProfiles.test.ts`
- Create: `src/features/auth/RequireProfile.tsx`
- Create: `src/features/auth/__tests__/RequireProfile.test.tsx`
- Modify: `src/features/counterparties/api.ts`
- Modify: `src/features/counterparties/hooks.ts`

**Interfaces:**
- Consumes: Task 1 的 `counterparties.user_id`；Task 2 清理后的 `api.ts`
- Produces:
  - `getMyProfiles(): Promise<Counterparty[]>` from `@/features/counterparties/api`
  - `useMyProfiles()` from `@/features/counterparties/hooks`，query key `counterpartyKeys.mine`（= `['counterparties', 'mine']`）
  - `pickProfile(rows: Counterparty[] | undefined, role: Role): Counterparty | undefined` from `@/features/counterparties/myProfiles`
  - `needsOnboarding(rows: Counterparty[] | undefined): boolean` from 同上
  - `RequireProfile` 默认导出

- [ ] **Step 1: 为纯函数写失败测试**

创建 `src/features/counterparties/__tests__/myProfiles.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { needsOnboarding, pickProfile } from '../myProfiles';
import type { Counterparty } from '@/lib/schema';

function cp(role: 'buyer' | 'seller', displayId: string): Counterparty {
  return { id: `id-${displayId}`, display_id: displayId, role, full_name: '张三' } as Counterparty;
}

describe('pickProfile', () => {
  it('按角色取出档案', () => {
    const rows = [cp('buyer', 'U000001'), cp('seller', 'U000002')];
    expect(pickProfile(rows, 'buyer')?.display_id).toBe('U000001');
    expect(pickProfile(rows, 'seller')?.display_id).toBe('U000002');
  });

  it('该角色无档案时返回 undefined', () => {
    expect(pickProfile([cp('buyer', 'U000001')], 'seller')).toBeUndefined();
  });

  it('undefined 输入返回 undefined，不抛错', () => {
    expect(pickProfile(undefined, 'buyer')).toBeUndefined();
  });
});

describe('needsOnboarding', () => {
  it('数据未加载时不判定需要引导', () => {
    // undefined 表示"还不知道"，不能据此重定向 —— 否则加载期间会闪一下 /onboarding
    expect(needsOnboarding(undefined)).toBe(false);
  });

  it('空数组表示确实没有任何档案', () => {
    expect(needsOnboarding([])).toBe(true);
  });

  it('有任一档案即不需要引导', () => {
    expect(needsOnboarding([cp('seller', 'U000002')])).toBe(false);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/features/counterparties/__tests__/myProfiles.test.ts`
Expected: FAIL —— 无法解析 `../myProfiles`

- [ ] **Step 3: 实现纯函数**

创建 `src/features/counterparties/myProfiles.ts`：

```typescript
import type { Counterparty, Role } from '@/lib/schema';

export function pickProfile(
  rows: Counterparty[] | undefined,
  role: Role,
): Counterparty | undefined {
  return rows?.find((r) => r.role === role);
}

/**
 * 是否需要走引导流程。
 *
 * undefined 表示数据还没加载完 —— 此时必须返回 false。
 * 若把"还不知道"当成"没有档案"，用户每次刷新都会先闪一下 /onboarding。
 */
export function needsOnboarding(rows: Counterparty[] | undefined): boolean {
  return rows !== undefined && rows.length === 0;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/features/counterparties/__tests__/myProfiles.test.ts`
Expected: PASS，6 个用例

- [ ] **Step 5: 加入 getMyProfiles**

在 `src/features/counterparties/api.ts` 中加入（放在 `getCounterparty` 附近）：

```typescript
/**
 * 当前用户的全部档案（0-2 条：最多一个买家 + 一个卖家）。
 *
 * 不需要 .eq('user_id', ...) —— RLS 的 own profiles policy 已保证
 * 只返回 user_id = auth.uid() 的行。在这里重复过滤会造成
 * "安全依赖前端条件"的错觉，实际的保证在数据库里。
 */
export async function getMyProfiles(): Promise<Counterparty[]> {
  const { data, error } = await supabase
    .from('counterparties')
    .select('*')
    .order('role', { ascending: true });
  if (error) throw toFriendlyError(error);
  return (data ?? []) as Counterparty[];
}
```

- [ ] **Step 6: 加入 useMyProfiles hook**

该文件用 `counterpartyKeys` 集中管理 query key，**不要裸写数组字面量**。

在 `counterpartyKeys` 中加入 `mine`，并删除已随 Task 2 消失的 `list` 与 `options`：

```typescript
export const counterpartyKeys = {
  all: ['counterparties'] as const,
  mine: ['counterparties', 'mine'] as const,
  detail: (id: string) => ['counterparties', 'detail', id] as const,
};
```

加入 hook：

```typescript
export function useMyProfiles() {
  return useQuery({
    queryKey: counterpartyKeys.mine,
    queryFn: getMyProfiles,
  });
}
```

并把 `getMyProfiles` 加入该文件顶部从 `./api` 的 import 列表，同时删掉已不存在的 `listCounterparties`、`listCounterpartyOptions`、`ListParams` 的 import（Task 2 若已清理则跳过）。

现有的档案增改 mutation 调 `invalidateQueries({ queryKey: counterpartyKeys.all })`，而 `counterpartyKeys.mine` 以它为前缀，因此新建档案后这个 query 会自动刷新，不需要额外处理。

- [ ] **Step 6b: 修正 toFormValues 的跳过列表**

`src/features/counterparties/CounterpartyFormPage.tsx:14` 的 `toFormValues` 会跳过非表单列，列表里写的是 `created_by` —— 那一列已被 Task 1 删除，换成了 `user_id`。不改的话 `user_id` 会被塞进表单默认值，随提交回写。

把该行的 `k === 'created_by'` 改为 `k === 'user_id'`。

- [ ] **Step 7: 为守卫写失败测试**

创建 `src/features/auth/__tests__/RequireProfile.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import RequireProfile from '../RequireProfile';

const mockUseMyProfiles = vi.fn();
vi.mock('@/features/counterparties/hooks', () => ({
  useMyProfiles: () => mockUseMyProfiles(),
}));

function renderAt(path: string) {
  const router = createMemoryRouter(
    [
      {
        element: <RequireProfile />,
        children: [
          { path: '/orders', element: <div>订单页</div> },
          { path: '/onboarding', element: <div>引导页</div> },
        ],
      },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
}

describe('RequireProfile', () => {
  beforeEach(() => mockUseMyProfiles.mockReset());

  it('无任何档案时重定向到引导页', () => {
    mockUseMyProfiles.mockReturnValue({ data: [], isPending: false });
    renderAt('/orders');
    expect(screen.getByText('引导页')).toBeInTheDocument();
  });

  it('有档案时放行', () => {
    mockUseMyProfiles.mockReturnValue({ data: [{ role: 'buyer' }], isPending: false });
    renderAt('/orders');
    expect(screen.getByText('订单页')).toBeInTheDocument();
  });

  it('已经在引导页时不再重定向（否则无限循环）', () => {
    mockUseMyProfiles.mockReturnValue({ data: [], isPending: false });
    renderAt('/onboarding');
    expect(screen.getByText('引导页')).toBeInTheDocument();
  });

  it('加载中显示占位，不重定向', () => {
    mockUseMyProfiles.mockReturnValue({ data: undefined, isPending: true });
    renderAt('/orders');
    expect(screen.getByText('加载中...')).toBeInTheDocument();
    expect(screen.queryByText('引导页')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 8: 运行测试确认失败**

Run: `npx vitest run src/features/auth/__tests__/RequireProfile.test.tsx`
Expected: FAIL —— 无法解析 `../RequireProfile`

- [ ] **Step 9: 实现守卫**

创建 `src/features/auth/RequireProfile.tsx`：

```tsx
import { Navigate, Outlet, useLocation } from 'react-router';
import { useMyProfiles } from '@/features/counterparties/hooks';
import { needsOnboarding } from '@/features/counterparties/myProfiles';

const ONBOARDING_PATH = '/onboarding';

export default function RequireProfile() {
  const { data, isPending } = useMyProfiles();
  const location = useLocation();

  if (isPending) {
    return <div className="text-ink-4 flex h-full items-center justify-center text-sm">加载中...</div>;
  }

  // 引导页自身必须放行，否则"没有档案 → 去引导页 → 仍然没有档案 → 去引导页"无限循环
  if (needsOnboarding(data) && location.pathname !== ONBOARDING_PATH) {
    return <Navigate to={ONBOARDING_PATH} replace />;
  }

  return <Outlet />;
}
```

- [ ] **Step 10: 运行测试确认通过**

Run: `npx vitest run src/features/auth/__tests__/RequireProfile.test.tsx`
Expected: PASS，4 个用例

- [ ] **Step 11: 全部测试与类型检查**

Run: `npm test`
Expected: 全绿

Run: `npx tsc -b`
Expected: 无输出

- [ ] **Step 12: 提交**

```bash
git add -A
git commit -m "feat: 我的档案数据层与引导守卫"
```

---

### Task 5: 引导页与我的档案页

**Files:**
- Create: `src/features/counterparties/OnboardingPage.tsx`
- Create: `src/features/counterparties/MyProfilePage.tsx`
- Create: `src/features/counterparties/ProfileCard.tsx`
- Modify: `src/features/counterparties/CounterpartyFormPage.tsx`

**Interfaces:**
- Consumes: Task 4 的 `useMyProfiles`、`pickProfile`；现有的 `CounterpartyForm`、`useCreateCounterparty`、`useUpdateCounterparty`
- Produces:
  - `OnboardingPage` 默认导出，路由 `/onboarding`
  - `MyProfilePage` 默认导出，路由 `/profile`
  - `ProfileCard` 具名 props：`{ profile: Counterparty | undefined; role: Role }`

- [ ] **Step 1: 让 CounterpartyFormPage 的跳转路径可注入**

现有组件把成功后的跳转硬编码为 `/buyers/:id` 或 `/sellers/:id`（`basePath` 变量），那两个路由在 Task 7 会消失。同时它的「返回列表」按钮指向即将删除的列表页。

在 `src/features/counterparties/CounterpartyFormPage.tsx` 中：

把组件签名改为：

```tsx
export default function CounterpartyFormPage({
  role,
  mode,
  profileId,
}: {
  role: Role;
  mode: 'create' | 'edit';
  /** edit 模式下要编辑的档案 id。省略时回退到路由参数 :id */
  profileId?: string;
}) {
```

把 `const { id } = useParams<{ id: string }>();` 之后紧接一行：

```tsx
  const id = profileId ?? routeId;
```

并把上面那行改为 `const { id: routeId } = useParams<{ id: string }>();`

删除 `const basePath = ...` 那一行。

把 `navigate(\`${basePath}/${row.id}\`, { replace: true })` 改为：

```tsx
          navigate('/profile', { replace: true });
```

把 `actions={...}` 整块中的 Button 改为：

```tsx
          <Button variant="second" onClick={() => navigate('/profile')}>
            返回我的档案
          </Button>
```

- [ ] **Step 2: 创建档案卡片组件**

创建 `src/features/counterparties/ProfileCard.tsx`：

```tsx
import { Link } from 'react-router';
import { Badge, Button } from '@/components/ui';
import { formatDateTime, ROLE_LABEL } from '@/lib/format';
import type { Counterparty, Role } from '@/lib/schema';

export default function ProfileCard({ profile, role }: { profile: Counterparty | undefined; role: Role }) {
  const label = ROLE_LABEL[role];
  const createPath = role === 'buyer' ? '/profile/buyer/new' : '/profile/seller/new';
  const editPath = role === 'buyer' ? '/profile/buyer' : '/profile/seller';

  if (!profile) {
    return (
      <div className="rounded-card bg-surface flex flex-col items-start gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">{label}档案</h2>
          <p className="text-ink-3 mt-1 text-sm">尚未创建。创建后会得到一个用户 ID，用于让交易对手找到你。</p>
        </div>
        <Link to={createPath}>
          <Button>创建{label}档案</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{label}档案</h2>
        <Badge tone="success">已创建</Badge>
      </div>

      <div className="mb-5 flex flex-wrap gap-x-10 gap-y-2 text-sm">
        <span>
          用户 ID <b className="ml-2 tracking-wide">{profile.display_id}</b>
        </span>
        <span>
          姓名 <b className="ml-2">{profile.full_name}</b>
        </span>
        <span className="text-ink-3">创建于 {formatDateTime(profile.created_at)}</span>
      </div>

      <Link to={editPath}>
        <Button variant="second">查看 / 编辑</Button>
      </Link>
    </div>
  );
}
```

`Badge` 的 props 是 `tone`，`success` 是合法取值（已核对 `src/components/ui/Badge.tsx:13`）。

- [ ] **Step 3: 创建我的档案页**

创建 `src/features/counterparties/MyProfilePage.tsx`：

```tsx
import PageHeader from '@/components/PageHeader';
import { useMyProfiles } from './hooks';
import { pickProfile } from './myProfiles';
import ProfileCard from './ProfileCard';

export default function MyProfilePage() {
  const { data, isPending, isError, error } = useMyProfiles();

  if (isPending) return <div className="text-ink-4 text-sm">加载中...</div>;
  if (isError) return <div className="text-danger text-sm">加载失败：{(error as Error).message}</div>;

  return (
    <>
      <PageHeader title="我的档案" />
      <p className="text-ink-3 mb-5 max-w-[760px] text-sm">
        买家和卖家档案各自独立。你可以只创建一个，也可以两个都建 —— 
        既作为买家下单，也作为卖家收单。把用户 ID 告诉交易对手，他们就能在创建订单时找到你。
      </p>
      <div className="flex max-w-[900px] flex-col gap-5">
        <ProfileCard profile={pickProfile(data, 'buyer')} role="buyer" />
        <ProfileCard profile={pickProfile(data, 'seller')} role="seller" />
      </div>
    </>
  );
}
```

- [ ] **Step 4: 创建引导页**

创建 `src/features/counterparties/OnboardingPage.tsx`：

```tsx
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { Button, useToast } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/format';
import { ROLES, type CounterpartyInput, type Role } from '@/lib/schema';
import CounterpartyForm from './CounterpartyForm';
import { useCreateCounterparty } from './hooks';

export default function OnboardingPage() {
  const navigate = useNavigate();
  const toast = useToast();
  const create = useCreateCounterparty();
  const [role, setRole] = useState<Role | undefined>();

  function handleSubmit(values: CounterpartyInput) {
    create.mutate(values, {
      onSuccess: (row) => {
        toast.success(`档案已创建，你的用户 ID 是 ${row.display_id}`);
        navigate('/profile', { replace: true });
      },
      onError: (e) => toast.error((e as Error).message),
    });
  }

  if (!role) {
    return (
      <div className="mx-auto max-w-[720px] py-10">
        <h1 className="text-[30px] leading-[38px] font-semibold">你以哪个身份开始？</h1>
        <p className="text-ink-3 mt-3 text-sm">
          填完表单会得到一个用户 ID。之后可以随时在「我的档案」里补充另一个身份 —— 
          同一个账号可以既是买家又是卖家。
        </p>
        <div className="mt-8 flex gap-4">
          {ROLES.map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setRole(r)}
              className="rounded-card bg-surface hover:border-line-strong transition-base flex-1 border border-transparent p-6 text-left"
            >
              <span className="text-lg font-semibold">我是{ROLE_LABEL[r]}</span>
              <span className="text-ink-3 mt-2 block text-sm">
                {r === 'buyer' ? '买入 Crypto 或法币' : '卖出 Crypto 或法币'}
              </span>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[900px] py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-[30px] leading-[38px] font-semibold">填写{ROLE_LABEL[role]}信息</h1>
        <Button variant="second" onClick={() => setRole(undefined)}>
          换个身份
        </Button>
      </div>
      <CounterpartyForm role={role} submitting={create.isPending} onSubmit={handleSubmit} />
    </div>
  );
}
```

若 `CounterpartyForm` 的 `defaultValues` 是必填 prop，传 `defaultValues={undefined}`；以该组件的实际签名为准。

- [ ] **Step 5: 全部测试与类型检查**

Run: `npm test`
Expected: 全绿

Run: `npx tsc -b`
Expected: 无输出。此时 `routes.tsx` 还没接入新页面，属预期 —— Task 7 处理。

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 引导页与我的档案页"
```

---

### Task 6: 按 display_id 查询对手方

**Files:**
- Create: `src/features/counterparties/lookup.ts`
- Create: `src/features/counterparties/CounterpartyPicker.tsx`
- Create: `src/features/counterparties/__tests__/CounterpartyPicker.test.tsx`

**Interfaces:**
- Consumes: Task 1 的 RPC `lookup_counterparty`
- Produces:
  - `lookupCounterparty(displayId: string, role: Role): Promise<CounterpartyRef>` from `@/features/counterparties/lookup`
  - `CounterpartyRef = { id: string; display_id: string; role: Role; full_name: string }` 从同文件导出
  - `CounterpartyPicker` 默认导出，props：`{ role: Role; label: string; value: string; onChange: (id: string) => void; error?: string; myProfile?: Counterparty }`

- [ ] **Step 1: 写 picker 的失败测试**

创建 `src/features/counterparties/__tests__/CounterpartyPicker.test.tsx`：

```tsx
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CounterpartyPicker from '../CounterpartyPicker';

const mockLookup = vi.fn();
vi.mock('../lookup', () => ({
  lookupCounterparty: (...args: unknown[]) => mockLookup(...args),
}));

function setup(props: Partial<React.ComponentProps<typeof CounterpartyPicker>> = {}) {
  const onChange = vi.fn();
  render(
    <CounterpartyPicker role="seller" label="卖家" value="" onChange={onChange} {...props} />,
  );
  return { onChange };
}

describe('CounterpartyPicker', () => {
  beforeEach(() => mockLookup.mockReset());

  it('查到后显示姓名并回传 id', async () => {
    mockLookup.mockResolvedValue({
      id: 'uuid-1',
      display_id: 'U000002',
      role: 'seller',
      full_name: '李四',
    });
    const { onChange } = setup();

    await userEvent.type(screen.getByPlaceholderText('输入对方的用户 ID'), 'U000002');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => expect(screen.getByText(/李四/)).toBeInTheDocument());
    expect(onChange).toHaveBeenCalledWith('uuid-1');
  });

  it('查不到时报错且不回传 id', async () => {
    mockLookup.mockRejectedValue(new Error('未找到该用户 ID 对应的卖家'));
    const { onChange } = setup();

    await userEvent.type(screen.getByPlaceholderText('输入对方的用户 ID'), 'U999999');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() =>
      expect(screen.getByText('未找到该用户 ID 对应的卖家')).toBeInTheDocument(),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('有自己的同角色档案时提供一键填入', async () => {
    const { onChange } = setup({
      myProfile: { id: 'my-uuid', display_id: 'U000001', role: 'seller', full_name: '张三' } as never,
    });

    await userEvent.click(screen.getByRole('button', { name: /用我自己的卖家档案/ }));

    expect(onChange).toHaveBeenCalledWith('my-uuid');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('输入框为空时查询按钮禁用', () => {
    setup();
    expect(screen.getByRole('button', { name: '查询' })).toBeDisabled();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/features/counterparties/__tests__/CounterpartyPicker.test.tsx`
Expected: FAIL —— 无法解析 `../CounterpartyPicker`

- [ ] **Step 3: 实现 lookup**

创建 `src/features/counterparties/lookup.ts`：

```typescript
import { supabase } from '@/lib/supabase';
import { toFriendlyError } from '@/lib/errors';
import { ROLE_LABEL } from '@/lib/format';
import type { Role } from '@/lib/schema';

export interface CounterpartyRef {
  id: string;
  display_id: string;
  role: Role;
  full_name: string;
}

/**
 * 按用户 ID 精确查询对手方。
 *
 * 走 lookup_counterparty RPC 而非直接查表：RLS 只让用户看到自己的档案，
 * 而这个 security definer 函数只返回 id / display_id / role / full_name，
 * 身份证号和银行账号在数据库层面就取不到。
 *
 * 角色校验放在这里（而非 SQL 里）是有意的：RPC 保持"按 ID 查人"这一个职责，
 * 调用方各自决定要什么角色。返回的四个字段都不敏感，多返回一个角色不匹配的
 * 结果不构成泄漏。
 */
export async function lookupCounterparty(displayId: string, role: Role): Promise<CounterpartyRef> {
  // 规范化后再查：display_id 在库里一律是 U000123 形式的大写，
  // 用户手抄时常带空格或用小写。不在这里统一，u000123 会查不到人。
  const normalized = displayId.trim().toUpperCase();
  if (!normalized) throw new Error('请输入对方的用户 ID');

  const { data, error } = await supabase.rpc('lookup_counterparty', {
    p_display_id: normalized,
  });
  if (error) throw toFriendlyError(error);

  const row = (data as CounterpartyRef[] | null)?.[0];
  if (!row) throw new Error(`未找到用户 ID ${normalized}`);
  if (row.role !== role) {
    throw new Error(`${row.display_id} 是${ROLE_LABEL[row.role]}，不是${ROLE_LABEL[role]}`);
  }
  return row;
}
```

- [ ] **Step 3b: 写 lookup 的规范化测试**

组件测试覆盖不到「传给 RPC 的参数是什么」——这正是最容易回退的地方（把 `normalized` 改回 `displayId` 组件测试仍全绿）。

创建 `src/features/counterparties/__tests__/lookup.test.ts`：

```typescript
import { beforeEach, describe, expect, it, vi } from 'vitest';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...a: unknown[]) => rpc(...a) } }));

import { lookupCounterparty } from '../lookup';

const ROW = { id: 'u1', display_id: 'U000123', role: 'seller' as const, full_name: '张三' };

describe('lookupCounterparty', () => {
  beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [ROW], error: null });
  });

  it('把输入 trim + 转大写后再传给 RPC', async () => {
    await lookupCounterparty('  u000123 ', 'seller');
    expect(rpc).toHaveBeenCalledWith('lookup_counterparty', { p_display_id: 'U000123' });
  });

  it('空输入不发请求', async () => {
    await expect(lookupCounterparty('   ', 'seller')).rejects.toThrow('请输入对方的用户 ID');
    expect(rpc).not.toHaveBeenCalled();
  });

  it('查不到时错误消息里用规范化后的 ID', async () => {
    rpc.mockResolvedValue({ data: [], error: null });
    await expect(lookupCounterparty(' u999 ', 'seller')).rejects.toThrow('未找到用户 ID U999');
  });

  it('角色不匹配时报错并说明实际角色', async () => {
    await expect(lookupCounterparty('U000123', 'buyer')).rejects.toThrow('是卖家，不是买家');
  });

  it('角色匹配时返回该行', async () => {
    await expect(lookupCounterparty('U000123', 'seller')).resolves.toEqual(ROW);
  });
});
```

Run: `npx vitest run src/features/counterparties/__tests__/lookup.test.ts`
Expected: 5 个用例全绿

- [ ] **Step 4: 实现 picker**

创建 `src/features/counterparties/CounterpartyPicker.tsx`：

```tsx
import { useState } from 'react';
import { Button, Input } from '@/components/ui';
import { ROLE_LABEL } from '@/lib/format';
import type { Counterparty, Role } from '@/lib/schema';
import { lookupCounterparty, type CounterpartyRef } from './lookup';

export default function CounterpartyPicker({
  role,
  label,
  value,
  onChange,
  error,
  myProfile,
}: {
  role: Role;
  label: string;
  /** 已选中的档案 uuid，空串表示未选 */
  value: string;
  onChange: (id: string) => void;
  error?: string;
  /** 当前用户同角色的档案，用于"这一方是我自己"的快捷填入 */
  myProfile?: Counterparty;
}) {
  const [keyword, setKeyword] = useState('');
  const [found, setFound] = useState<CounterpartyRef | undefined>();
  const [lookupError, setLookupError] = useState('');
  const [pending, setPending] = useState(false);

  async function handleLookup() {
    setLookupError('');
    setPending(true);
    try {
      const row = await lookupCounterparty(keyword.trim(), role);
      setFound(row);
      onChange(row.id);
    } catch (e) {
      setFound(undefined);
      setLookupError((e as Error).message);
    } finally {
      setPending(false);
    }
  }

  function useMine() {
    if (!myProfile) return;
    setFound(myProfile);
    setLookupError('');
    onChange(myProfile.id);
  }

  // return 部分见下方 Step 4b —— 不能直接复用 Field
}
```

- [ ] **Step 4b: 写 picker 的 return**

**`Field` 不能直接用在这里。** 它把 `children` 包在 `<label>` 内部（`src/components/ui/Field.tsx:14-19`），而本组件的 children 含两个 `<button>` —— 按钮嵌在 label 里，点击会同时触发 label 关联的输入框聚焦，且屏幕阅读器会把按钮文本读成标签的一部分。

改为手写与 `Field` 视觉一致的结构，不复用它：

```tsx
  return (
    <div>
      <span className="mb-2 block text-xs text-black/50">
        {label}
        <span className="text-danger ml-1">*</span>
      </span>

      <div className="flex gap-2">
        <Input
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          placeholder="输入对方的用户 ID"
          invalid={Boolean(error ?? lookupError)}
        />
        <Button type="button" variant="second" disabled={!keyword.trim() || pending} onClick={handleLookup}>
          {pending ? '查询中' : '查询'}
        </Button>
      </div>

      {myProfile ? (
        <button type="button" onClick={useMine} className="text-ink-3 mt-2 text-xs underline">
          用我自己的{ROLE_LABEL[role]}档案（{myProfile.display_id}）
        </button>
      ) : null}

      {found && found.id === value ? (
        <p className="text-success mt-2 text-xs">
          已选择 {found.full_name}（{found.display_id}）
        </p>
      ) : null}

      <p className="text-danger min-h-[18px] text-xs">{error ?? lookupError}</p>
    </div>
  );
```

相应地把 `Field` 从本文件的 import 中去掉，只保留 `Button` 与 `Input`。

- [ ] **Step 5: 运行测试确认通过**

Run: `npx vitest run src/features/counterparties/__tests__/CounterpartyPicker.test.tsx`
Expected: PASS，4 个用例

- [ ] **Step 6: 全部测试与类型检查**

Run: `npm test`
Expected: 全绿

Run: `npx tsc -b`
Expected: 无输出

- [ ] **Step 7: 提交**

```bash
git add -A
git commit -m "feat: 按用户 ID 精确查询对手方"
```

---

### Task 7: 路由表与侧边栏重构

**Files:**
- Modify: `src/routes.tsx`
- Modify: `src/layouts/Sidebar.tsx`

**Interfaces:**
- Consumes: Task 3 的 `RegisterPage`；Task 4 的 `RequireProfile`；Task 5 的 `OnboardingPage`、`MyProfilePage`、改造后的 `CounterpartyFormPage`
- Produces: 最终路由表。后续任务不再改动路由。

- [ ] **Step 1: 重写路由表**

把 `src/routes.tsx` 整体替换为：

```tsx
import { createBrowserRouter, Navigate } from 'react-router';
import LoginPage from '@/features/auth/LoginPage';
import RegisterPage from '@/features/auth/RegisterPage';
import RequireAuth from '@/features/auth/RequireAuth';
import RequireProfile from '@/features/auth/RequireProfile';
import CounterpartyFormPage from '@/features/counterparties/CounterpartyFormPage';
import MyProfileEditPage from '@/features/counterparties/MyProfileEditPage';
import MyProfilePage from '@/features/counterparties/MyProfilePage';
import OnboardingPage from '@/features/counterparties/OnboardingPage';
import OrderCreatePage from '@/features/orders/OrderCreatePage';
import OrderDetailPage from '@/features/orders/OrderDetailPage';
import OrderListPage from '@/features/orders/OrderListPage';
import AppLayout from '@/layouts/AppLayout';

const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <RegisterPage /> },
  {
    element: <RequireAuth />,
    children: [
      {
        // RequireProfile 在 AppLayout 之外：引导页不显示侧边栏。
        // 侧边栏的每个入口都要求已有档案，在还没有档案时展示它只会让人点进去撞守卫。
        element: <RequireProfile />,
        children: [
          { path: '/onboarding', element: <OnboardingPage /> },
          {
            element: <AppLayout />,
            children: [
              { path: '/', element: <Navigate to="/orders" replace /> },

              { path: '/profile', element: <MyProfilePage /> },
              { path: '/profile/buyer/new', element: <CounterpartyFormPage role="buyer" mode="create" /> },
              { path: '/profile/seller/new', element: <CounterpartyFormPage role="seller" mode="create" /> },
              { path: '/profile/buyer', element: <MyProfileEditPage role="buyer" /> },
              { path: '/profile/seller', element: <MyProfileEditPage role="seller" /> },

              { path: '/orders', element: <OrderListPage /> },
              { path: '/orders/new', element: <OrderCreatePage /> },
              { path: '/orders/:id', element: <OrderDetailPage /> },

              { path: '*', element: <Navigate to="/orders" replace /> },
            ],
          },
        ],
      },
    ],
  },
]);

export default router;
```

- [ ] **Step 2: 创建档案编辑页包装**

`/profile/buyer` 路径里没有 `:id`，但 `CounterpartyFormPage` 的 edit 模式需要档案 id。用 URL 携带 id（`/profile/:id`）会让用户看到自己的 uuid 且能手改成别人的 —— 虽然 RLS 会拦，但那是把安全依赖交给数据库兜底而非从设计上避免。改为从 `useMyProfiles` 解析。

创建 `src/features/counterparties/MyProfileEditPage.tsx`：

```tsx
import { Navigate } from 'react-router';
import type { Role } from '@/lib/schema';
import CounterpartyFormPage from './CounterpartyFormPage';
import { useMyProfiles } from './hooks';
import { pickProfile } from './myProfiles';

export default function MyProfileEditPage({ role }: { role: Role }) {
  const { data, isPending, isError, error } = useMyProfiles();

  if (isPending) return <div className="text-ink-4 text-sm">加载中...</div>;
  if (isError) return <div className="text-danger text-sm">加载失败：{(error as Error).message}</div>;

  const profile = pickProfile(data, role);
  // 该角色还没有档案 —— 直接进编辑页是手敲 URL 的结果，回到档案页由用户选择创建
  if (!profile) return <Navigate to="/profile" replace />;

  return <CounterpartyFormPage role={role} mode="edit" profileId={profile.id} />;
}
```

- [ ] **Step 3: 重写侧边栏**

把 `src/layouts/Sidebar.tsx` 中的 `NAV` 常量替换为：

```tsx
const NAV = [
  { to: '/orders', label: '订单管理' },
  { to: '/profile', label: '我的档案' },
];
```

订单放在第一位：自助模式下档案是一次性配置，订单才是日常入口。

- [ ] **Step 3b: 改 Sidebar 测试**

现有 `src/layouts/__tests__/Sidebar.test.tsx` 断言三个入口且用 `/buyers` 作为选中态样本，两者都失效。整体替换文件内容为：

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
  it('渲染两个导航入口', () => {
    renderAt('/orders');
    expect(screen.getByRole('link', { name: '订单管理' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '我的档案' })).toBeInTheDocument();
  });

  it('买卖家列表入口已移除', () => {
    renderAt('/orders');
    expect(screen.queryByRole('link', { name: '买家管理' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '卖家管理' })).not.toBeInTheDocument();
  });

  it('当前路由的入口标记为选中', () => {
    renderAt('/profile');
    expect(screen.getByRole('link', { name: '我的档案' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '订单管理' })).not.toHaveAttribute('aria-current');
  });

  it('子路由也算选中', () => {
    renderAt('/orders/abc-123');
    expect(screen.getByRole('link', { name: '订单管理' })).toHaveAttribute('aria-current', 'page');
  });
});
```

「买卖家列表入口已移除」这条不是冗余：它把「删除导航项」变成被测试钉住的行为，防止后人复原入口后指向不存在的路由。

- [ ] **Step 4: 全部测试与类型检查**

Run: `npm test`
Expected: 全绿

Run: `npx tsc -b`
Expected: 无输出

- [ ] **Step 5: 手工验证路由可达**

Run: `npm run build`
Expected: 构建成功

代码走查确认下列每条路径都有对应的 route 项，把结论写进报告：
`/login`、`/register`、`/onboarding`、`/profile`、`/profile/buyer/new`、`/profile/seller/new`、`/profile/buyer`、`/profile/seller`、`/orders`、`/orders/new`、`/orders/:id`

并确认已无任何文件引用 `/buyers` 或 `/sellers`：

Run: `grep -rn "'/buyers\|'/sellers\|\"/buyers\|\"/sellers" src/`
Expected: 无输出

- [ ] **Step 6: 提交**

```bash
git add -A
git commit -m "feat: 路由表与侧边栏改为自助模式"
```

---

### Task 8: 订单表单接入 picker，状态切换改为状态机

**Files:**
- Create: `src/features/orders/statusMachine.ts`
- Create: `src/features/orders/__tests__/statusMachine.test.ts`
- Create: `src/features/orders/StatusActions.tsx`
- Modify: `src/features/orders/OrderForm.tsx`
- Modify: `src/features/orders/formLogic.ts`
- Modify: `src/features/orders/OrderDetailPage.tsx`
- Modify: `src/features/orders/__tests__/formLogic.test.ts`

**Interfaces:**
- Consumes: Task 1 的 trigger 消息；Task 4 的 `useMyProfiles`/`pickProfile`；Task 6 的 `CounterpartyPicker`
- Produces:
  - `allowedTransitions(order: OrderRoleContext): OrderStatus[]` from `@/features/orders/statusMachine`
  - `OrderRoleContext = { status: OrderStatus; isPayee: boolean; isPayer: boolean }`
  - `StatusActions` 默认导出

- [ ] **Step 1: 为状态机写失败测试**

创建 `src/features/orders/__tests__/statusMachine.test.ts`：

```typescript
import { describe, expect, it } from 'vitest';
import { allowedTransitions } from '../statusMachine';

describe('allowedTransitions', () => {
  it('待付款：付款方可标已付款、可取消', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: true, isPayee: false })).toEqual([
      'paid',
      'cancelled',
    ]);
  });

  it('待付款：收款方只能取消，不能替对方标已付款', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: false, isPayee: true })).toEqual([
      'cancelled',
    ]);
  });

  it('已付款：收款方可确认完成', () => {
    expect(allowedTransitions({ status: 'paid', isPayer: false, isPayee: true })).toEqual(['completed']);
  });

  it('已付款：付款方无操作 —— 钱到没到只有收款方知道', () => {
    expect(allowedTransitions({ status: 'paid', isPayer: true, isPayee: false })).toEqual([]);
  });

  it('已付款不可再取消', () => {
    const next = allowedTransitions({ status: 'paid', isPayer: true, isPayee: true });
    expect(next).not.toContain('cancelled');
  });

  it('终态无任何后续', () => {
    expect(allowedTransitions({ status: 'completed', isPayer: true, isPayee: true })).toEqual([]);
    expect(allowedTransitions({ status: 'cancelled', isPayer: true, isPayee: true })).toEqual([]);
  });

  it('既不是买方也不是卖方则无操作（正常情况下 RLS 已挡住，此处兜底）', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: false, isPayee: false })).toEqual([]);
  });

  it('同时持有买卖两个档案（自己跟自己下单）时两种操作都可用', () => {
    expect(allowedTransitions({ status: 'pending_payment', isPayer: true, isPayee: true })).toEqual([
      'paid',
      'cancelled',
    ]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run src/features/orders/__tests__/statusMachine.test.ts`
Expected: FAIL —— 无法解析 `../statusMachine`

- [ ] **Step 3: 实现状态机**

创建 `src/features/orders/statusMachine.ts`：

```typescript
import type { OrderStatus, Payee } from '@/lib/schema';

export interface OrderRoleContext {
  status: OrderStatus;
  /** 当前用户是收款方 */
  isPayee: boolean;
  /** 当前用户是付款方 */
  isPayer: boolean;
}

/**
 * 当前用户在这个订单上可以执行的状态变更。
 *
 * 这是 DB 里 check_status_transition trigger 的镜像。前端这份只负责
 * 灰掉按钮，真正的强制在数据库 —— 两处规则必须一致，改动时同步修改
 * supabase/migrations/0001_init.sql 里的 trigger。
 *
 * 为什么按角色区分：付款方说"我付了"、收款方说"我收到了"，各自只能声明
 * 自己能确认的事实。若允许买家单方面标完成，一笔没付款的订单就能被结掉。
 */
export function allowedTransitions({ status, isPayee, isPayer }: OrderRoleContext): OrderStatus[] {
  if (!isPayee && !isPayer) return [];

  if (status === 'pending_payment') {
    const next: OrderStatus[] = [];
    if (isPayer) next.push('paid');
    next.push('cancelled');
    return next;
  }

  if (status === 'paid') {
    return isPayee ? ['completed'] : [];
  }

  // completed / cancelled 是终态
  return [];
}

/** 这笔钱付给谁 —— 必须读 payee 列，不能由 order_type 推断 */
export function isPayeeSide(payee: Payee, side: 'buyer' | 'seller'): boolean {
  return payee === side;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run src/features/orders/__tests__/statusMachine.test.ts`
Expected: PASS，8 个用例

- [ ] **Step 5: 创建状态操作组件**

创建 `src/features/orders/StatusActions.tsx`：

```tsx
import { Button } from '@/components/ui';
import { ORDER_STATUS_LABEL } from '@/lib/format';
import type { OrderStatus } from '@/lib/schema';
import { allowedTransitions, type OrderRoleContext } from './statusMachine';

const ACTION_LABEL: Record<OrderStatus, string> = {
  pending_payment: '标记为待付款',
  paid: '我已付款',
  completed: '确认收款完成',
  cancelled: '取消订单',
};

export default function StatusActions({
  context,
  pending,
  onChange,
}: {
  context: OrderRoleContext;
  pending: boolean;
  onChange: (next: OrderStatus) => void;
}) {
  const next = allowedTransitions(context);

  if (next.length === 0) {
    return (
      <span className="text-ink-4 text-xs">
        {context.status === 'completed' || context.status === 'cancelled'
          ? '订单已结束，无法再变更'
          : '当前状态下你没有可执行的操作'}
      </span>
    );
  }

  return (
    <div className="flex gap-3">
      {next.map((s) => (
        <Button
          key={s}
          variant={s === 'cancelled' ? 'second' : 'primary'}
          disabled={pending}
          onClick={() => onChange(s)}
        >
          {ACTION_LABEL[s]}
        </Button>
      ))}
    </div>
  );
}
```

若 `Button` 的主变体名不是 `primary`，用它的默认值（省略 `variant`）。

- [ ] **Step 6: 改造订单详情页的状态区**

在 `src/features/orders/OrderDetailPage.tsx` 中：

删除 `Select` 的 import、`STATUS_OPTIONS` 常量、以及 `ORDER_STATUSES` 的 import（`ORDER_STATUS_LABEL` 保留）。

加入 import：

```tsx
import { useMyProfiles } from '@/features/counterparties/hooks';
import StatusActions from './StatusActions';
import { isPayeeSide } from './statusMachine';
```

在 `const updateStatus = ...` 之后加入：

```tsx
  const profiles = useMyProfiles();
```

在 `if (!order.data) return null;` 之后加入：

```tsx
  // 判定当前用户在这笔订单里的位置。
  // 收款方由 payee 列决定（'buyer' 表示钱付给买家），绝不能用 order_type 推断 ——
  // crypto 默认买家收币只是表单默认值，用户可以改。
  const myIds = new Set((profiles.data ?? []).map((p) => p.id));
  const iAmBuyer = myIds.has(order.data.buyer_id);
  const iAmSeller = myIds.has(order.data.seller_id);
  const payeeIsBuyer = isPayeeSide(order.data.payee, 'buyer');
  const roleContext = {
    status: order.data.status,
    isPayee: payeeIsBuyer ? iAmBuyer : iAmSeller,
    isPayer: payeeIsBuyer ? iAmSeller : iAmBuyer,
  };
```

把状态区那个 `<div className="rounded-card bg-surface mb-5 flex items-center gap-5 px-6 py-4">` 整块（含内部的 `<Select>` 与那句「状态可在四种之间手动切换」的说明）替换为：

```tsx
      <div className="rounded-card bg-surface mb-5 flex flex-wrap items-center gap-5 px-6 py-4">
        <span className="text-sm text-black/50">当前状态</span>
        <OrderStatusBadge status={order.data.status} />
        {profiles.isPending ? (
          <span className="text-ink-4 text-xs">加载中...</span>
        ) : (
          <StatusActions
            context={roleContext}
            pending={updateStatus.isPending}
            onChange={handleStatusChange}
          />
        )}
      </div>
```

`handleStatusChange` 的实现保持不变。

- [ ] **Step 7: 订单表单接入 picker**

在 `src/features/orders/OrderForm.tsx` 中：

加入 import：

```tsx
import CounterpartyPicker from '@/features/counterparties/CounterpartyPicker';
import { useMyProfiles } from '@/features/counterparties/hooks';
import { pickProfile } from '@/features/counterparties/myProfiles';
```

在组件内 `const orderType = watch(...)` 那组之后加入：

```tsx
  const profiles = useMyProfiles();
```

把 Task 2 里临时改成 `<Input {...register('buyer_id')} />` 的买家、卖家两个 `<Field>` 整块替换为：

```tsx
        <CounterpartyPicker
          role="buyer"
          label="买家"
          value={buyerId}
          onChange={(id) => setValue('buyer_id', id, { shouldValidate: true })}
          error={err('buyer_id')}
          myProfile={pickProfile(profiles.data, 'buyer')}
        />
        <CounterpartyPicker
          role="seller"
          label="卖家"
          value={sellerId}
          onChange={(id) => setValue('seller_id', id, { shouldValidate: true })}
          error={err('seller_id')}
          myProfile={pickProfile(profiles.data, 'seller')}
        />
```

`buyer_id` / `seller_id` 现在由 picker 通过 `setValue` 写入，不再经 `register`，因此必须在 `defaultValues` 里保留这两个键的空串初值（已有，不要动）。

- [ ] **Step 8: 加入收款信息提示，删除自动带出**

Task 2 已删除 auto-fill effect。收款方是对手方时不能自动带出对方的银行账号 —— RLS 读不到，且那本就是对方的隐私数据。

在 `OrderForm.tsx` 的收款字段区（`{orderType === 'crypto' ? <CryptoFields .../> : <FiatFields .../>}`）之前插入：

```tsx
      <p className="text-ink-3 mb-4 max-w-[900px] text-xs">
        请填写{payee === 'buyer' ? '买家' : '卖家'}的收款信息。
        {payeeIsMe
          ? '这一方是你自己，可以从你的档案填入。'
          : '对方的收款信息需要向对方索取 —— 出于隐私保护，系统不会展示其他用户的银行账号或钱包地址。'}
      </p>
```

并在 `const profiles = useMyProfiles();` 之后加入：

```tsx
  const myPayeeProfile = pickProfile(profiles.data, payee);
  const payeeIsMe = Boolean(myPayeeProfile) && myPayeeProfile!.id === (payee === 'buyer' ? buyerId : sellerId);
```

- [ ] **Step 9: 清理 formLogic 中失效的函数**

`payeeDefaults` 在 Task 2 已失去调用方。删除 `src/features/orders/formLogic.ts` 中的 `payeeDefaults` 函数与 `CounterpartyDefaults` 类型，并删除 `src/features/orders/__tests__/formLogic.test.ts` 中所有 `payeeDefaults` 相关的 describe / it 块。

保留 `defaultPayee` 与 `clearTypeFields` 及其测试 —— 它们仍在用。

**注意**：删掉的是「从对方档案带出收款信息」这个能力，不是「切换类型时清空字段」。若不确定某个测试属于哪一类，看它断言的函数名。

- [ ] **Step 10: 全部测试与类型检查**

Run: `npm test`
Expected: 全绿。相比 Task 7 结束时，新增 statusMachine 的 8 个用例，减少 payeeDefaults 的用例。

Run: `npx tsc -b`
Expected: 无输出

Run: `npm run build`
Expected: 构建成功

把最终用例数写进报告。

- [ ] **Step 11: 提交**

```bash
git add -A
git commit -m "feat: 订单表单接入对手方查询，状态切换改为状态机"
```

---

## 交付后手工验收

数据库从未部署，SQL 未经执行。以下清单必须在真实 Supabase 上完成，**不可跳过第 3、4 项** —— 它们是本次变更的全部意义所在。

1. 建 Supabase 项目，SQL Editor 跑 `0001_init.sql`，确认无报错
2. `/register` 注册账号 A，收验证邮件，登录成功
3. A 走引导流程建买家档案，记下 `display_id`
4. **注册账号 B，登录后确认「我的档案」里看不到 A 的任何数据**（RLS 隔离的核心验证）
5. B 建卖家档案，A 用 B 的 `display_id` 创建订单，确认能查到 B 的姓名
6. **确认 A 的界面上没有出现 B 的银行账号或钱包地址**
7. A 是付款方时，A 能标「我已付款」，B 不能
8. B 是收款方时，B 能「确认收款完成」，A 不能
9. 订单详情的时间线显示两次变更，操作人正确
10. B 登录后确认只看到与自己相关的订单

## 已知遗留

- `display_id` 可暴力枚举（`U000001` 递增）。枚举结果只有姓名与角色，无敏感字段。真实防护在 RPC 的返回列表，不在 ID 不可猜。
- 订单号用 UTC 生成，界面 `created_at` 用本地时区。北京时间 00:00-08:00 创建的订单，其单号日期比界面显示早一天。上一轮已裁决保持 UTC，SQL 里有注释禁止改动。
- 同一账号同时持有买卖档案时可自己跟自己下单，状态机两侧判定同时为真。数据都是他自己的，不拦截。






