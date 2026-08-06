import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import Sidebar from '@/layouts/Sidebar';

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Sidebar />
    </MemoryRouter>,
  );
}

describe('Sidebar', () => {
  it('渲染三个导航入口', () => {
    renderAt('/orders');
    expect(screen.getByRole('link', { name: '买家管理' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '卖家管理' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '订单管理' })).toBeInTheDocument();
  });

  it('当前路由的入口标记为选中', () => {
    renderAt('/buyers');
    expect(screen.getByRole('link', { name: '买家管理' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: '订单管理' })).not.toHaveAttribute('aria-current');
  });

  it('子路由也算选中', () => {
    renderAt('/orders/abc-123');
    expect(screen.getByRole('link', { name: '订单管理' })).toHaveAttribute('aria-current', 'page');
  });
});
