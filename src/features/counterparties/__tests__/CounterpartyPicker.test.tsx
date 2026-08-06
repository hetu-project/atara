import { describe, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CounterpartyPicker from '../CounterpartyPicker';

const mockLookup = vi.fn();
vi.mock('../lookup', () => ({
  lookupCounterparty: (...args: unknown[]) => mockLookup(...args),
}));

// 这是个受控组件：value 由父级持有，onChange 回传后父级把新值传回来。
// 测试必须模拟这条回路 —— 用一个 spy 当 onChange、value 恒为 ""，
// 组件里 `found.id === value` 就永远为 false，"已选择" 永远不显示，
// 于是那条断言会逼着人去把组件里的 value 判断删掉，把受控契约改坏。
function setup(props: Partial<React.ComponentProps<typeof CounterpartyPicker>> = {}) {
  const onChange = vi.fn();

  function Harness() {
    const [value, setValue] = useState('');
    return (
      <CounterpartyPicker
        role="seller"
        label="卖家"
        value={value}
        onChange={(id) => {
          onChange(id);
          setValue(id);
        }}
        {...props}
      />
    );
  }

  render(<Harness />);
  return { onChange };
}

describe('CounterpartyPicker', () => {
  // mockReset 必须放在每个用例体内，不能放 beforeEach。
  // 在 beforeEach 里 reset 一个模块级 vi.fn 之后，该 mock 后续产生的 rejection
  // 会被 vitest 3.2.7 当成用例失败上报 —— 即使被测代码已经正确 catch。
  // （已实测：空 beforeEach 通过；beforeEach 里 mockReset 或 mockClear 都会触发；
  //   同一句 reset 挪进用例体内则正常。）

  it('查到后显示姓名并回传 id', async () => {
    mockLookup.mockReset();
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
    mockLookup.mockReset();
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
    mockLookup.mockReset();
    const { onChange } = setup({
      myProfile: { id: 'my-uuid', display_id: 'U000001', role: 'seller', full_name: '张三' } as never,
    });

    await userEvent.click(screen.getByRole('button', { name: /用我自己的卖家档案/ }));

    expect(onChange).toHaveBeenCalledWith('my-uuid');
    expect(mockLookup).not.toHaveBeenCalled();
  });

  it('输入框为空时查询按钮禁用', () => {
    mockLookup.mockReset();
    setup();
    expect(screen.getByRole('button', { name: '查询' })).toBeDisabled();
  });
});
