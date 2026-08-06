import PageHeader from '@/components/PageHeader';
import { useMyProfiles } from './hooks';
import { pickProfile } from './myProfiles';
import ProfileCard from './ProfileCard';

export default function MyProfilePage() {
  const { data, isPending, isError, error } = useMyProfiles();

  if (isPending) return <div className="text-ink-4 text-sm">加载中...</div>;
  if (isError) return <div className="text-danger text-sm">加载失败：{(error as Error).message}</div>;

  return (
    <>
      <PageHeader title="我的档案" />
      <p className="text-ink-3 mb-5 max-w-[760px] text-sm">
        买家和卖家档案各自独立。你可以只创建一个，也可以两个都建 ——
        既作为买家下单，也作为卖家收单。把用户 ID 告诉交易对手，他们就能在创建订单时找到你。
      </p>
      <div className="flex max-w-[900px] flex-col gap-5">
        <ProfileCard profile={pickProfile(data, 'buyer')} role="buyer" />
        <ProfileCard profile={pickProfile(data, 'seller')} role="seller" />
      </div>
    </>
  );
}
