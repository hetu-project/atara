# 交付说明

日期：2026-08-06
分支：`feat/self-registration`

本次变更把权限模型从「管理员建号 + 全表可见」改成了「买卖家自助注册 + 只能看自己的数据 + 状态转移由数据库
trigger 按角色强制」。代码已完成并通过逐任务 review、最终全分支 review 与一轮安全修复。**但它从未连过真实的
Supabase**——本机没有 Postgres、Docker 或 Supabase CLI，所以 `supabase/migrations/0001_init.sql` 从未被执行
过，也没有跑过任何端到端流程。**人工审读，加上下面两份手工验收清单，是它上线前唯一的关卡。**

自动化验证的范围：128 个单元测试、TypeScript 类型检查、生产构建，全部通过。**RLS policy、状态机 trigger、
本轮新增的两个 RPC（`lookup_counterparties_by_id`）和两个 trigger（收款信息冻结、档案身份三列冻结）
均只经人工审读，一行都没有在真实数据库里跑过。**

## 一、接入 Supabase

见 [README.md](../README.md) 的四步。**这四步已经是自助注册模式**，不要按更早版本的说明操作：

- 不需要、也不应该去 Authentication → Users 手工 Add user —— 用户从 `/register` 自助注册。
- **Enable Sign Ups 必须保持开启。** 关掉它会让 `/register` 在第一天就报错，这正是本文档更早版本
  （指导「关掉 Enable Sign Ups、手工 Add user」那版）会造成的后果，那份指引对应的是已经废弃的管理员建号模式。
- 邮箱验证默认开启（Supabase 默认行为），前端「已注册待验证」与「已注册可直接登录」两种返回都处理了，
  开关哪种配置都能正常工作，按运营需要决定是否关闭。

## 二、手工验收清单（功能，必须人工跑）

自动化测试无法覆盖真实 Supabase 行为，按顺序执行：

1. 打开 `/register`，用一个新邮箱注册。若项目开着邮箱验证，会看到「请查收验证邮件」；点邮件里的链接后能登录。
2. 登录后应自动跳到 `/onboarding`（此时还没有任何档案）。
3. 选择「我是买家」，填姓名 + 默认钱包地址（TRON），提交 → toast 显示 `U000001`，跳转到 `/profile`。
4. 在「我的档案」页点「创建卖家档案」，填姓名 + 银行账号，提交 → toast 显示 `U000002`。
5. 用浏览器后退键回到 `/onboarding` → 应立即被重定向回 `/profile`，而不是停留在选身份的页面
   （这是本轮修的 Important 4；修之前这里是个死胡同，只能靠继续后退离开）。
6. 新建 Crypto 订单：买家、卖家两栏各自输入对方的用户 ID 点「查询」，或点「用我自己的 xx 档案」；
   注意收款地址**不会**自动带出（§7 的设计变更，不是 bug，见下面第五节）。提交后 toast 显示订单号。
7. 打开刚创建的订单详情：买家、卖家两栏都应显示姓名和用户 ID，**不应该有一边显示 `-`**
   （这是本轮修的 Critical 2；修之前这里必定有一边是 `-`，因为资源嵌入查询会被对方档案的 RLS 挡住）。
8. 订单列表同一行的买家、卖家两列同样应该都能显示姓名，不是 `-`。
9. 用第二个账号注册、创建一个跟第一个账号角色相反的档案，第一个账号用它作对手方建一笔订单，
   双方各自完成一遍「付款方标已付款 → 收款方标已完成」的流程 → 状态徽标变化、时间线新增记录。
10. 退出登录 → 回到 `/login`，直接访问 `/orders` 应被拦截。

## 三、RLS 手工验收清单（安全边界，必须人工跑）

设计文档 §10 的要求：本次改动的 SQL 是安全边界，不只是数据结构，而它从未连过真实数据库，交付时必须给出
针对 RLS 的手工验收清单。用**两个真实账号**在 Supabase 项目上按顺序执行：

1. **交叉验证互相看不到对方档案。** 账号 A 登录后在浏览器 devtools 里执行
   `await supabase.from('counterparties').select('*')`，应只返回 A 自己的 0-2 条档案，绝不能出现账号 B 的
   任何字段，尤其是 `id_number`、`bank_account_number`、`default_wallet_address`。
2. **交叉验证互相看不到对方的订单。** 账号 A 若不是某订单的买卖双方之一，执行
   `await supabase.from('orders').select('*').eq('id', '<B的订单id>')` 应返回空结果，而不是报错或返回数据。
3. **确认 `lookup_counterparty` 只返回四个字段。** 任一已登录账号执行
   `await supabase.rpc('lookup_counterparty', { p_display_id: 'U000001' })`，返回行只应有
   `id / display_id / role / full_name`，不应出现银行账号、身份证号、出生日期、钱包地址等任何一列。
4. **确认不带用户登录、只用 anon key 调用 `lookup_counterparty` 会失败**（Critical 1 的验证，这正是打包
   在前端 JS 里、任何人都能抄走的那个 key）：

   ```bash
   curl -X POST '<SUPABASE_URL>/rest/v1/rpc/lookup_counterparty' \
     -H 'apikey: <anon key>' \
     -H 'Authorization: Bearer <anon key>' \
     -H 'Content-Type: application/json' \
     -d '{"p_display_id":"U000001"}'
   ```

   应收到权限错误（`42501` / permission denied for function），而不是正常返回一行数据。
   如果这一步返回了数据，说明 C1（`revoke ... from public, anon`）没修对，未登录用户仍能匿名枚举全部注册用户。
5. **从买卖双方各自的视角走完状态转移，确认该拒的被拒、消息是中文：**
   - 付款方在 `pending_payment` 标 `paid` → 应成功；收款方尝试标 `paid` → 应报「只有付款方可以标记为已付款」
   - 收款方在 `paid` 标 `completed` → 应成功；付款方尝试标 `completed` → 应报「只有收款方可以确认完成」
   - 任一方在 `pending_payment` 标 `cancelled` → 应成功；`paid` 之后任一方再标 `cancelled`
     → 应报「只有待付款的订单可以取消」
   - 顺带验证本轮新增的收款信息冻结（Important 3）：订单进入 `paid` 之后，任一方尝试
     `update orders set bank_account_number = '...' where id = '<订单id>'`
     应报「订单已开始付款，收款信息不可再修改」，`pending_payment` 阶段同样的更新应该成功
6. **确认函数权限表里没有 `anon`：**

   ```sql
   select proname, proacl from pg_proc where proname like 'lookup_counterpart%';
   ```

   `lookup_counterparty` 和 `lookup_counterparties_by_id` 两行的 `proacl` 都不应出现 `anon=X/` 这样的条目，
   应该只看到 `authenticated=X/` 和属主的完整权限。出现 `anon=X` 说明 C1 的 revoke 没生效或发生了回归。

## 四、已知遗留项（已裁决，非阻塞）

| # | 位置 | 问题 | 裁决理由 |
|---|---|---|---|
| P1 | `src/lib/schema.ts` 的 `decimalPlaces` | 对指数记数法欠计小数位：`decimalPlaces(0.000000123)` 返回 7 而非 9，于是小于 `1e-6` 的金额会绕过 8 位精度校验，被 `numeric(38,8)` 静默舍入 | 影响面是 0.000001 以下的极小额（BTC 百聪级）。修法：按 `e-` 拆分后加上尾数的小数位长度 |
| P2 | `OrderForm.tsx` | 收款方提示文字所在的容器无条件渲染，正常情况下在金额字段下方占一行固定高度的说明文字 | 纯视觉，内容本身始终有意义（不是空行） |
| P3 | `OrderListPage.tsx` | UTC 提示让该列比同行控件高，筛选行垂直居中略偏 | 纯视觉 |

**上一版遗留项里的「`CounterpartyOptionNotice.tsx` 的 `OPTION_LIMIT` 与 `api.ts` 的 `.limit(500)` 重复」
这一条已经不存在**：本分支把"下拉框列出全部对手方"整个改成了按 `display_id` 精确查询（设计文档 §6.2），
`CounterpartyOptionNotice.tsx`、`listCounterpartyOptions`、`buildCounterpartyQuery` 及相关测试都已删除。
这不是修好了，是问题依附的功能被整体拿掉了。

## 五、几个刻意的设计决定（不要"顺手改掉"）

**订单号用 UTC 日期。** 代价是：北京时间 00:00–08:00 创建的订单，界面显示的创建时间是当天，订单号里的日期
却是前一天。订单列表的**日期筛选器用本地时区**（与显示一致），但**订单号搜索框搜的是 UTC 日期**——运营想查
"今天的订单"，用筛选器和用 `ORD20260807` 搜索会得到相差最多 8 小时订单量的两个答案。搜索框下方已加提示文案。

**收款信息不再自动带出。** 旧版（`feat/initial-implementation`）会在选定订单类型后把收款方的银行账号/钱包
地址自动填进表单。本分支这么做不再安全：对手方是谁由用户手动查询确定，系统不知道"对方的收款信息"该从哪来，
也不应该知道——把它做成自动带出等于让 `lookup_counterparty` 之类的接口能返回收款信息，这正是设计文档 §6.2
明确禁止的。现在的行为是：收款方是自己时提示"可从档案复制"（用户需要另开 `/profile` 查看再手抄，没有一键
复制控件）；收款方是对方时提示需要线下向对方索取。这是设计文档 §7 的明确变更，不是遗漏或退步。

**`npm audit` 会一直报一条 react-router 高危。** GHSA-qwww-vcr4-c8h2 影响的是 RSC 模式，本项目是纯客户端
SPA，没有 loader、action 或服务端，不触及该代码路径（已核实 7.18.2 的 exports map 根本没有 RSC 入口）。
**不要跑 `npm audit fix --force`**——它会把 react-router 升到 v8 这个 breaking major。

## 六、与设计文档的偏差

- **国家字段的枚举只由 `<select>` 约束**，zod 和数据库都当自由文本。`src/lib/countries.ts` 里还有一个
  非 ISO 的 `'OTHER'` 选项。这是设计文档 §12 明确承认、本次不修的已知遗留。

**上一版遗留的另外两条已经不是"偏差"，而是随功能一起被拿掉了：** 「买卖家下拉框不可搜索」和「买卖家列表
没有操作列」都是针对"能列出全部对手方档案"这个页面/控件的评价，而这个页面本身已经被 §6.2 的按 ID 精确查询
取代——现在不存在一个能看到他人档案的列表界面，"可搜索"和"操作列"都无从谈起。`docs/superpowers/specs/
2026-08-06-self-registration-design.md` §12 的"已知遗留"仍然照抄了"列表页无操作列"这一条，读到时不要
按字面意思去找一个已经不存在的列表页——它说的是旧版的买卖家列表页，不是现在的"我的档案"页。
