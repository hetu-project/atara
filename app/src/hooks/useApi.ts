import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../api/client'

/** 重试也好不了的错。继续轮询只会刷屏，不会变好。 */
const FATAL = new Set(['UNKNOWN_ACTOR', 'NOT_FOUND', 'NOT_YOURS'])

export interface AsyncState<T> {
  data: T | null
  error: ApiError | null
  loading: boolean
  reload: () => void
}

/**
 * 取一次数据。deps 变了重新取。
 * pollMs 给定时会持续轮询——工单状态由后端调度器推进，不轮询看不到变化。
 */
export function useApi<T>(
  fn: () => Promise<T>,
  deps: unknown[],
  pollMs?: number,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<ApiError | null>(null)
  const [loading, setLoading] = useState(true)
  const [tick, setTick] = useState(0)
  // fn 每次渲染都是新的闭包，放进 deps 会无限循环——用 ref 存最新的那个。
  const fnRef = useRef(fn)
  fnRef.current = fn

  useEffect(() => {
    let alive = true
    setLoading(true)
    fnRef.current()
      .then(d => { if (alive) { setData(d); setError(null) } })
      .catch((e: unknown) => {
        if (!alive) return
        setError(e instanceof ApiError ? e : new ApiError(0, {
          code: 'NETWORK', message: e instanceof Error ? e.message : '请求失败',
        }))
      })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick])

  useEffect(() => {
    // 拿到治不好的错就停轮询：再问一百次答案也一样，只会刷满一屏 401
    if (!pollMs || (error && FATAL.has(error.code))) return
    const t = setInterval(() => setTick(n => n + 1), pollMs)
    return () => clearInterval(t)
  }, [pollMs, error])

  const reload = useCallback(() => setTick(n => n + 1), [])
  return { data, error, loading, reload }
}

/** 手动触发的动作：给出 pending 与 error，避免每个按钮各写一遍。 */
export function useAction() {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<ApiError | null>(null)

  const run = useCallback(async <T>(fn: () => Promise<T>): Promise<T | null> => {
    setPending(true)
    setError(null)
    try {
      return await fn()
    } catch (e: unknown) {
      setError(e instanceof ApiError ? e : new ApiError(0, {
        code: 'NETWORK', message: e instanceof Error ? e.message : '请求失败',
      }))
      return null
    } finally {
      setPending(false)
    }
  }, [])

  return { run, pending, error, clearError: () => setError(null) }
}
