import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import QueryState from '@/components/QueryState';

describe('QueryState', () => {
  it('加载中时显示加载文案', () => {
    render(<QueryState isLoading />);
    expect(screen.getByText('加载中...')).toBeInTheDocument();
  });

  it('出错时显示错误信息', () => {
    render(<QueryState isError error={new Error('网络异常')} />);
    expect(screen.getByText('加载失败：网络异常')).toBeInTheDocument();
  });

  it('出错但 error 不是 Error 实例时给兜底文案', () => {
    render(<QueryState isError error="boom" />);
    expect(screen.getByText('加载失败：请稍后重试')).toBeInTheDocument();
  });

  it('既不加载也不出错时不渲染任何内容', () => {
    const { container } = render(<QueryState />);
    expect(container).toBeEmptyDOMElement();
  });
});
