import { NavLink } from 'react-router';
import { cn } from '@/components/ui/cn';

const NAV = [
  { to: '/orders', label: '订单管理' },
  { to: '/profile', label: '我的档案' },
];

export default function Sidebar() {
  return (
    <nav className="bg-surface w-[249px] shrink-0 py-3.5">
      <div className="px-[22px] py-4 text-base font-semibold">Atara</div>
      <hr className="border-line mx-[22px] my-5" />
      {NAV.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) =>
            cn(
              'transition-base block px-[22px] py-3 text-xs font-semibold select-none',
              isActive ? 'bg-surface-hover text-black' : 'text-ink-3 hover:bg-surface-hover',
            )
          }
        >
          {item.label}
        </NavLink>
      ))}
    </nav>
  );
}
