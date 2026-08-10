import { useState } from 'react';
import { readTheme, writeTheme, type ThemeMode } from '@/demo/theme';

const MODES: { v: ThemeMode; label: string; icon: JSX.Element }[] = [
  {
    v: 'light',
    label: '浅色',
    icon: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
      </>
    ),
  },
  {
    v: 'dark',
    label: '深色',
    icon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" />,
  },
  {
    v: 'system',
    label: '跟随系统',
    icon: (
      <>
        <rect x="2.5" y="4" width="19" height="13" rx="2" />
        <path d="M8.5 21h7" />
      </>
    ),
  },
];

export default function ThemeToggle() {
  const [mode, setMode] = useState<ThemeMode>(() => readTheme());

  return (
    <div
      role="group"
      aria-label="主题"
      className="bg-bg border-hairline flex rounded-[10px] border p-1"
    >
      {MODES.map((m) => (
        <button
          key={m.v}
          onClick={() => {
            writeTheme(m.v);
            setMode(m.v);
          }}
          title={m.label}
          aria-label={m.label}
          aria-pressed={mode === m.v}
          className={`flex flex-1 items-center justify-center rounded-[7px] py-1.5 transition-colors ${
            mode === m.v ? 'bg-surface-raised text-txt' : 'text-muted hover:text-txt'
          }`}
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            {m.icon}
          </svg>
        </button>
      ))}
    </div>
  );
}
