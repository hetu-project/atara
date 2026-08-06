import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import Pagination from '@/components/ui/Pagination';

describe('Pagination', () => {
  it('展示总数与当前页', () => {
    render(<Pagination page={2} total={45} pageSize={20} onChange={vi.fn()} />);
    expect(screen.getByText('共 45 条')).toBeInTheDocument();
    expect(screen.getByText('2 / 3')).toBeInTheDocument();
  });

  it('第一页时上一页禁用', () => {
    render(<Pagination page={1} total={45} pageSize={20} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '上一页' })).toBeDisabled();
  });

  it('最后一页时下一页禁用', () => {
    render(<Pagination page={3} total={45} pageSize={20} onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: '下一页' })).toBeDisabled();
  });

  it('点下一页回调页码 +1', async () => {
    const onChange = vi.fn();
    render(<Pagination page={1} total={45} pageSize={20} onChange={onChange} />);
    await userEvent.click(screen.getByRole('button', { name: '下一页' }));
    expect(onChange).toHaveBeenCalledWith(2);
  });

  it('总数为 0 时不渲染', () => {
    const { container } = render(<Pagination page={1} total={0} pageSize={20} onChange={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
