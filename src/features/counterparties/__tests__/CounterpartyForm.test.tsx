import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import CounterpartyForm from '@/features/counterparties/CounterpartyForm';

describe('CounterpartyForm', () => {
  it('姓名为空时提交显示错误且不回调', async () => {
    const onSubmit = vi.fn();
    render(<CounterpartyForm role="buyer" submitting={false} onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('请填写姓名')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('填了姓名即可提交，role 带上', async () => {
    const onSubmit = vi.fn();
    render(<CounterpartyForm role="seller" submitting={false} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^姓名/), '李四');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ role: 'seller', full_name: '李四' });
  });

  it('邮箱格式错误时阻止提交', async () => {
    const onSubmit = vi.fn();
    render(<CounterpartyForm role="buyer" submitting={false} onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^姓名/), '王五');
    await userEvent.type(screen.getByLabelText(/^邮箱/), 'bad-email');
    await userEvent.click(screen.getByRole('button', { name: '保存' }));

    expect(await screen.findByText('邮箱格式不正确')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('回填默认值', () => {
    render(
      <CounterpartyForm
        role="buyer"
        submitting={false}
        onSubmit={vi.fn()}
        defaultValues={{ role: 'buyer', full_name: '赵六', email: 'a@b.com', tags: [] }}
      />,
    );
    expect(screen.getByLabelText(/^姓名/)).toHaveValue('赵六');
    expect(screen.getByLabelText(/^邮箱/)).toHaveValue('a@b.com');
  });

  it('submitting 时按钮禁用', () => {
    render(<CounterpartyForm role="buyer" submitting onSubmit={vi.fn()} />);
    expect(screen.getByRole('button', { name: '处理中...' })).toBeDisabled();
  });
});
