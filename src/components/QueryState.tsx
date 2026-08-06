/**
 * react-query 的 isLoading / isError 两态统一渲染。
 *
 * 只接收渲染需要的三个原始值，而不是整个 query 对象：这样它不和 react-query 的
 * UseQueryResult 类型耦合，测试时也不必伪造一个完整的 query 对象。
 *
 * 用在"失败会被误读成正常空结果"的场景：列表页只看 data 不看 isError，
 * 请求失败时 data 是 undefined，表格会把它当成"当前没有数据"正常渲染，
 * 而不是把错误亮出来。这个组件负责把 isError 的情况显式画出来。
 */
export default function QueryState({
  isLoading,
  isError,
  error,
  loadingText = '加载中...',
}: {
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  loadingText?: string;
}) {
  if (isLoading) {
    return <div className="text-ink-4 py-20 text-center text-sm">{loadingText}</div>;
  }
  if (isError) {
    const message = error instanceof Error ? error.message : '请稍后重试';
    return <div className="text-danger py-20 text-center text-sm">加载失败：{message}</div>;
  }
  return null;
}
