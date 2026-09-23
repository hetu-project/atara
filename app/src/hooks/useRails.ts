import { useMemo } from 'react'
import * as ep from '../api/endpoints'
import { useApi } from './useApi'
import type { RailGroup } from '../api/types'

/**
 * Catalog of fiat payout rails.
 *
 * **This table belongs to the backend** (/catalog/rails); the frontend keeps no copy.
 * Same reasoning as contract addresses: a catalog hardcoded in the frontend drifts away
 * from what the backend can actually do, and the drift surfaces very late.
 *
 * Symptoms of the version that drifted: the menu offered SGD / AED / EUR while the backend
 * only settled CNY / HKD / USD. A merchant who ticked only the SGD rail still passed
 * onboarding review, then never matched a single order -- no error, just no business.
 *
 * The backend only sends rails it can settle, so that configuration is not even constructible in the UI.
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
