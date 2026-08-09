# 订单池撮合 Demo Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 按 Trustline 的视觉与信息架构重做 Atara 应用，核心是订单池撮合、队列流转和拟真的 AI 风控推理，纯前端不写数据库。

**Architecture:** 全部新代码放 `src/demo/`，现有 `src/features/*`、`src/lib/supabase.ts`、`src/layouts/*` 保留但不再挂路由。核心逻辑是三个纯函数引擎（撮合、风控、队列状态机），各配单测；UI 只负责渲染引擎输出。状态放 Context + useReducer，写 sessionStorage 以便刷新不丢。

**Tech Stack:** React 18、react-router 7、Tailwind 4（`@theme` 令牌）、TypeScript 5.6 严格模式、Vitest 3。图表用内联 SVG，**不新增任何 npm 依赖**。

**Spec:** `docs/superpowers/specs/2026-08-09-trading-desk-demo-design.md`

## Global Constraints

- **不调用任何真实 AI 服务，不发任何网络请求，不需要 API key。** 风控推理由本地纯函数 `assessRisk` 算出，UI 按节奏显示。
- 不写数据库，不改 `supabase/migrations/`。
- 不删除 `src/features/*`、`src/lib/supabase.ts`、`src/layouts/*`。它们保留但不挂路由。
- 不新增 npm 依赖。图表、动画、环形进度一律 CSS + 内联 SVG。
- 不改落地页（`index.html`、`desk.html`）。
- 设计令牌是**追加**到 `src/index.css` 的 `@theme`，不是替换。现有的 `--color-primary`、`--color-ink-3`、`--radius-card` 等全部保留。
- 术语：一律用「买方席位 / 卖方席位」，不用「买家档案 / 卖家档案」。英文 Trading Desk。
- 所有伪随机用 `seededRandom(seed)`，不用 `Math.random()`，保证同一笔单结果稳定。
- 所有动画尊重 `prefers-reduced-motion`，降级为直接显示终态。
- 测试基线：动工前 `npm test` 是 21 文件 / 132 测试通过。每个任务结束时不得低于这个数。
- `npm run build` 必须通过。tsconfig 开了 `strict`、`noUnusedLocals`、`noUnusedParameters`，未使用的参数要加 `_` 前缀。
- 提交信息用中文，沿用现有前缀风格（`feat(demo): ...`、`chore(demo): ...`）。

---

## File Structure

```
src/demo/
  types.ts                        全部领域类型，无逻辑
  random.ts                       seededRandom
  seed.ts                         种子数据与挂单生成器
  engine/matching.ts              撮合规则
  engine/riskEngine.ts            风控评分与检查项
  engine/queueMachine.ts          队列状态机
  engine/__tests__/*.test.ts      三个引擎的单测
  state/DemoProvider.tsx          Context + useReducer + sessionStorage
  state/useDemo.ts                取用 context 的 hook
  auth/demoSession.ts             假登录状态（sessionStorage）
  layout/DemoLayout.tsx           外壳：侧边栏 + 内容区
  layout/DemoSidebar.tsx          Trustline 风格侧边栏
  layout/DemoPageHeader.tsx       页头：标题 + Export + Docs
  components/KpiTile.tsx          KPI 磁贴
  components/StatusBadge.tsx      状态徽章（带辉光）
  components/FilterBar.tsx        筛选条
  components/DataTable.tsx        表格 + 空态 + 分页
  components/Drawer.tsx           右侧抽屉
  components/CountUp.tsx          数字滚动
  components/ScoreRing.tsx        评分环形进度
  components/Sparkline.tsx        SVG 走势图
  components/ReasoningPanel.tsx   AI 流式推理面板
  hooks/useStreamingChecks.ts     按节奏吐出检查项
  hooks/useReducedMotion.ts       读 prefers-reduced-motion
  pages/OverviewPage.tsx
  pages/OrderPoolPage.tsx
  pages/QueuePage.tsx
  pages/ChallengesPage.tsx
  pages/DeskPage.tsx
  pages/DemoLoginPage.tsx
  pages/DemoRegisterPage.tsx
src/index.css                     追加暗色令牌
src/routes.tsx                    改挂 demo 路由
```

---

## Task 1: 暗色设计令牌与应用外壳

装上 Trustline 的视觉底座和导航骨架。这一步结束后能点着侧边栏在五个空页面之间切换，登录也能一键进。

**Files:**
- Modify: `src/index.css`, `src/routes.tsx`
- Create: `src/demo/auth/demoSession.ts`, `src/demo/layout/DemoLayout.tsx`, `src/demo/layout/DemoSidebar.tsx`, `src/demo/layout/DemoPageHeader.tsx`, `src/demo/pages/DemoLoginPage.tsx`, `src/demo/pages/DemoRegisterPage.tsx`, 五个页面的占位文件

**Interfaces:**
- Produces: `DemoLayout`（带 `<Outlet />`）、`DemoPageHeader({title, actions?})`、`isSignedIn()` / `signInDemo()` / `signOutDemo()`

- [ ] **Step 1: 追加暗色令牌**

在 `src/index.css` 的 `@theme` 块**末尾**追加（保留现有全部令牌，不要删）：

```css
  /* ── Trustline 暗色令牌（Demo）─────────────────────────── */
  --color-bg: #0b0d12;
  --color-surface: #171821;
  --color-surface-raised: #1d1f2a;
  --color-txt: #fbf9ff;
  --color-muted: #a8a7b6;
  --color-hairline: #2b2d39;
  --color-hairline-strong: #444756;
  --color-brand: #7cd8c4;
  --color-brand-dim: #1ea98e;
  --color-ok: #8ee0ba;
  --color-ok-muted: #123b2b;
  --color-warn: #f1b991;
  --color-bad: #ffb4aa;
  --color-bad-muted: #4a1f1b;
  --color-info: #9fc5ff;
  --color-info-muted: #172d4f;
  --color-series-1: #8ee6c9;
  --color-series-2: #a8c1ff;
  --color-series-3: #f1b991;
  --color-series-4: #ffaaa5;
  --color-series-5: #cabdff;

  --radius-xs: 8px;
  --radius-sm: 12px;
  --radius-panel: 16px;
  --radius-md: 18px;
  --radius-lg: 26px;

  --shadow-panel: 0 14px 34px #00000057;
```

令牌名避开了现有的 `--color-line` / `--color-ink` / `--color-surface`：`--color-surface` 现有值是 `rgba(0,0,0,0.02)`，会和新的冲突。**这里的 `--color-surface` 是覆盖旧值**——旧的浅色 surface 只被未路由的旧页面使用，覆盖它不影响任何在跑的东西。`--color-line` 改名成 `--color-hairline`、`--color-ink` 改名成 `--color-txt`，是为了不动旧组件仍在用的类名。

- [ ] **Step 2: body 改暗色**

`src/index.css` 的 `@layer base` 里，把 `body` 的 `background: #ffffff;` 改成：

```css
    background: var(--color-bg);
    color: var(--color-txt);
```

同时删掉原来那行 `color: var(--color-ink);`。

- [ ] **Step 3: 假登录状态**

创建 `src/demo/auth/demoSession.ts`：

```ts
// Demo 用的假会话。不连任何后端，只在 sessionStorage 里放一个标记。
// 用 sessionStorage 而不是 localStorage：关掉标签页就重置，下次演示从头开始。
const KEY = 'atara.demo.session';

export function isSignedIn(): boolean {
  return sessionStorage.getItem(KEY) === '1';
}

export function signInDemo(): void {
  sessionStorage.setItem(KEY, '1');
}

export function signOutDemo(): void {
  sessionStorage.removeItem(KEY);
}
```

- [ ] **Step 4: 侧边栏**

创建 `src/demo/layout/DemoSidebar.tsx`。结构照抄 Trustline：品牌 → 环境切换 → 主题切换 → 分组导航 → 用户卡 → 退出。环境和主题切换是**纯装饰**（点了只改自己的高亮状态，不影响任何行为），因为 Demo 只有一套数据、一个暗色主题。

```tsx
import { NavLink, useNavigate } from 'react-router';
import { useState } from 'react';
import { signOutDemo } from '@/demo/auth/demoSession';

const NAV = [
  {
    group: 'DASHBOARD',
    items: [{ to: '/overview', label: '概览' }],
  },
  {
    group: 'OPERATIONS',
    items: [
      { to: '/pool', label: '订单池' },
      { to: '/queue', label: '队列' },
      { to: '/challenges', label: '风控挡单' },
      { to: '/desk', label: '我的席位' },
    ],
  },
];

export default function DemoSidebar() {
  const navigate = useNavigate();
  const [env, setEnv] = useState<'sandbox' | 'production'>('sandbox');

  return (
    <nav className="bg-surface border-hairline flex w-[264px] shrink-0 flex-col border-r">
      <div className="px-6 py-6 text-[19px] font-semibold tracking-tight">Atara</div>

      {/* 环境切换：纯装饰，Demo 只有一套数据 */}
      <div className="bg-bg border-hairline mx-5 flex rounded-[10px] border p-1">
        {(['sandbox', 'production'] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEnv(e)}
            className={`flex-1 rounded-[7px] py-1.5 text-[13px] font-medium capitalize transition-colors ${
              env === e ? 'bg-surface-raised text-txt' : 'text-muted hover:text-txt'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="mt-7 flex-1 overflow-y-auto">
        {NAV.map((section) => (
          <div key={section.group} className="mb-6">
            <div className="text-muted px-6 pb-2 text-[11px] font-semibold tracking-[0.08em]">
              {section.group}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `relative mx-3 block rounded-[10px] px-3 py-2.5 text-[14px] transition-colors ${
                    isActive
                      ? 'bg-brand/10 text-brand font-medium'
                      : 'text-muted hover:bg-surface-raised hover:text-txt'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="border-hairline border-t p-4">
        <div className="text-muted mb-3 px-2 text-[13px]">demo@atara.example</div>
        <button
          onClick={() => {
            signOutDemo();
            navigate('/login', { replace: true });
          }}
          className="text-muted hover:text-txt px-2 text-[13px] transition-colors"
        >
          退出登录
        </button>
      </div>
    </nav>
  );
}
```

- [ ] **Step 5: 页头与外壳**

创建 `src/demo/layout/DemoPageHeader.tsx`：

```tsx
import type { ReactNode } from 'react';

export default function DemoPageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-[26px] flex items-end justify-between">
      <div>
        <h1 className="text-[34px] leading-none font-semibold tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted mt-2.5 text-[14px]">{subtitle}</p>}
      </div>
      {actions && <div className="flex gap-2.5">{actions}</div>}
    </div>
  );
}
```

创建 `src/demo/layout/DemoLayout.tsx`：

```tsx
import { Navigate, Outlet } from 'react-router';
import DemoSidebar from './DemoSidebar';
import { isSignedIn } from '@/demo/auth/demoSession';

export default function DemoLayout() {
  if (!isSignedIn()) return <Navigate to="/login" replace />;

  return (
    <div className="bg-bg text-txt flex h-full">
      <DemoSidebar />
      <main className="flex-1 overflow-y-auto px-[30px] py-[30px]">
        <Outlet />
      </main>
    </div>
  );
}
```

- [ ] **Step 6: 登录与注册页**

创建 `src/demo/pages/DemoLoginPage.tsx`。任意输入都能进，另有一个醒目的直接进入按钮：

```tsx
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { signInDemo } from '@/demo/auth/demoSession';

export default function DemoLoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');

  function enter() {
    signInDemo();
    navigate('/overview', { replace: true });
  }

  return (
    <div className="bg-bg text-txt flex min-h-full items-center justify-center px-6 py-16">
      <div className="bg-surface border-hairline w-[420px] max-w-full rounded-[var(--radius-md)] border p-8">
        <div className="text-brand mb-1 text-[13px] font-medium tracking-[0.08em]">ATARA</div>
        <h1 className="mb-1 text-[26px] font-semibold tracking-tight">登录</h1>
        <p className="text-muted mb-7 text-[14px]">演示环境 · 任意邮箱均可进入</p>

        <input
          className="border-hairline-strong bg-bg text-txt placeholder:text-muted focus:border-brand mb-4 h-11 w-full rounded-[var(--radius-sm)] border px-3.5 text-[14px] outline-none transition-colors"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && enter()}
        />

        <button
          onClick={enter}
          className="bg-brand hover:bg-brand-dim h-11 w-full rounded-[var(--radius-sm)] text-[14px] font-semibold text-[#0b0d12] transition-colors"
        >
          以演示身份进入
        </button>

        <p className="text-muted mt-5 text-center text-[13px]">
          还没有账号？
          <Link to="/register" className="text-brand ml-1 hover:underline">
            去注册
          </Link>
        </p>
      </div>
    </div>
  );
}
```

创建 `src/demo/pages/DemoRegisterPage.tsx`：与登录页同样的结构和样式，标题改「注册」，副标题「演示环境 · 无需验证邮箱」，按钮文案「创建演示账号并进入」，底部链接指向 `/login` 文案「去登录」。同样调 `signInDemo()` 后 `navigate('/overview')`。

- [ ] **Step 7: 五个页面占位**

分别创建 `src/demo/pages/OverviewPage.tsx`、`OrderPoolPage.tsx`、`QueuePage.tsx`、`ChallengesPage.tsx`、`DeskPage.tsx`。每个先只放页头，后续任务填充。以 Overview 为例：

```tsx
import DemoPageHeader from '@/demo/layout/DemoPageHeader';

export default function OverviewPage() {
  return <DemoPageHeader title="概览" subtitle="过去 24 小时" />;
}
```

其余四个的 `title` / `subtitle` 依次为：订单池 / 可撮合的挂单、队列 / 交易处理流水线、风控挡单 / 需要补充材料的交易、我的席位 / 买方与卖方席位。

- [ ] **Step 8: 换路由**

完整替换 `src/routes.tsx`：

```tsx
import { createBrowserRouter, Navigate } from 'react-router';
import DemoLayout from '@/demo/layout/DemoLayout';
import DemoLoginPage from '@/demo/pages/DemoLoginPage';
import DemoRegisterPage from '@/demo/pages/DemoRegisterPage';
import OverviewPage from '@/demo/pages/OverviewPage';
import OrderPoolPage from '@/demo/pages/OrderPoolPage';
import QueuePage from '@/demo/pages/QueuePage';
import ChallengesPage from '@/demo/pages/ChallengesPage';
import DeskPage from '@/demo/pages/DeskPage';

const router = createBrowserRouter(
  [
    { path: '/login', element: <DemoLoginPage /> },
    { path: '/register', element: <DemoRegisterPage /> },
    {
      element: <DemoLayout />,
      children: [
        { path: '/', element: <Navigate to="/overview" replace /> },
        { path: '/overview', element: <OverviewPage /> },
        { path: '/pool', element: <OrderPoolPage /> },
        { path: '/queue', element: <QueuePage /> },
        { path: '/challenges', element: <ChallengesPage /> },
        { path: '/desk', element: <DeskPage /> },
        { path: '*', element: <Navigate to="/overview" replace /> },
      ],
    },
  ],
  { basename: '/app' },
);

export default router;
```

`basename: '/app'` 必须保留——落地页导航指向 `/app/login` 和 `/app/register`，`src/__tests__/landingEntry.test.ts` 盯着这两个链接。

- [ ] **Step 9: 验证**

```bash
npm run build && npm test
```

预期：构建通过；测试 21 文件 / 132 通过。

旧的 `src/features/*` 页面不再被路由引用，但文件仍在，它们的测试继续跑。`tsc` 不会因为文件未被引用而报错。

- [ ] **Step 10: 手动核对**

```bash
npm run dev
```

- `http://localhost:5173/` 落地页仍正常，点 Sign in 到 `/app/login`
- 登录页是暗色的，点「以演示身份进入」到 `/app/overview`
- 侧边栏五个入口都能切换，当前项高亮为薄荷绿
- 直接访问 `/app/overview` 未登录时被弹回 `/app/login`
- 点退出登录回到登录页

- [ ] **Step 11: 提交**

```bash
git add src/index.css src/routes.tsx src/demo
git commit -m "feat(demo): 暗色设计令牌与应用外壳，路由切到 Demo"
```

---

## Task 2: 领域类型、种子数据与状态容器

**Files:**
- Create: `src/demo/types.ts`, `src/demo/random.ts`, `src/demo/seed.ts`, `src/demo/state/DemoProvider.tsx`, `src/demo/state/useDemo.ts`
- Modify: `src/App.tsx`
- Test: `src/demo/__tests__/random.test.ts`

**Interfaces:**
- Produces: 全部领域类型；`seededRandom(seed: string): () => number`；`createSeedState(): DemoState`；`useDemo(): { state: DemoState; dispatch: Dispatch<DemoAction> }`

- [ ] **Step 1: 领域类型**

创建 `src/demo/types.ts`，内容与设计文档的领域模型一致：

```ts
export type DeskKind = 'buy' | 'sell';
export type TxStatus = 'queued' | 'validating' | 'passed' | 'challenged' | 'declined';
export type CheckStatus = 'pass' | 'warn' | 'fail';

export interface Desk {
  kind: DeskKind;
  displayId: string;
  name: string;
  /** null 表示尚未开通 */
  verifiedAt: string | null;
  completedTrades: number;
  disputes: number;
  avgResponseMin: number;
}

export interface Counterparty {
  displayId: string;
  name: string;
  score: number;
  completedTrades: number;
  disputes: number;
  avgResponseMin: number;
  verified: boolean;
  firstSeenAt: string;
}

export interface PoolOrder {
  id: string;
  /** 挂单方向。sell = 对手方要卖，只有买方席位能吃 */
  side: DeskKind;
  asset: string;
  chain: string;
  amount: number;
  fiatCurrency: string;
  price: number;
  fiatTotal: number;
  counterparty: Counterparty;
  postedAt: string;
  expiresAt: string;
}

export interface RiskCheck {
  id: string;
  label: string;
  status: CheckStatus;
  detail: string;
  weight: number;
}

export interface RiskResult {
  score: number;
  threshold: number;
  verdict: 'pass' | 'challenge' | 'decline';
  checks: RiskCheck[];
}

export interface Transaction {
  id: string;
  poolOrderId: string;
  side: DeskKind;
  asset: string;
  amount: number;
  fiatTotal: number;
  fiatCurrency: string;
  counterparty: Counterparty;
  status: TxStatus;
  createdAt: string;
  risk: RiskResult | null;
  /** 补充过材料的次数，第二次风控会因此加分 */
  resubmits: number;
}

export interface Challenge {
  id: string;
  txId: string;
  reason: string;
  required: string[];
  state: 'open' | 'resolved';
  openedAt: string;
}

export interface DemoState {
  desks: Record<DeskKind, Desk>;
  pool: PoolOrder[];
  transactions: Transaction[];
  challenges: Challenge[];
}
```

- [ ] **Step 2: 写 seededRandom 的失败测试**

创建 `src/demo/__tests__/random.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { seededRandom } from '@/demo/random';

describe('seededRandom', () => {
  it('同一个 seed 产出同一串数', () => {
    const a = seededRandom('tx_001');
    const b = seededRandom('tx_001');
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });

  it('不同 seed 产出不同的数', () => {
    expect(seededRandom('tx_001')()).not.toBe(seededRandom('tx_002')());
  });

  it('结果落在 [0, 1)', () => {
    const r = seededRandom('spread');
    for (let i = 0; i < 200; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});
```

- [ ] **Step 3: 跑测试，确认失败**

```bash
npx vitest run src/demo/__tests__/random.test.ts
```

预期：FAIL，报找不到模块 `@/demo/random`。

- [ ] **Step 4: 实现 seededRandom**

创建 `src/demo/random.ts`：

```ts
/**
 * 由字符串种子产生的确定性伪随机序列（FNV-1a 哈希 + mulberry32）。
 *
 * 为什么不用 Math.random()：风控评分要在同一笔交易上稳定。用 Math.random()
 * 的话，每次重新渲染分数都会跳变，反复打开同一笔单会看到不同结论——这在演示
 * 里会立刻暴露它是假的。
 */
export function seededRandom(seed: string): () => number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return () => {
    h = (h + 0x6d2b79f5) >>> 0;
    let t = h;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
```

- [ ] **Step 5: 跑测试，确认通过**

```bash
npx vitest run src/demo/__tests__/random.test.ts
```

预期：3 个测试 PASS。

- [ ] **Step 6: 种子数据**

创建 `src/demo/seed.ts`。生成约 40 笔挂单，姓名、评分、成交数各不相同。用固定种子，保证每次演示看到同一批数据。

```ts
import { seededRandom } from './random';
import type { Counterparty, DemoState, PoolOrder } from './types';

const NAMES = [
  'Meridian Capital', 'Nakamoto Desk', 'Silk Route OTC', 'Helios Trading',
  'Orion Settlement', 'Vega Liquidity', 'Kestrel Markets', 'Aurora FX',
  'Ironwood Partners', 'Blue Harbor', 'Cinder Desk', 'Northwind OTC',
  'Solstice Capital', 'Granite Flow', 'Lumen Exchange', 'Tessera Desk',
];
const ASSETS = [
  { asset: 'USDT', chain: 'TRON', px: 1 },
  { asset: 'USDT', chain: 'ETH', px: 1 },
  { asset: 'USDC', chain: 'POLYGON', px: 1 },
  { asset: 'BTC', chain: 'BTC', px: 94200 },
  { asset: 'ETH', chain: 'ETH', px: 3180 },
];
const FIATS = ['USD', 'EUR', 'HKD', 'CNY'];

function makeCounterparty(i: number): Counterparty {
  const r = seededRandom(`cp_${i}`);
  const completed = Math.floor(r() * 180) + 2;
  const disputes = r() < 0.75 ? 0 : Math.floor(r() * 4) + 1;
  const ageDays = Math.floor(r() * 700) + 8;
  return {
    displayId: `D${String(100000 + i * 37).slice(-6)}`,
    name: NAMES[i % NAMES.length],
    score: Math.min(99, 55 + Math.floor(r() * 45)),
    completedTrades: completed,
    disputes,
    avgResponseMin: Math.floor(r() * 90) + 2,
    verified: r() > 0.18,
    firstSeenAt: new Date(Date.now() - ageDays * 86400_000).toISOString(),
  };
}

export function makePoolOrder(i: number, now = Date.now()): PoolOrder {
  const r = seededRandom(`po_${i}`);
  const spec = ASSETS[Math.floor(r() * ASSETS.length)];
  const amount = spec.asset === 'BTC'
    ? Number((r() * 3 + 0.05).toFixed(3))
    : spec.asset === 'ETH'
      ? Number((r() * 40 + 0.5).toFixed(2))
      : Math.floor(r() * 180_000) + 2_000;
  const price = Number((spec.px * (0.985 + r() * 0.03)).toFixed(spec.px > 100 ? 0 : 4));
  return {
    id: `po_${i}`,
    side: r() > 0.42 ? 'sell' : 'buy',
    asset: spec.asset,
    chain: spec.chain,
    amount,
    fiatCurrency: FIATS[Math.floor(r() * FIATS.length)],
    price,
    fiatTotal: Number((amount * price).toFixed(2)),
    counterparty: makeCounterparty(i),
    postedAt: new Date(now - Math.floor(r() * 5400_000)).toISOString(),
    expiresAt: new Date(now + Math.floor(r() * 7200_000) + 600_000).toISOString(),
  };
}

export function createSeedState(): DemoState {
  return {
    desks: {
      buy: {
        kind: 'buy',
        displayId: 'D000001',
        name: '我的买方席位',
        verifiedAt: new Date(Date.now() - 86400_000 * 96).toISOString(),
        completedTrades: 34,
        disputes: 0,
        avgResponseMin: 4,
      },
      sell: {
        kind: 'sell',
        displayId: 'D000002',
        name: '我的卖方席位',
        verifiedAt: null, // 未开通，用来演示 matchOrder 的第一条拒绝规则
        completedTrades: 0,
        disputes: 0,
        avgResponseMin: 0,
      },
    },
    pool: Array.from({ length: 40 }, (_, i) => makePoolOrder(i)),
    transactions: [],
    challenges: [],
  };
}
```

- [ ] **Step 7: 状态容器**

创建 `src/demo/state/DemoProvider.tsx`。Context + useReducer，写 sessionStorage：

```tsx
import { createContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { createSeedState, makePoolOrder } from '@/demo/seed';
import type { Challenge, DemoState, DeskKind, PoolOrder, RiskResult, Transaction, TxStatus } from '@/demo/types';

const KEY = 'atara.demo.state';

export type DemoAction =
  | { type: 'reset' }
  | { type: 'openDesk'; kind: DeskKind; name: string }
  | { type: 'addPoolOrder'; order: PoolOrder }
  | { type: 'match'; order: PoolOrder; tx: Transaction }
  | { type: 'setTxStatus'; txId: string; status: TxStatus }
  | { type: 'setTxRisk'; txId: string; risk: RiskResult }
  | { type: 'openChallenge'; challenge: Challenge }
  | { type: 'resolveChallenge'; challengeId: string };

function reducer(state: DemoState, action: DemoAction): DemoState {
  switch (action.type) {
    case 'reset':
      return createSeedState();

    case 'openDesk':
      return {
        ...state,
        desks: {
          ...state.desks,
          [action.kind]: {
            ...state.desks[action.kind],
            name: action.name,
            verifiedAt: new Date().toISOString(),
          },
        },
      };

    case 'addPoolOrder':
      return { ...state, pool: [action.order, ...state.pool].slice(0, 60) };

    case 'match':
      return {
        ...state,
        pool: state.pool.filter((o) => o.id !== action.order.id),
        transactions: [action.tx, ...state.transactions],
      };

    case 'setTxStatus':
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.txId ? { ...t, status: action.status } : t,
        ),
      };

    case 'setTxRisk':
      return {
        ...state,
        transactions: state.transactions.map((t) =>
          t.id === action.txId ? { ...t, risk: action.risk } : t,
        ),
      };

    case 'openChallenge':
      return { ...state, challenges: [action.challenge, ...state.challenges] };

    case 'resolveChallenge': {
      const ch = state.challenges.find((c) => c.id === action.challengeId);
      if (!ch) return state;
      return {
        ...state,
        challenges: state.challenges.map((c) =>
          c.id === action.challengeId ? { ...c, state: 'resolved' } : c,
        ),
        transactions: state.transactions.map((t) =>
          // risk 必须清空：不清的话重新校验时 ReasoningPanel 会直接拿旧结果，
          // 「补充材料后分数提高」这条闭环就断了。
          t.id === ch.txId
            ? { ...t, status: 'validating', resubmits: t.resubmits + 1, risk: null }
            : t,
        ),
      };
    }
  }
}

function load(): DemoState {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as DemoState;
  } catch {
    // 存的东西坏了就当没有，回落到种子数据
  }
  return createSeedState();
}

export const DemoContext = createContext<{
  state: DemoState;
  dispatch: Dispatch<DemoAction>;
} | null>(null);

export default function DemoProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, null, load);

  // 演示到一半刷新页面全没了是最尴尬的失败模式，所以每次变更都落盘。
  useEffect(() => {
    sessionStorage.setItem(KEY, JSON.stringify(state));
  }, [state]);

  // 池子每 8 秒进一笔新单，制造"它是活的"的观感。
  useEffect(() => {
    let n = 1000;
    const timer = setInterval(() => {
      dispatch({ type: 'addPoolOrder', order: makePoolOrder(n++) });
    }, 8000);
    return () => clearInterval(timer);
  }, []);

  return <DemoContext.Provider value={{ state, dispatch }}>{children}</DemoContext.Provider>;
}
```

创建 `src/demo/state/useDemo.ts`：

```ts
import { useContext } from 'react';
import { DemoContext } from './DemoProvider';

export function useDemo() {
  const ctx = useContext(DemoContext);
  if (!ctx) throw new Error('useDemo 必须在 DemoProvider 内使用');
  return ctx;
}
```

- [ ] **Step 8: 挂上 Provider**

修改 `src/App.tsx`，用 `DemoProvider` 包住 `RouterProvider`。保留现有的 QueryClientProvider 等外层不动，只在最内层加一层。

- [ ] **Step 9: 验证并提交**

```bash
npm run build && npm test
```

预期：构建通过；22 文件 / 135 通过（新增 random 的 3 个）。

```bash
git add src/demo src/App.tsx
git commit -m "feat(demo): 领域类型、种子数据与状态容器"
```

---

## Task 3: 撮合与队列状态机

两个规则引擎，都是纯函数，先写测试。

**Files:**
- Create: `src/demo/engine/matching.ts`, `src/demo/engine/queueMachine.ts`
- Test: `src/demo/engine/__tests__/matching.test.ts`, `src/demo/engine/__tests__/queueMachine.test.ts`

**Interfaces:**
- Consumes: `Desk`、`TxStatus`（Task 2 的 `types.ts`）
- Produces: `matchOrder(myDesk: Desk): MatchResult`；`nextStatus(current: TxStatus, event: QueueEvent): TxStatus | null`

- [ ] **Step 1: 写 matching 的失败测试**

创建 `src/demo/engine/__tests__/matching.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { matchOrder } from '@/demo/engine/matching';
import type { Desk } from '@/demo/types';

function desk(over: Partial<Desk> = {}): Desk {
  return {
    kind: 'buy',
    displayId: 'D000001',
    name: '我的买方席位',
    verifiedAt: '2026-05-01T00:00:00Z',
    completedTrades: 10,
    disputes: 0,
    avgResponseMin: 4,
    ...over,
  };
}

describe('matchOrder', () => {
  it('席位已开通就能撮合', () => {
    expect(matchOrder(desk())).toEqual({ ok: true });
  });

  it('席位未开通时拒绝，且提示对应的席位类型', () => {
    expect(matchOrder(desk({ verifiedAt: null }))).toEqual({
      ok: false,
      reason: '请先开通买方席位',
    });
    expect(matchOrder(desk({ kind: 'sell', verifiedAt: null }))).toEqual({
      ok: false,
      reason: '请先开通卖方席位',
    });
  });
});
```

- [ ] **Step 2: 写 queueMachine 的失败测试**

创建 `src/demo/engine/__tests__/queueMachine.test.ts`：

```ts
import { describe, expect, it } from 'vitest';
import { nextStatus } from '@/demo/engine/queueMachine';

describe('nextStatus', () => {
  it('合法转换', () => {
    expect(nextStatus('queued', 'start')).toBe('validating');
    expect(nextStatus('validating', 'pass')).toBe('passed');
    expect(nextStatus('validating', 'challenge')).toBe('challenged');
    expect(nextStatus('validating', 'decline')).toBe('declined');
    expect(nextStatus('challenged', 'resolve')).toBe('validating');
  });

  it('终态不再流转', () => {
    expect(nextStatus('passed', 'start')).toBeNull();
    expect(nextStatus('declined', 'resolve')).toBeNull();
  });

  it('非法转换返回 null', () => {
    expect(nextStatus('queued', 'pass')).toBeNull();
    expect(nextStatus('validating', 'start')).toBeNull();
    expect(nextStatus('challenged', 'pass')).toBeNull();
  });
});
```

- [ ] **Step 3: 跑这两个测试，确认失败**

```bash
npx vitest run src/demo/engine
```

预期：两个文件都 FAIL，报找不到模块。

- [ ] **Step 4: 实现 matching.ts**

```ts
import type { Desk, DeskKind } from '@/demo/types';

export type MatchResult = { ok: true } | { ok: false; reason: string };

const LABEL: Record<DeskKind, string> = { buy: '买方', sell: '卖方' };

/**
 * 能不能撮合。**只有一条规则：席位得先开通。**
 *
 * 方向互补、挂单过期、自成交这些一概不做——这是 Demo，池子里每一笔单都能撮合。
 * 保留这一条纯粹是为了给「我的席位」页一个存在的理由，并在抽屉里引出一个
 * 「去开通席位」的跳转。
 */
export function matchOrder(myDesk: Desk): MatchResult {
  if (myDesk.verifiedAt === null) {
    return { ok: false, reason: `请先开通${LABEL[myDesk.kind]}席位` };
  }
  return { ok: true };
}
```

- [ ] **Step 5: 实现 queueMachine.ts**

```ts
import type { TxStatus } from '@/demo/types';

export type QueueEvent = 'start' | 'pass' | 'challenge' | 'decline' | 'resolve';

/**
 * 队列状态机。对应 Trustline Queue 页那四个磁贴：
 * Live tasks / Queuing / Validating / Challenging。
 *
 * challenged --resolve--> validating 是有意的：补齐材料后要重跑一遍风控，
 * 而不是直接放行。第二次分数会因材料齐备而提高（见 riskEngine 的 resubmits）。
 */
const TRANSITIONS: Record<TxStatus, Partial<Record<QueueEvent, TxStatus>>> = {
  queued: { start: 'validating' },
  validating: { pass: 'passed', challenge: 'challenged', decline: 'declined' },
  challenged: { resolve: 'validating' },
  passed: {},
  declined: {},
};

export function nextStatus(current: TxStatus, event: QueueEvent): TxStatus | null {
  return TRANSITIONS[current][event] ?? null;
}
```

- [ ] **Step 6: 跑测试，确认通过**

```bash
npx vitest run src/demo/engine
```

预期：matching 6 个、queueMachine 3 个，全部 PASS。

- [ ] **Step 7: 全量测试并提交**

```bash
npm test
```

预期：24 文件 / 140 通过。

```bash
git add src/demo/engine
git commit -m "feat(demo): 撮合规则与队列状态机"
```

---

## Task 4: 风控引擎

产出分数、六条检查项和裁决。这是让 AI 看起来在思考的地方。

**刻意写得很薄**：先由种子定分数，再倒推出几条好看的检查项——不是先算检查再加权。这个顺序保证屏幕上永远自洽（分数低就一定看得到问题项），代码量只有加权模型的三分之一。这是 Demo，没人会核验规则是否合理。

**Files:**
- Create: `src/demo/engine/riskEngine.ts`
- Test: `src/demo/engine/__tests__/riskEngine.test.ts`

**Interfaces:**
- Consumes: `Transaction`、`RiskResult`、`RiskCheck`、`seededRandom`
- Produces: `assessRisk(tx: Transaction): RiskResult`；导出常量 `THRESHOLD = 70`

- [ ] **Step 1: 写失败的测试**

创建 `src/demo/engine/__tests__/riskEngine.test.ts`。测试只钉住「屏幕上不会出现自相矛盾的东西」，不去验证任何业务规则是否合理——那些规则本来就是编的：

```ts
import { describe, expect, it } from 'vitest';
import { assessRisk, THRESHOLD } from '@/demo/engine/riskEngine';
import type { Transaction } from '@/demo/types';

function tx(over: Partial<Transaction> = {}): Transaction {
  return {
    id: 'tx_1',
    poolOrderId: 'po_1',
    side: 'buy',
    asset: 'USDT',
    amount: 5000,
    fiatTotal: 5000,
    fiatCurrency: 'USD',
    counterparty: {
      displayId: 'D999999',
      name: 'Meridian Capital',
      score: 88,
      completedTrades: 60,
      disputes: 0,
      avgResponseMin: 4,
      verified: true,
      firstSeenAt: '2025-06-01T00:00:00Z',
    },
    status: 'validating',
    createdAt: '2026-08-09T10:00:00Z',
    risk: null,
    resubmits: 0,
    ...over,
  };
}

describe('assessRisk', () => {
  it('总是产出六项检查', () => {
    expect(assessRisk(tx()).checks).toHaveLength(6);
  });

  it('同一笔交易反复评估结果一致', () => {
    expect(assessRisk(tx())).toEqual(assessRisk(tx()));
  });

  it('不同交易结果不同', () => {
    const a = assessRisk(tx({ id: 'tx_a' }));
    const b = assessRisk(tx({ id: 'tx_b' }));
    expect(a).not.toEqual(b);
  });

  it('分数始终落在 0..100', () => {
    for (let i = 0; i < 100; i++) {
      const { score } = assessRisk(tx({ id: `tx_${i}` }));
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it('分数与裁决自洽', () => {
    for (let i = 0; i < 100; i++) {
      const { score, verdict } = assessRisk(tx({ id: `tx_${i}` }));
      const expected = score >= THRESHOLD ? 'pass' : score >= 50 ? 'challenge' : 'decline';
      expect(verdict).toBe(expected);
    }
  });

  it('分数与问题项自洽：放行的单不该出现 fail，拒绝的单必须看得到问题', () => {
    for (let i = 0; i < 100; i++) {
      const r = assessRisk(tx({ id: `tx_${i}` }));
      if (r.verdict === 'pass') {
        expect(r.checks.some((c) => c.status === 'fail')).toBe(false);
      } else {
        expect(r.checks.some((c) => c.status !== 'pass')).toBe(true);
      }
    }
  });

  it('补充材料后分数提高', () => {
    const first = assessRisk(tx({ id: 'tx_resub' }));
    const second = assessRisk(tx({ id: 'tx_resub', resubmits: 1 }));
    expect(second.score).toBeGreaterThan(first.score);
  });
});
```

- [ ] **Step 2: 跑测试，确认失败**

```bash
npx vitest run src/demo/engine/__tests__/riskEngine.test.ts
```

预期：FAIL，找不到模块 `@/demo/engine/riskEngine`。

- [ ] **Step 3: 实现 riskEngine.ts**

```ts
import { seededRandom } from '@/demo/random';
import type { RiskCheck, RiskResult, Transaction } from '@/demo/types';

export const THRESHOLD = 70;

/**
 * 六个固定检查项。ok / bad 是文案模板，`{n}` 由种子填数字。
 * 顺序即屏幕上的显示顺序。
 */
const CHECKS = [
  {
    id: 'kyc',
    label: '核对席位实名状态',
    ok: () => '已验证 · 证件与地址一致',
    bad: () => '对手方未完成实名认证',
  },
  {
    id: 'history',
    label: '拉取对手方历史成交',
    ok: (n: number) => `${n} 笔完成 · 0 争议`,
    bad: (n: number) => `${n} 笔完成 · ${1 + (n % 4)} 争议`,
  },
  {
    id: 'sanctions',
    label: '链上地址制裁名单筛查',
    ok: () => '无命中（OFAC / UN / EU）',
    bad: () => '命中 OFAC SDN 关联地址',
  },
  {
    id: 'amount',
    label: '金额异常检测',
    ok: (n: number) => `与席位均值相当（${(0.8 + (n % 60) / 100).toFixed(1)}×）`,
    bad: (n: number) => `高于席位均值 ${(2.5 + (n % 45) / 10).toFixed(1)}×`,
  },
  {
    id: 'response',
    label: '对手方响应时效',
    ok: (n: number) => `中位 ${1 + (n % 9)} 分钟`,
    bad: (n: number) => `中位 ${45 + (n % 120)} 分钟，偏慢`,
  },
  {
    id: 'tenure',
    label: '账户存续时长',
    ok: (n: number) => `${180 + (n % 600)} 天`,
    bad: (n: number) => `仅 ${3 + (n % 25)} 天`,
  },
] as const;

/**
 * 一笔交易的风控评估。**不调用任何 AI 服务，不发任何网络请求。**
 *
 * 刻意写得很薄：先由种子定分数，再倒推出几条问题项——不是先算检查再加权。
 * 这个顺序保证屏幕上永远自洽（分数低就一定看得到问题），代码量只有加权模型
 * 的三分之一。这是 Demo，没人会核验这些规则是否合理，把它写"真"只会增加
 * 会出错的代码。
 *
 * 随机成分由 tx.id 做种子，所以同一笔单反复评估结果完全一致——重新渲染不会
 * 让分数跳变，那是最容易穿帮的地方。
 */
export function assessRisk(tx: Transaction): RiskResult {
  const rand = seededRandom(tx.id);

  // 1. 先定分数。补过材料的加分，让「补充后重新提交」这条路径有实际效果。
  const score = Math.min(100, 45 + Math.floor(rand() * 55) + tx.resubmits * 15);

  // 2. 分数决定有几项不合格，以及最差的那项是 warn 还是 fail
  const flawCount = score >= 85 ? 0 : score >= THRESHOLD ? 1 : score >= 50 ? 2 : 3;
  const hasFail = score < 50;

  // 3. 按种子挑出哪几项是问题项
  const order = CHECKS.map((c, i) => ({ i, k: rand() }))
    .sort((a, b) => a.k - b.k)
    .slice(0, flawCount)
    .map((x) => x.i);
  const flawed = new Set(order);

  const checks: RiskCheck[] = CHECKS.map((c, i) => {
    const n = Math.floor(rand() * 200) + 3;
    const isFlawed = flawed.has(i);
    return {
      id: c.id,
      label: c.label,
      // 最差的那一项在 decline 时标 fail，其余问题项标 warn
      status: isFlawed ? (hasFail && i === order[0] ? 'fail' : 'warn') : 'pass',
      detail: isFlawed ? c.bad(n) : c.ok(n),
      weight: 0, // 不再做加权，保留字段是为了类型兼容
    };
  });

  const verdict: RiskResult['verdict'] =
    score >= THRESHOLD ? 'pass' : score >= 50 ? 'challenge' : 'decline';

  return { score, threshold: THRESHOLD, verdict, checks };
}
```

`weight` 字段保留但恒为 0——`types.ts` 里已经定义了它，删掉要改类型和别处引用，留着代价是零。如果实现时觉得碍眼，可以从 `RiskCheck` 里删掉这个字段并同步改 `types.ts`，两种做法都行。

- [ ] **Step 4: 跑测试，确认通过**

```bash
npx vitest run src/demo/engine/__tests__/riskEngine.test.ts
```

预期：7 个测试 PASS。

- [ ] **Step 5: 全量测试并提交**

```bash
npm test
```

预期：25 文件 / 147 通过。

```bash
git add src/demo/engine
git commit -m "feat(demo): 风控评分引擎，六项检查与流式结论"
```

---

## Task 5: 共享 UI 组件

把 Trustline 那套重复出现的零件做出来。这一步没有可见页面变化，但后面四个页面全靠它。

**Files:**
- Create: `src/demo/hooks/useReducedMotion.ts`, `src/demo/components/KpiTile.tsx`, `StatusBadge.tsx`, `FilterBar.tsx`, `DataTable.tsx`, `Drawer.tsx`, `CountUp.tsx`, `ScoreRing.tsx`, `Sparkline.tsx`

**Interfaces:**
- Produces:
  - `useReducedMotion(): boolean`
  - `KpiTile({ label, value, sub? })`
  - `StatusBadge({ status })` — 接受 `TxStatus | CheckStatus | 'open' | 'resolved'`
  - `FilterBar({ summary, loaded, children? })`
  - `DataTable({ columns, rows, empty, onRowClick? })` — `columns: { key, label, width? }[]`，`rows: { id, cells: ReactNode[] }[]`
  - `Drawer({ open, onClose, title, children })`
  - `CountUp({ value, durationMs? })`
  - `ScoreRing({ score, threshold, size? })`
  - `Sparkline({ points, color })`

- [ ] **Step 1: prefers-reduced-motion**

创建 `src/demo/hooks/useReducedMotion.ts`：

```ts
import { useEffect, useState } from 'react';

/** 全站动画都要读它。落地页已有同样的约定，Demo 保持一致。 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  return reduced;
}
```

- [ ] **Step 2: CountUp 与 KpiTile**

`CountUp.tsx`：用 `requestAnimationFrame` 在 `durationMs`（默认 900）内从 0 数到 `value`，缓动用 `1 - (1-t)³`。`useReducedMotion()` 为真时直接显示终值。数字用 `tabular-nums`。

`KpiTile.tsx`：

```tsx
export default function KpiTile({
  label,
  value,
  sub,
}: {
  label: string;
  value: number | string;
  sub?: string;
}) {
  return (
    <div className="bg-surface border-hairline rounded-[var(--radius-panel)] border p-[22px]">
      <div className="text-muted text-[11px] font-semibold tracking-[0.08em]">{label}</div>
      <div className="mt-3 text-[32px] leading-none font-semibold tabular-nums">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
      </div>
      {sub && <div className="text-muted mt-2 text-[12px]">{sub}</div>}
    </div>
  );
}
```

- [ ] **Step 3: StatusBadge**

按状态给色，带薄荷绿/红/橙的柔光。映射表：

| 状态 | 文案 | 色 |
|---|---|---|
| `queued` | 排队中 | `--color-muted` |
| `validating` | 校验中 | `--color-info` |
| `passed` / `pass` | 通过 | `--color-ok` |
| `challenged` / `warn` | 待补充 | `--color-warn` |
| `declined` / `fail` | 已拒绝 | `--color-bad` |
| `open` | 待处理 | `--color-warn` |
| `resolved` | 已处理 | `--color-ok` |

样式：`rounded-[var(--radius-pill)] px-2.5 py-1 text-[12px] font-medium`，背景用对应色 `/12` 透明度，文字用该色，外加 `box-shadow: 0 0 12px <色>22` 做辉光。

- [ ] **Step 4: FilterBar 与 DataTable**

`FilterBar.tsx` 照抄 Trustline 那行：左侧 `summary`（如「未应用筛选」），右侧依次 `Filters`、`{loaded} 已加载`、`按创建时间倒序`、`列`、`重置`。全部是**装饰性按钮**，点了不改数据——Demo 里筛选由页面自己的下拉控制，这一行只负责让页面看起来像真产品。这一点要在组件顶部写注释说明，免得后来者以为它坏了。

`DataTable.tsx`：表头 `bg-surface-raised`、`text-muted`、`text-[11px] tracking-[0.08em]`；行 `border-hairline border-b`，`hover:bg-surface-raised` 过渡；单元格 padding `14px 18px`；`rows` 为空时渲染 `empty` 文案居中；底部固定一行「上一页 / 下一页」（装饰）。

- [ ] **Step 5: Drawer**

右侧滑出抽屉。`fixed inset-y-0 right-0 w-[520px]`，`bg-surface`，左边 `border-hairline border-l`，`shadow-[var(--shadow-panel)]`。背后半透明遮罩，点遮罩或按 Esc 关闭。进出用 `translate-x` 过渡 280ms；`useReducedMotion()` 为真时去掉过渡。

- [ ] **Step 6: ScoreRing 与 Sparkline**

`ScoreRing.tsx`：内联 SVG 环形进度。半径由 `size`（默认 120）算，`stroke-width` 8。底环 `--color-hairline`，进度环按分数取色（≥threshold 用 `--color-ok`，≥50 用 `--color-warn`，否则 `--color-bad`）。用 `stroke-dasharray` + `stroke-dashoffset` 过渡 1.1s 做绘制动画，`transform: rotate(-90deg)` 让起点在正上方。中心显示分数（`CountUp`）与 `/ 100`。

`Sparkline.tsx`：接受 `points: number[]`，归一化后用 `<polyline>` 画折线，外加一条 `<path>` 填充渐变面积。`preserveAspectRatio="none"`，宽度 100%。

- [ ] **Step 7: 验证并提交**

```bash
npm run build && npm test
```

预期：构建通过（注意 `noUnusedLocals`，未用到的 import 会直接报错）；测试仍 25 文件 / 147 通过。

```bash
git add src/demo/components src/demo/hooks
git commit -m "feat(demo): 共享 UI 组件与动效基元"
```

---

## Task 6: 订单池与撮合

**Files:**
- Modify: `src/demo/pages/OrderPoolPage.tsx`
- Create: `src/demo/components/MatchDrawer.tsx`

**Interfaces:**
- Consumes: `useDemo()`、`matchOrder`、`PoolOrder`、`DataTable`、`FilterBar`、`Drawer`、`StatusBadge`
- Produces: 撮合后 dispatch `{ type: 'match', order, tx }`，`tx.status` 为 `'queued'`，然后跳转 `/queue`

- [ ] **Step 1: 订单池页主体**

页头「订单池」+ 副标题「可撮合的挂单」。页头右侧放两个按钮：「导出 CSV」「文档」（装饰）。

其下一行三个 KPI 磁贴：池中挂单（`pool.length`）、可撮合（能通过 `matchOrder` 的数量）、平均挂单时长。

再下面是筛选控件（**这些是真的**，与 `FilterBar` 的装饰按钮区分开）：

- **以哪个席位撮合**：买方席位 / 卖方席位（默认买方）。这个选择器决定传给 `matchOrder` 的是哪个 `Desk`
- 方向：全部 / 买单 / 卖单
- 资产：全部 / USDT / USDC / BTC / ETH

第一个选择器是撮合那条唯一规则的**唯一出场机会**：种子里卖方席位是未开通的，切过去后每笔单的抽屉都会提示「请先开通卖方席位」并给出跳转。没有它，那条规则在默认流程里永远不会触发，「我的席位」页也就失去了意义。

然后 `FilterBar` + `DataTable`。列：

| 列 | 内容 |
|---|---|
| 挂单 | `id` 用 mono 字体，下方灰字显示挂出时长（如「12 分钟前」） |
| 方向 | 买单 / 卖单，卖单用 `--color-ok`，买单用 `--color-info` |
| 资产 | `asset` + 灰字 `chain` |
| 数量 | `amount` 右对齐 `tabular-nums` |
| 对价 | `fiatTotal` + `fiatCurrency`，下方灰字单价 |
| 对手方 | 名称 + 下方 `displayId`；右侧一个评分小徽章 |
| 操作 | 「撮合」按钮 |

点行或点撮合按钮都打开 `MatchDrawer`。

- [ ] **Step 2: 撮合抽屉**

`MatchDrawer.tsx` 接受 `{ order, desk, onClose }`（`desk` 是页面上那个选择器选中的席位）。内容：

1. 挂单摘要（资产、数量、对价、单价）
2. 对手方卡片：名称、`displayId`、评分环（小号 `ScoreRing`）、成交数、争议数、响应中位数、实名状态
3. 一行「初判」：调 `matchOrder(desk)`，`ok` 为真显示薄荷绿「可撮合」，为假显示对应 `reason`（红字）
4. 底部按钮：`ok` 为假时按钮换成「去开通席位」，点了跳 `/desk`；为真时是「确认撮合」

唯一的失败原因就是席位未开通，所以不必做通用的禁用态——直接给出口。死路要有门。

- [ ] **Step 3: 撮合动画与落库**

点「确认撮合」后：

1. 抽屉内容切成撮合动画：两张小卡（我的席位 / 对手方）分别从左右向中间平移并缩放，280ms 后合并成一张交易卡，薄荷绿描边闪一下
2. 动画结束（约 900ms）后 dispatch：

```ts
const tx: Transaction = {
  id: `tx_${Date.now().toString(36)}`,
  poolOrderId: order.id,
  side: desk.kind,
  asset: order.asset,
  amount: order.amount,
  fiatTotal: order.fiatTotal,
  fiatCurrency: order.fiatCurrency,
  counterparty: order.counterparty,
  status: 'queued',
  createdAt: new Date().toISOString(),
  risk: null,
  resubmits: 0,
};
dispatch({ type: 'match', order, tx });
navigate('/queue');
```

`useReducedMotion()` 为真时跳过动画，直接 dispatch 并跳转。

- [ ] **Step 4: 新挂单滑入**

`DemoProvider` 每 8 秒插一笔新单。给表格第一行加 `animate-[slideIn_.45s_ease-out]`，配一层薄荷绿微光在 1.2s 内淡出。在 `src/index.css` 加 keyframes：

```css
@keyframes slideIn {
  from { opacity: 0; transform: translateY(-8px); }
  to { opacity: 1; transform: translateY(0); }
}
```

判断"新"的方式：记住上一次渲染的首行 id，变了就给新首行加一次动画 class。

- [ ] **Step 5: 手动核对**

```bash
npm run dev
```

- 订单池有约 40 行，方向和资产筛选都生效
- 点任意行弹出抽屉，对手方信息完整，评分环有绘制动画
- 池子里**每一笔单都能撮合**（撮合只有「席位得开通」这一条规则，买方席位种子里是开通的）
- 确认撮合 → 看到合并动画 → 跳到队列页，看到一条 `queued` 的交易
- 等 8 秒，池子顶部滑入一笔新单

- [ ] **Step 6: 验证并提交**

```bash
npm run build && npm test
```

```bash
git add src/demo src/index.css
git commit -m "feat(demo): 订单池、撮合抽屉与撮合动画"
```

---

## Task 7: 队列与 AI 流式推理

整个 Demo 最出彩的一屏。

**Files:**
- Modify: `src/demo/pages/QueuePage.tsx`
- Create: `src/demo/hooks/useStreamingChecks.ts`, `src/demo/components/ReasoningPanel.tsx`

**Interfaces:**
- Consumes: `useDemo()`、`assessRisk`、`nextStatus`、`THRESHOLD`、`ScoreRing`、`Drawer`、`StatusBadge`
- Produces: `useStreamingChecks(checks: RiskCheck[], enabled: boolean): { revealed: RiskCheck[]; done: boolean }`

- [ ] **Step 1: 流式 hook**

创建 `src/demo/hooks/useStreamingChecks.ts`：

```ts
import { useEffect, useState } from 'react';
import { useReducedMotion } from './useReducedMotion';
import type { RiskCheck } from '@/demo/types';

/**
 * 把一次性算好的检查项按节奏吐出来，制造「模型正在逐条推理」的观感。
 *
 * 结论早就由 assessRisk 算完了，这里只控制显示节奏——没有任何网络请求，
 * 也没有任何真实推理在发生。
 */
export function useStreamingChecks(checks: RiskCheck[], enabled: boolean) {
  const reduced = useReducedMotion();
  const [count, setCount] = useState(0);

  useEffect(() => {
    if (!enabled) {
      setCount(0);
      return;
    }
    if (reduced) {
      setCount(checks.length);
      return;
    }

    setCount(0);
    let i = 0;
    let timer: ReturnType<typeof setTimeout>;

    const tick = () => {
      i += 1;
      setCount(i);
      if (i < checks.length) {
        timer = setTimeout(tick, 600 + Math.floor(((i * 137) % 30) * 10));
      }
    };

    timer = setTimeout(tick, 450);
    return () => clearTimeout(timer);
  }, [checks, enabled, reduced]);

  return { revealed: checks.slice(0, count), done: count >= checks.length };
}
```

节奏用 `(i * 137) % 30` 而不是随机数，保证同一次评估的节奏可复现，同时每步间隔仍有 600–890ms 的变化——等间隔会显得很假。

- [ ] **Step 2: 推理面板**

`ReasoningPanel.tsx` 接受 `{ tx }`。逻辑：

1. `const risk = tx.risk ?? assessRisk(tx)`
2. `const { revealed, done } = useStreamingChecks(risk.checks, tx.status === 'validating')`
3. 渲染标题「风控推理」+ 一个脉动的小点表示进行中
4. 逐条渲染 `revealed`：左侧图标（`pass` 薄荷绿 ✓ / `warn` 橙 ⚠ / `fail` 红 ✗）、中间 `label`、右侧 `detail`。每条以 `animate-[fadeUp_.35s_ease-out]` 进入
5. 未显示的项渲染成灰色占位行（label 可见、detail 是三个跳动的点），让人看到"还有几步要跑"
6. 全部显示完后，显示分隔线 + `ScoreRing` + 一行结论：`综合评分 {score} / 100 → 阈值 {threshold} → {放行|需补充材料|拒绝}`

`fadeUp` keyframes 加进 `src/index.css`。

- [ ] **Step 3: 自动推进状态**

在 `QueuePage` 里放一个 effect：对每笔 `queued` 的交易，1 秒后 dispatch `setTxStatus` 到 `validating`（走 `nextStatus('queued','start')`）。

对每笔 `validating` 且 `risk === null` 的交易：算 `assessRisk`，dispatch `setTxRisk`，然后在 `checks.length * 750 + 1200` ms 后按 `risk.verdict` dispatch 终态：

- `pass` → `setTxStatus` 到 `nextStatus('validating','pass')`
- `challenge` → `setTxStatus` 到 `challenged`，并 dispatch `openChallenge`，`reason` 取第一条非 pass 检查的 `detail`，`required` 按该项给（见下表）
- `decline` → `setTxStatus` 到 `declined`

`required` 映射：

| 触发项 | 需补充材料 |
|---|---|
| `kyc` | 对手方实名证件、席位授权书 |
| `history` | 近三个月成交流水、争议处理说明 |
| `amount` | 资金来源证明、交易背景说明 |
| `response` | 联系人确认函 |
| `tenure` | 账户开立证明 |

所有定时器在 effect 清理里 `clearTimeout`，避免切页后仍在推进。

- [ ] **Step 4: 队列页主体**

四个 KPI 磁贴照抄 Trustline：Live tasks（非终态总数）、排队中、校验中、待补充。每个磁贴下方有一行灰字说明（如「Waiting to start」对应「等待开始」）。

`FilterBar` + `DataTable`。列：创建时间、交易（id + 资产）、状态（`StatusBadge`）、裁决/风险（分数或 `—`）、置信度（分数条）、金额、对手方。点行打开 `Drawer`，抽屉里是 `ReasoningPanel`。

`validating` 状态的行，在状态徽章下加一条 2px 的进度条，用 CSS 动画从 0 走到 100%，时长与流式节奏一致。

- [ ] **Step 5: 手动核对**

从订单池撮合一笔单，跳到队列后观察完整链路：

- 状态先是「排队中」，约 1 秒后变「校验中」，行下出现进度条
- 点开抽屉，六项检查逐条出现，每条 600–890ms，未出现的是灰色占位
- 最后一条出现后，环形进度画出分数，给出结论
- 结论落地：通过的变绿，需补充的变橙并在挑战页出现，拒绝的变红
- 撮合三四笔不同的单，确认检查项的数值和结论**各不相同**（这是引擎在起作用的证据）
- 关掉抽屉再打开同一笔，分数**不变**（种子随机在起作用）
- 系统设置里打开「减弱动态效果」，重新加载，检查项应直接全部显示

- [ ] **Step 6: 验证并提交**

```bash
npm run build && npm test
```

```bash
git add src/demo src/index.css
git commit -m "feat(demo): 队列页与 AI 流式风控推理面板"
```

---

## Task 8: 风控挡单与我的席位

**Files:**
- Modify: `src/demo/pages/ChallengesPage.tsx`, `src/demo/pages/DeskPage.tsx`

- [ ] **Step 1: 挡单页**

四个 KPI 磁贴：已加载、待处理、重新校验中、24 小时内到期。

`DataTable` 列：创建时间、状态、原因/所需材料、响应、操作。点行打开抽屉，抽屉里：

1. 关联交易摘要
2. `reason` 全文
3. `required` 逐项列出，每项前面一个方框图标（纯展示，不做真实上传）
4. 「补充材料并重新提交」按钮 → dispatch `resolveChallenge`

`resolveChallenge` 会把交易打回 `validating`、`resubmits` 加一、`risk` 清空（Task 2 的 reducer 已经这么写了）。回到队列页会看到它重跑一遍推理，因为 `resubmits` 加了 12 分，这次多半能过——这条闭环是演示里很有说服力的一段，务必跑通。

- [ ] **Step 2: 我的席位页**

两张大卡片并排，买方席位和卖方席位。

已开通的卡片显示：席位名、`displayId`（mono）、开通时间、成交数、争议数、响应中位数，右上角一个「已验证」徽章（薄荷绿辉光）。

未开通的卡片显示：灰底虚线边框、一句「尚未开通{买方|卖方}席位」、一个输入框（席位名称）和「开通席位」按钮 → dispatch `openDesk`。开通后卡片翻转成已开通态，配 300ms 过渡。

页面底部放一段 Trustline Disputes 页那种**四步生命周期解说**，讲清楚这个产品怎么运转：

```
1. 开通席位  →  完成实名，获得席位编号
2. 池中撮合  →  从订单池选一笔对手单，系统自动成交
3. 风控校验  →  六项检查综合评分，低于阈值要求补充材料
4. 结算完成  →  双方确认，交易归档
```

每步一个序号圆点、标题、一行说明。这是整套 UI 里最抓人的段落形式，值得抄。

- [ ] **Step 3: 手动核对**

- 卖方席位初始是未开通的，卡片是虚线灰底态，填名称点「开通席位」后翻转成已开通态
- 撮合若干笔，直到出现一笔 `challenged` 的（分数落在 50–69 区间），去挑战页补材料重提交，回队列页看到它重跑推理且分数提高（`resubmits` 加 15 分）
- 底部四步生命周期解说排版正常，序号圆点对齐

- [ ] **Step 4: 验证并提交**

```bash
npm run build && npm test
```

```bash
git add src/demo
git commit -m "feat(demo): 风控挡单页与我的席位页"
```

---

## Task 9: 概览页与收尾

**Files:**
- Modify: `src/demo/pages/OverviewPage.tsx`, `README.md`

- [ ] **Step 1: 概览页**

八个 KPI 磁贴，两行四列，照抄 Trustline 的排布和文案风格：

| 磁贴 | 取值 |
|---|---|
| 撮合总量 | `transactions.length` |
| 通过率 | `passed / 已裁决` |
| 拒绝率 | `declined / 已裁决` |
| 挡单率 | `challenged / 已裁决` |
| 平均风控耗时 | 由检查项数推算，固定显示 `4.8s` 量级 |
| 平均评分 | 所有 `risk.score` 的均值 |
| 池中挂单 | `pool.length` |
| 席位状态 | 「1 / 2 已开通」这类 |

分母为 0 时显示 `—`，不要显示 `NaN%`。

右侧一个「任务积压」面板，照抄 Trustline 的 All clear 空态：一个薄荷绿对勾圆圈 + 「暂无紧急任务」+ 一行灰字说明。有待处理挑战时改为列出前三条。

下方「趋势」区，2×2 四张卡片，每张一个 `Sparkline`：撮合量、评分分布、挡单趋势、风控耗时。数据点由 `seededRandom('chart_<name>')` 生成 24 个，保证每次演示形状一致。无交易时显示「此时间窗内暂无活动」空态，文案照抄 Trustline 的 `No chart activity in this window.`。

- [ ] **Step 2: 顶部时间范围条**

页头下方加一行：`24h` / `7d` / `30d` / `自定义范围` 四个切换按钮（装饰）+ 右侧「最近 24 小时 · 生成于 {当前时间} · ● 实时 · 每 30 秒刷新」。那个绿点用 `animate-pulse`。这一条几乎不花成本，但它是 Trustline 那种"这是个运行中的系统"观感的主要来源。

- [ ] **Step 3: 更新 README**

在 README 的「落地页」章节之前插入一节：

```markdown
## 应用（演示模式）

`/app` 下是订单池撮合的演示，**纯前端，不连数据库**：

| 路由 | 页面 |
|---|---|
| `/app/login` · `/app/register` | 一键进入，任意输入即可 |
| `/app/overview` | 概览 |
| `/app/pool` | 订单池，从中撮合挂单 |
| `/app/queue` | 队列，AI 风控推理 |
| `/app/challenges` | 风控挡单，补材料重提交 |
| `/app/desk` | 我的买方 / 卖方席位 |

**风控推理不调用任何 AI 服务**，也不发网络请求。结论由 `src/demo/engine/riskEngine.ts`
本地算出，UI 按节奏逐条显示。做成引擎而非写死文案，是为了让不同的单跑出不同的
检查数值和结论。

状态存在 sessionStorage，刷新不丢，关掉标签页即重置。

原先接 Supabase 的真实应用代码保留在 `src/features/`、`src/lib/supabase.ts`、
`src/layouts/`，但不再挂路由。要接回来改 `src/routes.tsx` 即可。
```

- [ ] **Step 4: 全量验证**

```bash
npm run build && npm test
```

预期：构建通过；测试不低于 25 文件 / 147 通过。

```bash
npm run preview
```

逐条走一遍完整链路：落地页 → Sign in → 一键进入 → 概览 → 订单池撮合一笔卖单 → 队列看推理 → 挡单补材料 → 席位页开通卖方席位。

- [ ] **Step 5: 提交**

```bash
git add src/demo README.md
git commit -m "feat(demo): 概览页与文档"
```

---

## 收尾检查

- [ ] `git status --short` 无输出
- [ ] `npm test` 不低于 25 文件 / 147 通过
- [ ] `npm run build` 成功，`dist/index.html`、`dist/desk.html`、`dist/app/index.html` 齐全
- [ ] 落地页 → `/app/login` → 一键进入 → 五个页面全部可达
- [ ] 撮合三笔不同的单，AI 检查项数值和结论各不相同
- [ ] 同一笔单反复打开，分数不变
- [ ] 开启「减弱动态效果」后所有动画降级为终态
- [ ] 全程无任何网络请求（DevTools Network 面板除静态资源外应为空）

最后一条是本计划最重要的验收项：它证明 AI 效果完全是本地的。
