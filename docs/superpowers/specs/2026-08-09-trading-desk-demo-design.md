# 订单池撮合 Demo 设计文档

**日期：** 2026-08-09
**目标：** 按 Trustline 的视觉与信息架构重做 Atara 应用，核心是订单池撮合 + 队列 + 拟真的 AI 风控推理。纯前端，不写数据库。

---

## 定位

这是一个**演示用的前端 Demo**，不是可上线的产品。所有数据在内存，刷新用 sessionStorage 兜住。判断取舍的唯一标准是：**演示时看起来是否可信、是否好看**。

参考对象是 `~/Desktop` 上 Trustline（portal.t54.ai）的 6 个页面快照：Overview、Queue、Challenges、Disputes、Request logs、KYA。

---

## 关于「AI」

**不调用任何真实 AI，不发任何网络请求，不需要 API key。**

风控推理由 `riskEngine.ts` 本地算出：输入一笔交易和对手方数据，输出一个分数加若干条检查结论。UI 再把这些结论按节奏一条条显示出来，配打字机光标和逐项点亮，看起来像模型在推理。

做成函数而非写死文案，理由只有一个：**看起来更真**。不同的单跑出来的检查项、数值、结论各不相同，不会撮合十笔单弹出十遍相同台词。成本相同，可信度差很多。

同样的理由，评分用交易 id 做种子的伪随机，而不是 `Math.random()` —— 同一笔单反复查看结果一致，重新渲染不会让分数跳变。

---

## 分层

`src/demo/` 装全部新代码。`src/features/*`、`src/lib/supabase.ts`、`src/layouts/*` 原样保留但**不再挂路由**。

这样现有 132 个测试继续通过（它们测的是模块，不是路由），真实应用随时能接回来。Demo 与真实实现互不干扰。

---

## 设计令牌

从 Trustline 的 `index-CSKppUtE.css` 抽出，写进 `src/index.css` 的 `@theme`：

```
--color-bg:            #0b0d12     页面底色
--color-surface:       #171821     卡片/面板
--color-surface-raised:#1d1f2a     悬浮层、抽屉、表头
--color-ink:           #fbf9ff     正文
--color-muted:         #a8a7b6     次要文字
--color-line:          #2b2d39     分隔线
--color-line-strong:   #444756     输入框边框
--color-brand:         #7cd8c4     强调色（薄荷绿）
--color-brand-dim:     #1ea98e     强调色暗态、辉光
--color-ok:            #8ee0ba     通过
--color-ok-muted:      #123b2b
--color-warn:          #f1b991     警告
--color-bad:           #ffb4aa     拒绝
--color-bad-muted:     #4a1f1b
--color-info:          #9fc5ff
--color-info-muted:    #172d4f
--color-series-1..5:   #8ee6c9 #a8c1ff #f1b991 #ffaaa5 #cabdff

--radius-xs 8px  --radius-sm 12px  --radius-panel 16px  --radius-md 18px  --radius-lg 26px
--shadow-panel: 0 14px 34px #00000057
```

密度沿用 Trustline：页面 padding 30、卡片 padding 22、卡片间距 18、表格单元 18×14、控件高 34/44/48。

**新令牌是追加，不是替换。** 现有的 `--color-primary`、`--color-ink-3`、`--radius-card` 等全部保留 —— 删掉会让未路由的旧组件失去样式，而它们的测试还在跑。代价只是 CSS 略大，换来的是随时可回退。

`body` 背景改成 `--color-bg`。React 应用整体变暗色；落地页是独立 HTML，不受影响。

---

## 领域模型

```ts
type DeskKind = 'buy' | 'sell';
type TxStatus = 'queued' | 'validating' | 'passed' | 'challenged' | 'declined';
type CheckStatus = 'pass' | 'warn' | 'fail';

interface Desk {
  kind: DeskKind;
  displayId: string;        // D000123
  name: string;
  verifiedAt: string | null;   // null = 未开通
  completedTrades: number;
  disputes: number;
  avgResponseMin: number;
}

interface Counterparty {
  displayId: string;
  name: string;
  score: number;            // 0-100 席位评分
  completedTrades: number;
  disputes: number;
  avgResponseMin: number;
  verified: boolean;
  firstSeenAt: string;
}

interface PoolOrder {
  id: string;
  side: DeskKind;           // 挂单方向：sell = 对手方要卖，买方席位才能吃
  asset: string;            // USDT / BTC / ETH ...
  chain: string;
  amount: number;
  fiatCurrency: string;
  price: number;            // 单价
  fiatTotal: number;
  counterparty: Counterparty;
  postedAt: string;
  expiresAt: string;
}

interface RiskCheck {
  id: string;
  label: string;            // 「链上地址制裁名单筛查」
  status: CheckStatus;
  detail: string;           // 「无命中（OFAC / UN / EU）」
  weight: number;
}

interface RiskResult {
  score: number;            // 0-100
  threshold: number;        // 70
  verdict: 'pass' | 'challenge' | 'decline';
  checks: RiskCheck[];
}

interface Transaction {
  id: string;
  poolOrderId: string;
  side: DeskKind;
  asset: string;
  amount: number;
  fiatTotal: number;
  counterparty: Counterparty;
  status: TxStatus;
  createdAt: string;
  risk: RiskResult | null;
}

interface Challenge {
  id: string;
  txId: string;
  reason: string;
  required: string[];       // 需补充的材料项
  state: 'open' | 'resolved';
  openedAt: string;
}
```

---

## 三个引擎（纯函数，各配单测）

**刻意写得很薄。** 这是 Demo，没有人会去核验规则是否合理，把风控写成一套真的加权模型只是在增加会出错的代码。引擎存在的意义只有两个：让屏幕上的数字和结论**互相对得上**，以及让**不同的单看起来不一样**。除此之外一条业务规则都不加。

### `matching.ts`

```ts
matchOrder(myDesk: Desk): { ok: true } | { ok: false; reason: string }
```

**只有一条规则**：席位未开通（`verifiedAt === null`）就不能撮合，提示「请先开通{买方|卖方}席位」。

方向互补、挂单过期、自成交这些统统不做 —— 订单池里的每一笔单都可以撮合。保留这一条是因为它给「我的席位」页一个存在的理由，并且在抽屉里能引出一个「去开通席位」的跳转，成本三行。

### `riskEngine.ts`

```ts
assessRisk(tx: Transaction): RiskResult
```

**先由种子定分数，再倒推出几条好看的检查项** —— 不是先算检查再加权得分。这个顺序反过来是有意的：它保证画面上的结论永远自洽（分数低就一定能看到问题项），而且代码量只有加权模型的三分之一。

1. `score = 45 + floor(rand() * 55) + resubmits * 15`，上限 100
2. 按分数决定有几项不合格：`≥85` 全过；`≥70` 一项警告；`≥50` 两项警告；`<50` 三项，其中一项为 fail
3. 从六个固定检查项里按种子挑出这几项标记为问题项，其余为通过
4. 每项的 detail 文案从模板生成，数字由种子填充（成交笔数、响应分钟、存续天数、金额倍数）

裁决：`score >= 70` → pass；`50 <= score < 70` → challenge；`< 50` → decline。

六个检查项是固定的：核对席位实名状态、拉取对手方历史成交、链上地址制裁名单筛查、金额异常检测、对手方响应时效、账户存续时长。

伪随机一律用 `seededRandom(tx.id)`，保证同一笔单反复查看结果一致。

### `queueMachine.ts`

```ts
nextStatus(current: TxStatus, event: QueueEvent): TxStatus | null
```

```
queued      --start-->     validating
validating  --pass-->      passed
validating  --challenge--> challenged
validating  --decline-->   declined
challenged  --resolve-->   validating     // 补齐材料后重跑
passed / declined                          // 终态
```

非法转换返回 `null`，调用方忽略。这面镜子照的是 Trustline Queue 页那四个状态磁贴（Live tasks / Queuing / Validating / Challenging）。

---

## 状态容器

`DemoProvider`（Context + `useReducer`），持有：我的两个席位、订单池、交易列表、挑战列表。

- 全部状态写进 sessionStorage，**刷新不丢** —— 演示到一半刷新页面全没了是最尴尬的失败模式。
- 提供 `reset()` 恢复种子数据，方便重复演示。
- 订单池每 8 秒随机插入一笔新挂单（带滑入动画），制造「池子是活的」的观感。

种子数据：约 40 笔挂单，对手方姓名、评分、成交数各不相同，覆盖 USDT/BTC/ETH 与 USD/EUR/HKD/CNY 的组合。

---

## 五个页面

侧边栏与页头照抄 Trustline：品牌 + Sandbox/Production 环境切换 + 亮/暗/系统主题 + 分组导航 + 用户卡 + 退出；页头为标题 + Export（CSV / PDF）+ Docs。筛选条照抄 `No X filters applied` / `Filters` / `N loaded` / `Sorted by created descending` / `Columns` / `Reset` 那一套。

| 路由 | 页面 | 内容 |
|---|---|---|
| `/app/overview` | 概览 | 8 个 KPI 磁贴 + Task backlog 面板 + 4 张 SVG 走势图 |
| `/app/pool` | 订单池 | 筛选条 + 挂单表格 + 撮合抽屉 + 撮合动画 |
| `/app/queue` | 队列 | 4 个状态磁贴 + 交易表格 + AI 推理抽屉 |
| `/app/challenges` | 风控挡单 | 被挡交易列表 + 补材料重提交 |
| `/app/desk` | 我的席位 | 买方席位 / 卖方席位开通与详情 |

`/app` 重定向到 `/app/overview`。

**术语**：「买家档案 / 卖家档案」全部改为「**买方席位 / 卖方席位**」，英文 Trading Desk。「开通席位」比「开通档案」有分量，也和落地页的 `desk.html`（Settlement desk）对得上。

---

## 主流程

1. 订单池挂着几十笔别人的单。筛选出一笔卖单，点「撮合」。
2. 抽屉滑出：对手方席位信息、历史成交、评分，以及一句 AI 初判。
3. 确认撮合 → **撮合动画**：两张卡片向中间汇聚合并成一张交易卡。
4. 生成 `Transaction`，状态 `queued`，跳转 Queue 页。
5. 约 1 秒后自动 `start` → `validating`，右侧 **AI 推理面板**开始流式输出六项检查：

```
◐ 核对席位实名状态………………… ✓ 已验证 · 2026-03 起
◐ 拉取对手方历史成交……………… ✓ 12 笔完成 · 0 争议
◐ 链上地址制裁名单筛查………… ✓ 无命中（OFAC / UN / EU）
◐ 金额异常检测…………………………… ⚠ 高于该席位均值 3.2×
◐ 对手方响应时效………………………… ✓ 中位 4 分钟
◐ 账户存续时长…………………………… ✓ 214 天
────────────────────────────────
综合评分 82 / 100 → 阈值 70 → 放行
```

每项间隔 600–900ms，打字机光标 + 逐项点亮，最后评分做环形进度动画。

6. 裁决落地：pass → `passed`；challenge → `challenged` 并生成 Challenge 进挑战页；decline → `declined`。
7. 挑战页可「补充材料并重新提交」→ 回到 `validating` 重跑一遍推理，第二次分数会因材料齐备而提高。

---

## 动效预算

全部 CSS 与内联 SVG，**不新增任何依赖**：

- 撮合汇聚动画（两卡合一）
- AI 推理打字机 + 检查项逐条点亮
- 评分环形进度（SVG `stroke-dasharray` 动画）
- 订单池新挂单滑入 + 薄荷绿微光
- KPI 数字 count-up
- 状态徽章辉光（`box-shadow` + 薄荷绿）
- 队列行状态推进进度条

一律尊重 `prefers-reduced-motion`：动画降级为直接显示终态。这是落地页已有的约定，Demo 保持一致。

---

## 登录

`/app/login` 与 `/app/register` **保留**（落地页导航指向它们，`src/__tests__/landingEntry.test.ts` 盯着），但改为一键进入：任意输入即可通过，另有醒目的「以演示身份进入」按钮。会话状态存 sessionStorage。

这两个页面同样用新的暗色令牌重做，与 Demo 视觉一致。

---

## 测试

- 三个引擎各配单测：`matching`（唯一那条规则的两侧）、`riskEngine`（分数落在 0..100、种子稳定、六项检查、分数与裁决自洽、补材料后加分）、`queueMachine`（全部合法转换 + 非法转换返回 null）。测试只钉住「屏幕上不会出现自相矛盾的东西」，不去验证任何业务规则的合理性 —— 那些规则本来就是编的。
- 现有 132 个测试保持通过。
- `src/__tests__/landingEntry.test.ts` 保持通过。
- `npm run build` 通过（`tsc -b` 严格模式，开了 `noUnusedLocals` / `noUnusedParameters`）。

组件层不写快照测试 —— 这是个视觉 Demo，快照只会在每次调样式时制造噪音。视觉靠手动核对。

---

## 不做

- 不调用任何真实 AI 服务，不发网络请求，不需要 API key
- 不写数据库，不改 `supabase/migrations/`
- 不删除现有的 `src/features/*`、`src/lib/supabase.ts`、`src/layouts/*`
- 不做 Disputes、Request logs、KYA 三个页面（Trustline 有，本次不抄）
- 不改落地页
- 不新增 npm 依赖

---

## 已知遗留

- 旧的真实应用代码留在仓库里但不可达。要么后续接回来，要么单独一次清理，本次不处理。
- Demo 与真实 Supabase 数据模型（`counterparties` / `orders`）不一致：席位、订单池、挑战都是新概念。若日后要落地成真实功能，需要一次数据模型迁移设计，不在本次范围。
