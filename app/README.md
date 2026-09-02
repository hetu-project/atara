# Atara Console

Atara 结算协议的控制台前端。Vite + React + TypeScript。

## 跑起来

需要后端先起着（`atara-pay` 仓库）：

```bash
cd ../../atara-pay && make run      # :8080
```

然后：

```bash
npm install
npm run dev                          # :5173
```

dev server 把 `/api` 代理到 `http://localhost:8080`，浏览器视角同源——
不依赖后端 CORS，也不会因为预检失败而卡在「看起来没请求出去」。
后端在别处就设 `ATARA_API`：

```bash
ATARA_API=http://10.0.0.5:8080 npm run dev
```

## 演示两侧

后端鉴权是 mock：`X-Atara-User` 头直接注入身份，没有会话。所以右上角有身份切换器，
URL 也支持 `?as=<handle>`：

```
http://localhost:5173/?as=demo
http://localhost:5173/?as=CrabWalk%20Trading
```

**开两个窗口各带一个 as**，就能同时盯住一笔交易的两侧。这不是调试后门——
同一张工单，两方看到的阶段是互补的（一方 `pay/you` 时另一方必然 `wait/them`），
不切身份就看不到协议最核心的那一步：**回执要由收款方核验，上传者自己核不了**。

## 结构

```
src/
  api/
    types.ts       后端 JSON 的类型，字段逐一对齐 atara-pay 的 dto.go
    client.ts      fetch 封装：错误信封、身份头、确认令牌
    endpoints.ts   每个端点一个函数，令牌档位的分叉规则封在这里
  hooks/
    useApi.ts      取数与轮询
    useIdentity.ts 身份（mock 鉴权）
    useRoute.ts    哈希路由
  views/
    Market.tsx     池子 + 吃单
    OrderDetail.tsx 承诺 / 回执 / 核验 / 轨道 / 链上事实 / 流水
    Tasks.tsx      待办投影 + 我的工单
    Wallet.tsx     账户与资金
  components/bits.tsx  阶段徽标、轨道、错误框
  styles/
    tokens.css     设计变量，原样取自旧 console.html
    app.css
```

## 三条约定

**金额一律是字符串。** 后端的金额是十进制字符串主单位，前端**绝不**把它转成
`number`——18 位精度下 float 会静默改掉尾数。要算就上 decimal 库。

**阶段不自己推。** `phase` / `actor` 由后端按当前调用者的视角算好，前端直接渲染。
不要在前端重建状态机——两边各写一份必然走歧。

**错误按 code 分支。** `message` 是给人看的英文文案，会变；`code` 是契约。
后端给的 `remedy` 是「可点的替代」，`ErrorBox` 已经把它渲染成按钮。

## 覆盖范围

六个视图，后端端点全部接通：

| 视图 | 内容 |
|---|---|
| **Trade** | 池子、吃单（币/法币两种口径） |
| **Tasks** | 待办投影 + 我的工单 |
| **Discover** | 三个纵向、做市准入两段审核、挂单、审核台（reviewer 角色） |
| **People** | 对手方名录、会话（聊天与订单卡同流） |
| **Money** | 支配权（额度）、收款方地址簿、提现闭环（含 tx 回填） |
| **Account** | 身份、资金、托管合约 |
| **工单详情** | 承诺 / 回执 / 核验 / 轨道 / 链上事实 / 流水 |

**未接**：条件支付（`conditional_transfer`）。后端实现完整但 V1 不启用，
端点是 `/orders/parse`、`POST /orders`、`/orders/{id}/evidence`、`/orders/{id}/confirm`。

## 契约回归

```bash
python3 scripts/contract-check.py
```

经 dev server 代理跑一遍核心链路，验证前端 API 层与后端契约一致。
前后端都起着时运行。

## 与旧版的关系

仓库根目录的 `console.html` 是重写前的单文件版本（10394 行），保留供视觉对照。
`index.html` 是落地页，本轮未动。
