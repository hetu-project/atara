import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 落地页是手写 HTML，没有类型系统兜底：这两条断言确保主要 CTA 始终能落到
// 页面里的联系区，而不是变成失效的页内链接。
const page = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('落地页主要 CTA', () => {
  it('Start 链接指向联系区', () => {
    expect(page).toContain('class="nav-start" href="#contact"');
    expect(page).toContain('class="btn btn-primary" href="#contact"');
  });

  it('包含联系区锚点', () => {
    expect(page).toContain('id="contact"');
  });
});
