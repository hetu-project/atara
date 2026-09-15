import { useMemo } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from './useApi'
import type { RailGroup } from '../api/types'

/**
 * 法币收款渠道目录。
 *
 * **这张表归后端**（/catalog/rails），前端不留副本。理由跟合约地址那条
 * 一样：写死在前端的目录会跟后端的能力漂开，而且要等到很晚才发现。
 *
 * 漂开那一版的症状：菜单里有 SGD / AED / EUR 三档，后端只结算 CNY / HKD /
 * USD。只勾了 SGD 渠道的商户，准入照样审过，然后永远撮合不到任何一单——
 * 他没收到任何报错，只是没有生意。
 *
 * 后端只发能结算的那些，所以这种配置在界面上根本构造不出来。
 */
export function useRails(): RailGroup[] {
  const { data } = useApi(() => ep.rails(), [])
  return data ?? []
}

/**
 * 渠道 → 币种。
 *
 * 返回一个查询函数而不是一张 Map：调用方要的就是「这条渠道收什么币」，
 * 而目录还没取回来时它该诚实地答「不知道」，不是答一个空字符串。
 */
export function useRailFiat(): (rail: string) => string | undefined {
  const groups = useRails()
  return useMemo(() => {
    const m = new Map<string, string>()
    for (const g of groups) for (const r of g.rails) m.set(r.name, r.fiat)
    return (rail: string) => m.get(rail)
  }, [groups])
}
