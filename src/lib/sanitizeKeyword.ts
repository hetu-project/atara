/**
 * 清洗搜索关键词。
 *
 * 剥掉 ( ) , " \ 这几个字符：它们是 PostgREST `or=(...)` 过滤语法的
 * 结构字符，原样传入会让后端返回语法错误，而那个错误消息会带上
 * 内部的列名与查询结构泄漏给用户。
 */
export function sanitizeKeyword(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/[(),"\\]/g, '').trim();
}
