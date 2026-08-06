import { Link } from 'react-router';
import { Badge, Button } from '@/components/ui';
import { formatDateTime, ROLE_LABEL } from '@/lib/format';
import type { Counterparty, Role } from '@/lib/schema';

export default function ProfileCard({ profile, role }: { profile: Counterparty | undefined; role: Role }) {
  const label = ROLE_LABEL[role];
  const createPath = role === 'buyer' ? '/profile/buyer/new' : '/profile/seller/new';
  const editPath = role === 'buyer' ? '/profile/buyer' : '/profile/seller';

  if (!profile) {
    return (
      <div className="rounded-card bg-surface flex flex-col items-start gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold">{label}档案</h2>
          <p className="text-ink-3 mt-1 text-sm">尚未创建。创建后会得到一个用户 ID，用于让交易对手找到你。</p>
        </div>
        <Link to={createPath}>
          <Button>创建{label}档案</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-card bg-surface p-6">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-lg font-semibold">{label}档案</h2>
        <Badge tone="success">已创建</Badge>
      </div>

      <div className="mb-5 flex flex-wrap gap-x-10 gap-y-2 text-sm">
        <span>
          用户 ID <b className="ml-2 tracking-wide">{profile.display_id}</b>
        </span>
        <span>
          姓名 <b className="ml-2">{profile.full_name}</b>
        </span>
        <span className="text-ink-3">创建于 {formatDateTime(profile.created_at)}</span>
      </div>

      <Link to={editPath}>
        <Button variant="second">查看 / 编辑</Button>
      </Link>
    </div>
  );
}
