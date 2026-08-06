const PG_CODE_MESSAGES: Record<string, string> = {
  '23505': '数据重复，请重试',
  '23514': '填写的内容不符合规则，请检查后重试',
};

const MESSAGE_MAP: Array<[RegExp, string]> = [
  [/Invalid login credentials/i, '邮箱或密码不正确'],
  [/Email not confirmed/i, '账号尚未激活，请联系管理员'],
  [/Failed to fetch|NetworkError/i, '网络异常，请检查网络后重试'],
  [/JWT expired|token is expired/i, '登录已过期，请重新登录'],
];

export function toFriendlyError(error: unknown): Error {
  if (!error || typeof error !== 'object') return new Error('操作失败，请稍后重试');

  const e = error as { code?: string; message?: string };

  if (e.code && PG_CODE_MESSAGES[e.code]) return new Error(PG_CODE_MESSAGES[e.code]);

  if (e.message) {
    for (const [pattern, text] of MESSAGE_MAP) {
      if (pattern.test(e.message)) return new Error(text);
    }
    return new Error(e.message);
  }

  return new Error('操作失败，请稍后重试');
}
