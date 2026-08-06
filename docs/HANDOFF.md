# 交付说明

日期：2026-08-06
分支：`feat/initial-implementation`

代码已完成并通过逐任务 review 与最终全分支 review。**但它从未连过真实的 Supabase**——本机没有
Postgres、Docker 或 Supabase CLI，所以 SQL 迁移脚本没有被执行过，也没有跑过任何端到端流程。
自动化验证的范围是：92 个单元测试、TypeScript 类型检查、生产构建，全部通过。

下面两节是你需要做的事。

## 一、接入 Supabase（按 README 的四步）

见 [README.md](../README.md)。要点重复一遍：

1. 新建 Supabase 项目
2. SQL Editor 里执行 `supabase/migrations/0001_init.sql` 全文
3. Authentication → Providers → Email 关掉 **Enable Sign Ups**；Users → Add user 手工建账号
4. 复制 `.env.example` 为 `.env` 填入 URL 和 anon key

执行第 2 步时会看到一条 `WARNING: there is already a transaction in progress`。
这是因为脚本自己包了 `begin; ... commit;`，而 SQL Editor 也会包一层事务。无害，可忽略。

## 二、手工验收清单（8 项，必须人工跑）

这些是自动化测试无法覆盖的部分，请按顺序执行：

1. 登录 → 应跳转到 `/orders`
2. 新建买家（填姓名 + 默认钱包地址 TRON）→ toast 应显示 `U000001`
3. 新建卖家（填姓名 + 银行账号）→ toast 应显示 `U000002`
4. 新建 Crypto 订单：选买卖家、填金额，收款地址应自动带出 → toast 显示订单号
5. 新建法币订单：切换类型后 Crypto 字段应消失、收款方自动变卖家、银行账号自动带出
6. 订单列表按类型、状态、日期、订单号筛选
7. **订单详情把状态改成「已完成」→ 徽标变绿、时间线新增一条**（最值得重点看，状态日志是数据库
   trigger 写的，这一步同时验证了 trigger 和缓存失效两条链路）
8. 退出登录 → 回到 `/login`，直接访问 `/orders` 应被拦截

额外建议在第 4 步顺便确认一件事：`Order.amount` 的类型现在标注为 `string | number`。
PostgREST 把 `numeric` 序列化成 JSON number，但没有实机验证过。看一眼实际返回值，
确认后可以把类型收窄成准确的那个（`src/lib/schema.ts` 里有对应注释）。

## 三、已知遗留项（已裁决，非阻塞）

按严重度排列。前两项有明确修法，都是一行左右。

| # | 位置 | 问题 | 裁决理由 |
|---|---|---|---|
| P1 | `src/lib/schema.ts` 的 `decimalPlaces` | 对指数记数法欠计小数位：`decimalPlaces(0.000000123)` 返回 7 而非 9，于是小于 `1e-6` 的金额会绕过 8 位精度校验，被 `numeric(38,8)` 静默舍入 | 影响面是 0.000001 以下的极小额（BTC 百聪级）。修法：按 `e-` 拆分后加上尾数的小数位长度 |
| P2 | `CounterpartyOptionNotice.tsx` | `OPTION_LIMIT = 500` 与 `api.ts` 里的 `.limit(500)` 是两份独立拷贝，改一处另一处会静默失效 | 修法：从 `api.ts` 导出常量并 import |
| P3 | `OrderForm.tsx` | 提示容器 div 无条件渲染，正常情况下在金额下方占约 16px 空行 | 纯视觉 |
| P4 | `OrderListPage.tsx` | UTC 提示让该列比同行控件高，筛选行垂直居中略偏 | 纯视觉 |

## 四、两个刻意的设计决定（不要"顺手改掉"）

**订单号用 UTC 日期。** 你明确选择了保持 UTC。代价是：北京时间 00:00–08:00 创建的订单，
界面显示的创建时间是当天，订单号里的日期却是前一天。

由此引出一个需要注意的操作陷阱：订单列表的**日期筛选器用本地时区**（与显示一致），
但**订单号搜索框搜的是 UTC 日期**。运营想查"今天的订单"，用筛选器和用 `ORD20260807`
搜索会得到相差最多 8 小时订单量的两个答案。搜索框下方已加了提示文案，但值得口头交代一次。

**`npm audit` 会一直报一条 react-router 高危。** GHSA-qwww-vcr4-c8h2 影响的是 RSC 模式，
本项目是纯客户端 SPA，没有 loader、action 或服务端，不触及该代码路径（已核实 7.18.2 的
exports map 根本没有 RSC 入口）。**不要跑 `npm audit fix --force`**——它会把 react-router
升到 v8 这个 breaking major，而全部 11 个任务都是按 v7 API 写的。README 里也记了这条。

## 五、与设计文档的偏差

实现过程中有三处没有做到设计文档 §5 的描述，都不影响主流程：

- **买卖家下拉框不可搜索**（设计文档 §5.3 要求"下拉带搜索"）。目前是原生 `<select>`，
  且后端取数有 500 条上限——超过时会显示截断警告，但仍需要滚动查找。
  记录数上去之后建议换成可筛选的 combobox。
- **买卖家列表没有「操作」列**（§5.1 提到）。目前靠点击整行进入详情，且应用里没有任何删除入口。
- **国家字段的枚举只由 `<select>` 约束**，zod 和数据库都当自由文本。`COUNTRIES` 里还有一个
  非 ISO 的 `'OTHER'` 选项。
