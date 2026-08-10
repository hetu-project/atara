export interface AssetSpec {
  asset: string;
  chain: string;
  /** 参考价，以 1 单位法币计 */
  px: number;
}

/**
 * 资产与参考价。种子数据和快捷交易共用这一份——两处各写一套价格的话，
 * 大厅里 BTC 报 94,200 而快捷交易报别的数，一眼就露馅。
 */
export const ASSETS: AssetSpec[] = [
  { asset: 'USDT', chain: 'TRON', px: 1 },
  { asset: 'USDT', chain: 'ETH', px: 1 },
  { asset: 'USDC', chain: 'POLYGON', px: 1 },
  { asset: 'BTC', chain: 'BTC', px: 94_200 },
  { asset: 'ETH', chain: 'ETH', px: 3_180 },
];

export const FIATS = ['USD', 'EUR', 'HKD', 'CNY'];

/** 快捷交易里可选的资产，去掉重复的链 */
export const TRADABLE = ['USDT', 'USDC', 'BTC', 'ETH'];

export function priceOf(asset: string): number {
  return ASSETS.find((a) => a.asset === asset)?.px ?? 1;
}

export function chainOf(asset: string): string {
  return ASSETS.find((a) => a.asset === asset)?.chain ?? 'ETH';
}

/** 小数位：BTC 到 5 位，ETH 到 4 位，稳定币到 2 位 */
export function decimalsOf(asset: string): number {
  if (asset === 'BTC') return 5;
  if (asset === 'ETH') return 4;
  return 2;
}
