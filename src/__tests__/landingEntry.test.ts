import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// 落地页是手写 HTML，没有类型系统兜底：删了按钮、改错 href，构建照样通过。
// 这几条断言是唯一能拦住「改版把进应用的入口弄丢」的东西。
const page = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');

describe('落地页到应用的入口', () => {
  it('每个 Start 按钮都进应用，不是页内锚点', () => {
    const starts = page.match(/<a[^>]*>\s*Start[\s<]/g) ?? [];
    expect(starts.length).toBeGreaterThan(0);
    for (const a of starts) {
      expect(a).toContain('/app/quick');
    }
  });

  it('Talk to us 仍然落在联系区', () => {
    expect(page).toContain('href="#contact">Talk to us');
    expect(page).toContain('id="contact"');
  });
});
