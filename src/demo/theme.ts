export type ThemeMode = 'light' | 'dark' | 'system';

const KEY = 'atara.demo.theme';

export function readTheme(): ThemeMode {
  const v = localStorage.getItem(KEY);
  return v === 'light' || v === 'dark' ? v : 'system';
}

/**
 * 把主题写到 <html> 的 data-theme 上。
 *
 * system 模式**移除**属性而不是写 'system'——CSS 那边靠
 * `:root:not([data-theme='light'])` + `prefers-color-scheme` 兜住跟随系统，
 * 属性不存在时才会命中。
 */
export function applyTheme(mode: ThemeMode): void {
  const root = document.documentElement;
  if (mode === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
}

export function writeTheme(mode: ThemeMode): void {
  if (mode === 'system') localStorage.removeItem(KEY);
  else localStorage.setItem(KEY, mode);
  applyTheme(mode);
}
