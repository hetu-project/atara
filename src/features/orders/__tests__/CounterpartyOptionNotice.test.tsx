import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import CounterpartyOptionNotice from '@/features/orders/CounterpartyOptionNotice';

function renderNotice(list: { isError: boolean; error: unknown; data: unknown }) {
  return render(
    <MemoryRouter>
      <CounterpartyOptionNotice list={list as never} label="买家" createPath="/buyers/new" />
    </MemoryRouter>,
  );
}

describe('CounterpartyOptionNotice', () => {
  it('加载失败时提示错误', () => {
    renderNotice({ isError: true, error: new Error('网络异常'), data: undefined });
    expect(screen.getByText('买家列表加载失败：网络异常')).toBeInTheDocument();
  });

  it('列表为空时提示新建并给出链接', () => {
    renderNotice({ isError: false, error: null, data: [] });
    expect(screen.getByRole('link', { name: '新建买家' })).toHaveAttribute('href', '/buyers/new');
  });

  it('恰好 500 条时提示可能被截断', () => {
    const rows = Array.from({ length: 500 }, (_, i) => ({ id: String(i) }));
    renderNotice({ isError: false, error: null, data: rows });
    expect(screen.getByText(/已达 500 条上限/)).toBeInTheDocument();
  });

  it('正常且未超限时不渲染任何内容', () => {
    const { container } = renderNotice({ isError: false, error: null, data: [{ id: '1' }] });
    expect(container).toBeEmptyDOMElement();
  });
});
