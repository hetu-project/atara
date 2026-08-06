import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

// 钉死测试运行时的时区，且必须在下面调用 defineConfig(...) 之前赋值——Node 只在
// 第一次构造 Date 时才读取 TZ，之后再改这个环境变量就晚了。
//
// 必须钉一个非 UTC 的时区，理由是：Task 9 的订单日期筛选（buildOrderQuery 里的
// localDayStart/localDayEnd）和 src/lib/format.ts 的 formatDate/formatDateTime 都在
// 把"本地日历日"和 UTC 时刻互相转换。如果测试跑在 TZ=UTC 下，本地解析和 UTC 解析
// 是同一个结果，之前那个"筛选边界拼错成 UTC 零点"的 bug 重新出现也不会被任何测试
// 抓到——CI 默认就是 UTC，会一直绿下去。钉成 Asia/Shanghai（UTC+8）能让这类偏移在
// 任何机器上都稳定可复现。
process.env.TZ = 'Asia/Shanghai';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, 'src') },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
});
