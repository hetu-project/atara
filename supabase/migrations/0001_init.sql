-- ============================================================
-- advaita-web 初始化脚本
-- 在 Supabase SQL Editor 中整段执行
-- ============================================================

-- 显式事务：README 里"失败会整体回滚"的承诺目前只是 SQL Editor 的行为，
-- 脚本本身并不保证。包一层 begin/commit 之后，psql、CI、supabase db push
-- 跑这份脚本时也一样：中途报错整体回滚，不会留下建了一半的 schema。
begin;

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

  -- 档案归属。自助注册模式下「谁录入的」与「档案属于谁」是同一件事，
  -- 保留两列会产生两个可能不一致的真相来源，因此取代原来的 created_by。
  -- default auth.uid() 让前端不必传；not null 让 service-role 或异常上下文
  -- 下的漏传直接失败，而不是静默写入 NULL 绕过 RLS。
  user_id                uuid not null default auth.uid()
                           references auth.users (id) on delete cascade,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
  ,
  -- 一个账号每种角色最多一个档案（可同时是买家和卖家）
  constraint counterparties_user_id_role_key unique (user_id, role)
);

-- security definer 是必须的，且与下面 set_order_no / log_order_status 对称：
-- 这个函数要 nextval() 一个序列，需要该序列的 USAGE 权限。在标准 Supabase 项目上，
-- ambient 的 ALTER DEFAULT PRIVILEGES 大概率已经把这个权限授给了 authenticated，
-- 所以少了 security definer 也可能"看起来正常"——但这是在依赖环境的隐性授权，
-- 而不是脚本自己建立所需权限，一旦某个项目的默认权限不是标准配置，
-- 这里就会报错，而且报错的后果是没有任何 counterparty 能被创建，整个应用无法使用。
-- 显式加 security definer，让这个函数始终以属主身份运行、不依赖 ambient 授权。
create or replace function public.set_counterparty_display_id()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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

-- orders 的 RLS policy 会通过 user_id 反查 counterparties，每次订单查询都命中
create index idx_counterparties_user_id    on public.counterparties (user_id);
create index idx_counterparties_full_name  on public.counterparties (full_name);
create index idx_counterparties_created_at on public.counterparties (created_at desc);

-- ============================================================
-- orders
-- ============================================================
-- 订单号的每日计数器。只由 set_order_no trigger 读写，前端永远不碰它。
-- RLS 在文件末尾的 RLS 段统一开启（且不给任何 policy）——必须开，
-- 否则 Supabase 默认授权会让 anon key（打包在前端 JS 里）能改 seq，
-- 把它改回已用过的值就会让下一笔订单号撞上 unique 约束，订单创建直接崩。
create table public.order_no_counters (
  day date primary key,
  seq int not null
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
  -- 两个分支互斥且各自把对方的字段强制为 null。
  -- 注意 fiat 分支只强制 fiat_currency 和 bank_account_number 非空：
  -- bank_name / bank_account_name / bank_swift 是选填（境内转账常常没有 SWIFT）。
  constraint orders_type_fields check (
    (order_type = 'crypto'
      and asset is not null
      and chain is not null
      and receiving_address is not null
      and fiat_currency is null
      and bank_name is null
      and bank_account_name is null
      and bank_account_number is null
      and bank_swift is null)
    or
    (order_type = 'fiat'
      and fiat_currency is not null
      and bank_account_number is not null
      and asset is null
      and chain is null
      and receiving_address is null)
  )
);

-- security definer 是必须的：order_no_counters 开了 RLS 且没有任何 policy，
-- 只有以属主身份运行的这个函数能写它。
-- search_path 必须显式含 pg_temp，这是 security definer 函数的标准防护写法。
create or replace function public.set_order_no()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  -- 刻意用 UTC：订单号的日期在全球统一，不随运营所在时区漂移。
  -- 代价是界面上按本地时区显示的 created_at 可能与订单号里的日期差一天
  -- （例：北京时间 08-07 03:00 创建 → 显示 08-07，订单号 ORD20260806-xxxx）。
  -- 这是有意为之，不是 bug，不要改成本地时区。
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

-- security definer 在这里是必须的，不要去掉：
-- order_status_logs 只对 authenticated 开放 SELECT，没有 INSERT 策略。
-- 这个 trigger 要往表里写，必须以函数属主身份执行才能通过 RLS。
-- set search_path = public 是 security definer 函数的标准防护，防止调用方篡改 search_path。
create or replace function public.log_order_status()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
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

commit;
