import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router';
import ThemeToggle from '@/demo/components/ThemeToggle';
import { signOutDemo } from '@/demo/auth/demoSession';

// 导航文案面向普通用户，不用行话。URL 保持英文不变——它们不面向用户，
// 改了还要连带动 README 和部署说明。
const NAV = [
  {
    group: '智能交易',
    items: [
      { to: '/pool', label: 'AI 撮合大厅' },
      { to: '/quick', label: '快捷兑换' },
    ],
  },
  {
    group: '账户中心',
    items: [
      { to: '/overview', label: '智能总览' },
      { to: '/trades', label: 'AI 审核记录' },
      { to: '/todo', label: '待我确认' },
      { to: '/desk', label: '我的账户' },
    ],
  },
];

export default function DemoSidebar() {
  const navigate = useNavigate();
  // 环境切换是纯装饰：Demo 只有一套数据，切了不改任何行为。
  // 留着它是因为它是 Trustline 那种「这是个运行中的系统」观感的主要来源之一。
  const [env, setEnv] = useState<'sandbox' | 'production'>('sandbox');

  return (
    <nav className="bg-surface border-hairline flex w-[264px] shrink-0 flex-col border-r">
      <div className="flex items-center gap-2.5 px-6 py-6">
        <span className="bg-brand block h-3.5 w-3.5 rounded-[3px]" />
        <span className="text-[19px] font-semibold tracking-tight">Atara</span>
      </div>

      <div className="bg-bg border-hairline mx-5 flex rounded-[10px] border p-1">
        {(['sandbox', 'production'] as const).map((e) => (
          <button
            key={e}
            onClick={() => setEnv(e)}
            className={`flex-1 rounded-[7px] py-1.5 text-[13px] font-medium capitalize transition-colors ${
              env === e ? 'bg-surface-raised text-txt' : 'text-muted hover:text-txt'
            }`}
          >
            {e}
          </button>
        ))}
      </div>

      <div className="mt-2.5 px-5">
        <ThemeToggle />
      </div>

      <div className="mt-7 flex-1 overflow-y-auto">
        {NAV.map((section) => (
          <div key={section.group} className="mb-6">
            <div className="text-muted px-6 pb-2 text-[11px] font-semibold tracking-[0.08em]">
              {section.group}
            </div>
            {section.items.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `mx-3 block rounded-[10px] px-3 py-2.5 text-[14px] transition-colors ${
                    isActive
                      ? 'bg-brand/10 text-brand font-medium'
                      : 'text-muted hover:bg-surface-raised hover:text-txt'
                  }`
                }
              >
                {item.label}
              </NavLink>
            ))}
          </div>
        ))}
      </div>

      <div className="border-hairline border-t p-4">
        <div className="mb-3 flex items-center gap-2.5 px-2">
          <span className="bg-brand/15 text-brand flex h-8 w-8 items-center justify-center rounded-full text-[13px] font-semibold">
            D
          </span>
          <div className="min-w-0">
            <div className="truncate text-[13px]">demo@atara.example</div>
            <div className="text-brand text-[11px] tracking-[0.06em]">OWNER</div>
          </div>
        </div>
        <button
          onClick={() => {
            signOutDemo();
            navigate('/login', { replace: true });
          }}
          className="text-muted hover:text-txt px-2 text-[13px] transition-colors"
        >
          退出登录
        </button>
      </div>
    </nav>
  );
}
