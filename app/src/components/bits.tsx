import type { ApiError } from '../api/client'
import type { Actor, Order, RailStop } from '../api/types'

/** 错误按 code 展示，并把后端给的 remedy 变成一个可点的按钮。 */
export function ErrorBox({ error, onRemedy }: {
  error: ApiError | null
  onRemedy?: (value: string) => void
}) {
  if (!error) return null
  return (
    <div className="err" role="alert">
      <code>{error.code}</code>
      <p>{error.message}</p>
      {error.remedy && onRemedy && error.remedy.value && (
        <button className="btn ghost sm" style={{ marginTop: 8 }}
          onClick={() => onRemedy(error.remedy!.value!)}>
          {error.remedy.label}
        </button>
      )}
    </div>
  )
}

const ACTOR_CLASS: Record<Actor, string> = { you: 'you', them: 'them', auto: 'auto' }

/** 阶段徽标。phase 为 null 时显示终态。 */
export function PhaseChip({ order }: { order: Order }) {
  if (order.terminal) {
    const cls = order.terminal === 'completed' ? 'done'
      : order.terminal === 'disputed' ? 'neg' : 'warn'
    return <span className={`chip ${cls}`}>{order.terminal}</span>
  }
  if (!order.phase || !order.actor) return <span className="chip them">{order.state}</span>
  return (
    <span className={`chip ${ACTOR_CLASS[order.actor]}`}>
      {order.phase} · {order.actor}
    </span>
  )
}

/** 后端的 waiting_on 是英文文案，直接拼进中文界面会读成「等 you」。 */
function waitingLabel(who: string): string {
  const map: Record<string, string> = {
    'you': '等你',
    'you to confirm': '等你确认',
    'the counterparty': '等对方',
    'the chain': '等链上确认',
    'the platform': '等核验',
    'the protocol': '等协议',
  }
  return map[who] ?? `等 ${who}`
}

/** 进度轨道。stop.state 由后端给，前端不自己算。 */
export function Rail({ stops }: { stops: RailStop[] }) {
  return (
    <div className="rail">
      {stops.map(s => (
        <div key={s.key} className={`stop ${s.state}`}>
          <div className="dot" />
          <div className="lb">
            {s.label}
            {s.state === 'now' && s.waiting_on && (
              <><br /><span className="muted">{waitingLabel(s.waiting_on)}</span></>
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

export function Countdown({ order }: { order: Order }) {
  if (order.terminal || order.seconds_left <= 0) return null
  return <span className="muted num">{order.seconds_left}s</span>
}
