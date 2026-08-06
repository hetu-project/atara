import { describe, expect, it } from 'vitest';
import { cryptoOrderSchema, fiatOrderSchema } from '@/lib/schema';

/**
 * OrderForm 用 `useForm<any>` —— react-hook-form 对判别联合类型处理得很差，
 * `any` 是刻意的妥协，不打算在这里补回精确的泛型。代价是 register('xxx') /
 * err('xxx') 全是不受检查的字符串：改了 schema.ts 里的字段名却忘了同步表单，
 * 或者反过来在表单里手滑打错字段名，tsc -b 一样绿灯，输入框会静默地绑定到
 * 一个不存在的字段上，报错永远不出现。
 *
 * 这里用一份手写的字段名清单代替类型检查：清单本身就是"当前表单实际注册了
 * 哪些字段"的诚实记录，一旦 schema.ts 改名而这份清单/表单没跟着改，
 * 断言就会失败。清单需要跟 OrderForm.tsx / CryptoFields.tsx / FiatFields.tsx
 * 里的 register(...) 调用保持同步。
 */
const COMMON_FIELDS = ['payee', 'buyer_id', 'seller_id', 'amount', 'note'];
const CRYPTO_FIELDS = ['asset', 'chain', 'receiving_address'];
const FIAT_FIELDS = ['fiat_currency', 'bank_name', 'bank_account_name', 'bank_swift', 'bank_account_number'];

describe('OrderForm 注册的字段名与 schema 保持一致', () => {
  it('OrderForm 里注册的通用字段在 crypto / fiat 两个分支的 schema 里都存在', () => {
    for (const name of COMMON_FIELDS) {
      expect(cryptoOrderSchema.shape).toHaveProperty(name);
      expect(fiatOrderSchema.shape).toHaveProperty(name);
    }
  });

  it('CryptoFields 里注册的字段在 cryptoOrderSchema 里存在', () => {
    for (const name of CRYPTO_FIELDS) {
      expect(cryptoOrderSchema.shape).toHaveProperty(name);
    }
  });

  it('FiatFields 里注册的字段在 fiatOrderSchema 里存在', () => {
    for (const name of FIAT_FIELDS) {
      expect(fiatOrderSchema.shape).toHaveProperty(name);
    }
  });
});
