export function fmtAmount(n: number): string {
  return n.toLocaleString('en-US', { maximumFractionDigits: 4 });
}

export function fmtFiat(n: number, ccy: string): string {
  return `${n.toLocaleString('en-US', { maximumFractionDigits: 2 })} ${ccy}`;
}

/** 「12 分钟前」。Demo 里只需要到天，不做更细的分级。 */
export function timeAgo(iso: string, now = Date.now()): string {
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s} 秒前`;
  if (s < 3600) return `${Math.floor(s / 60)} 分钟前`;
  if (s < 86400) return `${Math.floor(s / 3600)} 小时前`;
  return `${Math.floor(s / 86400)} 天前`;
}

export function fmtTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}
