import { useState } from 'react';
import { useNavigate } from 'react-router';
import PageHeader from '@/components/PageHeader';
import QueryState from '@/components/QueryState';
import { Button, Input, Pagination, Table, type Column } from '@/components/ui';
import { formatDateTime, ROLE_LABEL } from '@/lib/format';
import type { Counterparty, Role } from '@/lib/schema';
import { useCounterpartyList } from './hooks';

const PAGE_SIZE = 20;

export default function CounterpartyListPage({ role }: { role: Role }) {
  const navigate = useNavigate();
  const label = ROLE_LABEL[role];
  const basePath = role === 'buyer' ? '/buyers' : '/sellers';

  const [keyword, setKeyword] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, error } = useCounterpartyList({
    role,
    keyword: search,
    page,
    pageSize: PAGE_SIZE,
  });

  const columns: Column<Counterparty>[] = [
    { key: 'display_id', title: '用户 ID', width: '120px', render: (r) => <span className="font-semibold">{r.display_id}</span> },
    { key: 'full_name', title: '姓名', render: (r) => r.full_name },
    { key: 'country', title: '国家', width: '100px', render: (r) => r.country || '-' },
    { key: 'email', title: '邮箱', render: (r) => r.email || '-' },
    { key: 'phone', title: '手机号', render: (r) => r.phone || '-' },
    { key: 'created_at', title: '创建时间', width: '160px', render: (r) => formatDateTime(r.created_at) },
  ];

  function applySearch() {
    setPage(1);
    setSearch(keyword);
  }

  return (
    <>
      <PageHeader
        title={`${label}管理`}
        actions={<Button onClick={() => navigate(`${basePath}/new`)}>新建{label}</Button>}
      />

      <div className="mb-4 flex gap-3">
        <Input
          className="w-[320px]"
          placeholder="搜索姓名 / 用户 ID / 邮箱 / 手机号"
          value={keyword}
          onChange={(e) => setKeyword(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && applySearch()}
        />
        <Button variant="second" onClick={applySearch}>
          搜索
        </Button>
      </div>

      <div className="rounded-card bg-surface p-2">
        {isError ? (
          <QueryState isError error={error} />
        ) : (
          <Table
            columns={columns}
            rows={data?.rows ?? []}
            rowKey={(r) => r.id}
            loading={isLoading}
            onRowClick={(r) => navigate(`${basePath}/${r.id}`)}
            empty={`暂无${label}，点右上角新建`}
          />
        )}
      </div>

      {isError ? null : (
        <Pagination page={page} total={data?.total ?? 0} pageSize={PAGE_SIZE} onChange={setPage} />
      )}
    </>
  );
}
