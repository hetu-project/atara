import type { IdType, OrderStatus, OrderType, Payee, Role } from '@/lib/schema';

const DASH = '-';

export function formatAmount(value: string | number | null | undefined, dp = 2): string {
  if (value === null || value === undefined || value === '') return DASH;
  const n = typeof value === 'string' ? Number(value) : value;
  if (Number.isNaN(n)) return DASH;
  return n.toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return DASH;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return DASH;
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function shortenAddress(addr: string | null | undefined, head = 6, tail = 4): string {
  if (!addr) return DASH;
  if (addr.length <= head + tail + 3) return addr;
  return `${addr.slice(0, head)}...${addr.slice(-tail)}`;
}

export const ROLE_LABEL: Record<Role, string> = {
  buyer: '买家',
  seller: '卖家',
};

export const ID_TYPE_LABEL: Record<IdType, string> = {
  passport: '护照',
  id_card: '身份证',
  driver_license: '驾照',
};

export const ORDER_TYPE_LABEL: Record<OrderType, string> = {
  crypto: 'Crypto',
  fiat: '法币',
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: '待付款',
  paid: '已付款',
  completed: '已完成',
  cancelled: '已取消',
};

export const PAYEE_LABEL: Record<Payee, string> = {
  buyer: '买家',
  seller: '卖家',
};
