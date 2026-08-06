import { Link } from 'react-router';
import type { CounterpartyOption } from '@/features/counterparties/api';

const OPTION_LIMIT = 500;

interface OptionsQuery {
  isError: boolean;
  error: unknown;
  data: CounterpartyOption[] | undefined;
}

/**
 * 买家/卖家下拉框的三种异常提示，按优先级互斥展示一条：
 * 1. 加载失败 —— 否则两个下拉框只显示占位符，用户不知道发生了什么，且永远无法提交。
 * 2. 列表为空 —— 刚迁移完的项目大概率是这个状态，下拉框空空如也，
 *    提交时报"请选择买家"却不说明原因，这里直接给出新建入口。
 * 3. 触达 500 条上限 —— listCounterpartyOptions 有 limit(500)，超过的部分被静默
 *    截断，操作者要找的那条如果恰好在 500 条之外，界面上完全没有提示。
 */
export default function CounterpartyOptionNotice({
  list,
  label,
  createPath,
}: {
  list: OptionsQuery;
  label: string;
  createPath: string;
}) {
  if (list.isError) {
    const message = list.error instanceof Error ? list.error.message : '请稍后重试';
    return (
      <p className="text-danger text-xs">
        {label}列表加载失败：{message}
      </p>
    );
  }

  if (list.data && list.data.length === 0) {
    return (
      <p className="text-ink-4 text-xs">
        当前没有{label}档案，请先
        <Link to={createPath} className="text-primary underline">
          新建{label}
        </Link>
        再创建订单。
      </p>
    );
  }

  if (list.data && list.data.length === OPTION_LIMIT) {
    return (
      <p className="text-ink-4 text-xs">
        {label}数量已达 {OPTION_LIMIT} 条上限，下拉框可能未展示全部，请用姓名或用户 ID 仔细核对。
      </p>
    );
  }

  return null;
}
