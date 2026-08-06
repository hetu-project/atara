const PG_CODE_MESSAGES: Record<string, string> = {
  '23505': '数据重复，请重试',
  '23514': '填写的内容不符合规则，请检查后重试',
  '42501': '无权访问该数据',
};

/**
 * 按约束名给出具体文案。
 *
 * 必须在 PG_CODE_MESSAGES 之前判定：23505 已被占用为通用的"数据重复"，
 * 而 unique (user_id, role) 冲突需要一句用户能看懂的话。
 */
const CONSTRAINT_MESSAGES: Array<[string, string]> = [
  ['counterparties_user_id_role_key', '你已创建过该角色的档案'],
];

const MESSAGE_MAP: Array<[RegExp, string]> = [
  [/Invalid login credentials/i, '邮箱或密码不正确'],
  [/Email not confirmed/i, '邮箱尚未验证，请查收验证邮件'],
  [/User already registered/i, '该邮箱已注册，请直接登录'],
  [/Password should be at least/i, '密码至少 6 位'],
  [/Failed to fetch|NetworkError/i, '网络异常，请检查网络后重试'],
  [/JWT expired|token is expired/i, '登录已过期，请重新登录'],
];

export function toFriendlyError(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error('操作失败，请稍后重试');

  const e = error as { code?: string; message?: string };

  if (e.message) {
    for (const [constraint, text] of CONSTRAINT_MESSAGES) {
      if (e.message.includes(constraint)) return new Error(text);
    }
  }

  if (e.code && PG_CODE_MESSAGES[e.code]) return new Error(PG_CODE_MESSAGES[e.code]);

  if (e.message) {
    for (const [pattern, text] of MESSAGE_MAP) {
      if (pattern.test(e.message)) return new Error(text);
    }
    // 兜底原样透出。状态机 trigger 抛出的中文消息（P0001）走这条路径 ——
    // 那些消息是刻意写成中文、不含表名列名的，就是为了直接展示给用户。
    return new Error(e.message);
  }

  return new Error('操作失败，请稍后重试');
}
