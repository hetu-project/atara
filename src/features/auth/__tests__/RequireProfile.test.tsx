import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import RequireProfile from '../RequireProfile';

const mockUseMyProfiles = vi.fn();
vi.mock('@/features/counterparties/hooks', () => ({
  useMyProfiles: () => mockUseMyProfiles(),
}));

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<RequireProfile />}>
          <Route path="/orders" element={<div>订单页</div>} />
          <Route path="/onboarding" element={<div>引导页</div>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

describe('RequireProfile', () => {
  beforeEach(() => mockUseMyProfiles.mockReset());

  it('无任何档案时重定向到引导页', () => {
    mockUseMyProfiles.mockReturnValue({ data: [], isPending: false });
    renderAt('/orders');
    expect(screen.getByText('引导页')).toBeInTheDocument();
  });

  it('有档案时放行', () => {
    mockUseMyProfiles.mockReturnValue({ data: [{ role: 'buyer' }], isPending: false });
    renderAt('/orders');
    expect(screen.getByText('订单页')).toBeInTheDocument();
  });

  it('已经在引导页时不再重定向（否则无限循环）', () => {
    mockUseMyProfiles.mockReturnValue({ data: [], isPending: false });
    renderAt('/onboarding');
    expect(screen.getByText('引导页')).toBeInTheDocument();
  });

  it('已有档案却停留在引导页时重定向到 /profile', () => {
    mockUseMyProfiles.mockReturnValue({ data: [{ role: 'buyer' }], isPending: false });
    render(
      <MemoryRouter initialEntries={['/onboarding']}>
        <Routes>
          <Route element={<RequireProfile />}>
            <Route path="/onboarding" element={<div>引导页</div>} />
            <Route path="/profile" element={<div>我的档案</div>} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    expect(screen.getByText('我的档案')).toBeInTheDocument();
  });

  it('加载中显示占位，不重定向', () => {
    mockUseMyProfiles.mockReturnValue({ data: undefined, isPending: true });
    renderAt('/orders');
    expect(screen.getByText('加载中...')).toBeInTheDocument();
    expect(screen.queryByText('引导页')).not.toBeInTheDocument();
  });
});
