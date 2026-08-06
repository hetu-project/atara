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
-- RLS：登录用户可全量读写（账号由管理员手工创建，不开放注册）
-- ============================================================
alter table public.counterparties    enable row level security;
alter table public.orders            enable row level security;
alter table public.order_status_logs enable row level security;
alter table public.order_no_counters enable row level security;

create policy "authenticated full access" on public.counterparties
  for all to authenticated using (true) with check (true);

create policy "authenticated full access" on public.orders
  for all to authenticated using (true) with check (true);

create policy "authenticated read" on public.order_status_logs
  for select to authenticated using (true);

-- order_no_counters 刻意不给任何 policy：
-- 它只被 set_order_no（security definer，以属主身份运行）读写，
-- 任何前端角色都不该碰它。开 RLS 且无 policy = 对 anon/authenticated 完全关闭。
