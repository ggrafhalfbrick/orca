import { useCallback, useEffect, useState } from 'react'
import type { PluginTaskListResult } from '../../../../../shared/plugins/plugin-task-source'
import type { ActivePluginTaskSource } from '@/store/plugin-task-sources'
import { pluginTaskErrorMessage } from './plugin-task-error-message'

const SEARCH_DEBOUNCE_MS = 250

// Why: revisiting a source paints its last unfiltered list at once, then refreshes.
const lastDefaultListBySource = new Map<string, PluginTaskListResult>()

export type PluginTaskListState = {
  searchInput: string
  setSearchInput: (value: string) => void
  filters: Record<string, string>
  setFilter: (filterId: string, value: string) => void
  result: PluginTaskListResult | null
  loading: boolean
  error: string | null
  refresh: () => void
}

/** Mount once per source (key the caller on the source) so state never leaks between sources. */
export function usePluginTaskList(source: ActivePluginTaskSource): PluginTaskListState {
  const [searchInput, setSearchInput] = useState('')
  const [query, setQuery] = useState('')
  const [filters, setFilters] = useState<Record<string, string>>({})
  const [refreshNonce, setRefreshNonce] = useState(0)
  const [result, setResult] = useState<PluginTaskListResult | null>(
    () => lastDefaultListBySource.get(source.key) ?? null
  )
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setQuery(searchInput.trim()), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [searchInput])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    const isDefaultView = query === '' && Object.keys(filters).length === 0
    window.api.plugins
      .listTaskSourceItems({
        pluginKey: source.pluginKey,
        sourceId: source.sourceId,
        params: { query, filters }
      })
      .then((next) => {
        if (cancelled) {
          return
        }
        if (isDefaultView) {
          lastDefaultListBySource.set(source.key, next)
        }
        setResult(next)
        setError(null)
      })
      .catch((failure: unknown) => {
        if (!cancelled) {
          setError(pluginTaskErrorMessage(failure))
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [filters, query, refreshNonce, source.key, source.pluginKey, source.sourceId])

  const setFilter = useCallback((filterId: string, value: string) => {
    setFilters((current) => ({ ...current, [filterId]: value }))
  }, [])
  const refresh = useCallback(() => setRefreshNonce((nonce) => nonce + 1), [])

  return { searchInput, setSearchInput, filters, setFilter, result, loading, error, refresh }
}
