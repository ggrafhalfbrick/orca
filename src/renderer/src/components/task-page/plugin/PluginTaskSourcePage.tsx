import type React from 'react'
import { useCallback, useState } from 'react'
import { LoaderCircle } from 'lucide-react'
import { translate } from '@/i18n/i18n'
import { useAppStore } from '@/store'
import type { ActivePluginTaskSource } from '@/store/plugin-task-sources'
import type { PluginTaskItem } from '../../../../../shared/plugins/plugin-task-source'
import { useTaskPageEscapeToClose } from '../../use-task-page-escape-to-close'
import { PluginTaskDetailSheet } from './PluginTaskDetailSheet'
import { PluginTaskFilters } from './PluginTaskFilters'
import { PluginTaskList } from './PluginTaskList'
import { PluginTaskSourceBar } from './PluginTaskSourceBar'
import { openComposerForPluginTask } from './plugin-task-start'
import { usePluginTaskList } from './use-plugin-task-list'

function PluginTaskListBody({
  list,
  selectedItemId,
  onOpen,
  onStart
}: {
  list: ReturnType<typeof usePluginTaskList>
  selectedItemId: string | null
  onOpen: (item: PluginTaskItem) => void
  onStart: (item: PluginTaskItem) => void
}): React.JSX.Element {
  const items = list.result?.items ?? []
  if (list.error && items.length === 0) {
    return (
      <div role="alert" className="px-4 py-4 text-sm text-destructive">
        {list.error}
      </div>
    )
  }
  if (list.loading && !list.result) {
    return (
      <div className="divide-y divide-border/50">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="px-3 py-3">
            <div className="h-4 w-4/5 animate-pulse rounded bg-muted/70" />
            <div className="mt-2 h-3 w-3/5 animate-pulse rounded bg-muted/60" />
          </div>
        ))}
      </div>
    )
  }
  if (items.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <p className="text-sm font-medium text-foreground">
          {translate('auto.components.TaskPage.pluginTaskEmpty', 'No tasks found')}
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          {translate(
            'auto.components.TaskPage.pluginTaskEmptyHint',
            'Try different search terms or filters.'
          )}
        </p>
      </div>
    )
  }
  return (
    <>
      {list.error ? (
        <div role="alert" className="border-b border-border/50 px-4 py-2 text-xs text-destructive">
          {list.error}
        </div>
      ) : null}
      <PluginTaskList
        items={items}
        selectedItemId={selectedItemId}
        onOpen={onOpen}
        onStart={onStart}
      />
    </>
  )
}

/** Tasks page for one plugin-contributed source. Key it on the source so state resets per source. */
export function PluginTaskSourcePage({
  source
}: {
  source: ActivePluginTaskSource
}): React.JSX.Element {
  const closeTaskPage = useAppStore((state) => state.closeTaskPage)
  const activeModal = useAppStore((state) => state.activeModal)
  const list = usePluginTaskList(source)
  const [selectedItem, setSelectedItem] = useState<PluginTaskItem | null>(null)
  const [detailOpen, setDetailOpen] = useState(false)
  const [detailRevision, setDetailRevision] = useState(0)
  useTaskPageEscapeToClose(detailOpen || activeModal !== 'none', closeTaskPage)
  const openItem = useCallback((item: PluginTaskItem) => {
    setSelectedItem(item)
    setDetailOpen(true)
    setDetailRevision((revision) => revision + 1)
  }, [])
  const startItem = useCallback((item: PluginTaskItem) => {
    if (openComposerForPluginTask(item)) {
      setDetailOpen(false)
    }
  }, [])
  const shownCount = list.result?.items.length ?? 0
  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden bg-background text-foreground">
      <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
        {/* Why: pt-1.5 (6px) aligns this 32px icon cluster's center with the sidebar Tasks row, 22px below the titlebar. */}
        <div className="mx-auto flex min-h-0 min-w-0 w-full flex-1 flex-col px-5 pt-1.5 pb-4 md:px-8 md:pt-1.5 md:pb-5">
          <div className="flex flex-none flex-col gap-2">
            <PluginTaskSourceBar source={source} />
            {list.result?.notice ? (
              <div
                role="status"
                className="max-w-3xl truncate rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs text-muted-foreground"
              >
                {list.result.notice}
              </div>
            ) : null}
            <PluginTaskFilters title={source.title} list={list} />
          </div>
          <div className="flex min-h-0 max-h-full flex-col overflow-hidden rounded-md rounded-t-none border border-t-0 border-border/50 bg-background shadow-sm">
            <div className="flex h-10 flex-none items-center justify-between gap-3 border-b border-border/50 bg-muted/35 px-3">
              <div className="min-w-0 truncate text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                {source.title}
              </div>
              <div className="flex shrink-0 items-center gap-2 text-[11px] text-muted-foreground">
                {list.loading && list.result ? (
                  <LoaderCircle className="size-3 animate-spin" aria-hidden />
                ) : null}
                {shownCount} {translate('auto.components.TaskPage.b7bae28b6a', 'shown')}
              </div>
            </div>
            <div
              className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek"
              style={{ scrollbarGutter: 'stable' }}
            >
              <PluginTaskListBody
                list={list}
                selectedItemId={detailOpen ? (selectedItem?.id ?? null) : null}
                onOpen={openItem}
                onStart={startItem}
              />
            </div>
          </div>
        </div>
      </div>
      <PluginTaskDetailSheet
        source={source}
        item={selectedItem}
        open={detailOpen}
        revision={detailRevision}
        onClose={() => setDetailOpen(false)}
        onStart={startItem}
      />
    </div>
  )
}
