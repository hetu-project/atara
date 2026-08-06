import { useSession, signOut } from '@/features/auth/useSession';

export default function Header() {
  const { session } = useSession();

  return (
    <header className="border-line sticky top-0 z-40 flex h-[60px] shrink-0 items-center justify-end gap-4 border-b bg-white px-[46px]">
      <span className="text-ink-3 text-sm">{session?.user.email}</span>
      <button
        onClick={() => signOut()}
        className="text-ink-3 transition-base text-sm font-medium hover:text-black"
      >
        退出登录
      </button>
    </header>
  );
}
