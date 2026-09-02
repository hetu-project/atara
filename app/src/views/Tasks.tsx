import * as ep from '../api/endpoints'
import { useApi } from '../hooks/useApi'
import { ErrorBox, PhaseChip } from '../components/bits'
import type { Order } from '../api/types'

/**
 * 待办 + 我的工单。
 *
 * /tasks 是工单的派生投影（后端不建表），该你动手的排最前。
 * 这里同时列出工单本体，因为要点进去操作。
 */
export default function Tasks({ identity, onOpen }: {
  identity: string
  onOpen: (id: string) => void
}) {
  const { data: tasks } = useApi(() => ep.tasks(), [identity], 2000)
  const { data: orders, error } = useApi(() => ep.orders(), [identity], 2000)

  const youCount = tasks?.filter(t => t.state === 'you').length ?? 0

  return (
    <>
      <h1>Tasks</h1>
      <p className="lede">
        待办由后端按你的视角算出——同一张工单，两方看到的阶段是互补的。
        {youCount > 0 && ` 当前有 ${youCount} 件轮到你。`}
      </p>
      <ErrorBox error={error} />

      {tasks && tasks.length > 0 && (
        <div className="panel" style={{ marginBottom: 16 }}>
          <h2>轮到谁</h2>
          <div className="orders">
            {tasks.map(t => (
              <div className="ordrow" key={t.id} role="presentation">
                <span className={`chip ${t.state}`}>{t.state}</span>
                <span className="ref">{t.order_ref}</span>
                <span className="ti">{t.title}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <h2>我的工单</h2>
      {orders?.length === 0 && <p className="muted">还没有工单。去 Trade 吃一单。</p>}
      <div className="orders">
        {orders?.map((o: Order) => (
          <button className="ordrow" key={o.id} onClick={() => onOpen(o.id)}>
            <span className="ref">{o.ref}</span>
            <span className="ti">
              {o.otc?.side === 'buy' ? '买入' : '卖出'} {o.amount.amount} {o.amount.asset}
              {o.counterparty_name && <span className="muted"> · {o.counterparty_name}</span>}
            </span>
            <PhaseChip order={o} />
          </button>
        ))}
      </div>
    </>
  )
}
