import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 落地页是手写 HTML，没有类型系统兜底：把导航按钮删了、把 href 改错了，
// 构建照样通过。这两条断言是唯一能拦住「改版把进应用的入口弄丢」的东西。
const PAGES = ['index.html', 'desk.html'];

function readPage(page: string) {
  return readFileSync(resolve(process.cwd(), page), 'utf8');
}

describe('落地页到应用的入口', () => {
  it.each(PAGES)('%s 有指向 /app/login 的链接', (page) => {
    expect(readPage(page)).toContain('href="/app/login"');
  });

  it.each(PAGES)('%s 有指向 /app/register 的链接', (page) => {
    expect(readPage(page)).toContain('href="/app/register"');
  });
});
