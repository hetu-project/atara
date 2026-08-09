// Demo 用的假会话。不连任何后端，只在 sessionStorage 里放一个标记。
//
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
