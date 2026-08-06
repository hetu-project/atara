import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CounterpartyPicker from '../CounterpartyPicker';

const mockLookup = vi.fn();
vi.mock('../lookup', () => ({
  lookupCounterparty: (...args: unknown[]) => mockLookup(...args),
}));

function setup(props: Partial<React.ComponentProps<typeof CounterpartyPicker>> = {}) {
  const onChange = vi.fn();
  render(
    <CounterpartyPicker role="seller" label="卖家" value="" onChange={onChange} {...props} />,
  );
  return { onChange };
}

describe('CounterpartyPicker', () => {
  beforeEach(() => mockLookup.mockReset());

  it('查到后显示姓名并回传 id', async () => {
    mockLookup.mockResolvedValue({
      id: 'uuid-1',
      display_id: 'U000002',
      role: 'seller',
      full_name: '李四',
    });
    const { onChange } = setup();

    await userEvent.type(screen.getByPlaceholderText('输入对方的用户 ID'), 'U000002');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() => expect(screen.getByText(/李四/)).toBeInTheDocument());
    expect(onChange).toHaveBeenCalledWith('uuid-1');
  });

  it('查不到时报错且不回传 id', async () => {
    mockLookup.mockRejectedValue(new Error('未找到该用户 ID 对应的卖家'));
    const { onChange } = setup();

    await userEvent.type(screen.getByPlaceholderText('输入对方的用户 ID'), 'U999999');
    await userEvent.click(screen.getByRole('button', { name: '查询' }));

    await waitFor(() =>
      expect(screen.getByText('未找到该用户 ID 对应的卖家')).toBeInTheDocument(),
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('有自己的同角色档案时提供一键填入', async () => {
    const { onChange } = setup({
      myProfile: { id: 'my-uuid', display_id: 'U000001', role: 'seller', full_name: '张三' } as never,
    });

    await userEvent.click(screen.getByRole('button', { name: /用我自己的卖家档案/ }));

    expect(onChange).toHaveBeenCalledWith('my-uuid');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('输入框为空时查询按钮禁用', () => {
    setup();
    expect(screen.getByRole('button', { name: '查询' })).toBeDisabled();
  });
});
