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
 * Which fiat currencies can actually be settled.
 *
 * Same reason the rail catalogue lives on the server: a currency list written
 * into the page drifts from what the backend can clear, and nothing says so.
 * The fiat accounts form offered SGD and JPY for exactly that reason — both
 * selectable, neither settleable.
 *
 * Empty while the catalogue is loading, and callers must read that as "not
 * known yet" rather than "nothing is settleable".
 */
export function useTradableFiats(): string[] {
  const { data } = useApi(() => ep.fiats(), [])
  return useMemo(
    () => (data ?? []).flatMap(g => g.assets.map(a => a.code)),
    [data],
  )
}
