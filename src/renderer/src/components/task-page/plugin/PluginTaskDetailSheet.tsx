import type React from 'react'
import { ArrowRight, ExternalLink, LoaderCircle, X } from 'lucide-react'
import { VisuallyHidden } from 'radix-ui'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '@/components/ui/sheet'
import CommentMarkdown from '@/components/sidebar/CommentMarkdown'
import { translate } from '@/i18n/i18n'
import { cn } from '@/lib/utils'
import type { ActivePluginTaskSource } from '@/store/plugin-task-sources'
import type { PluginTaskItem } from '../../../../../shared/plugins/plugin-task-source'
import { getPluginTaskStatusTone } from './plugin-task-status-tone'
import { usePluginTaskDetail } from './use-plugin-task-detail'

/** `item` stays set while the sheet animates closed, so its content does not blank out. */
export function PluginTaskDetailSheet({
  source,
  item,
  open,
  revision,
  onClose,
  onStart
}: {
  source: ActivePluginTaskSource
  item: PluginTaskItem | null
  open: boolean
  revision: number
  onClose: () => void
  onStart: (item: PluginTaskItem) => void
}): React.JSX.Element {
  const { detail, loading, error } = usePluginTaskDetail(source, item?.id ?? null, revision)
  // Why: the list row paints immediately; the fetched detail may carry a fresher item.
  const displayed = detail?.item ?? item
  return (
    <Sheet open={open && item !== null} onOpenChange={(next) => !next && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[min(92vw,780px)] sm:max-w-[780px]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        <VisuallyHidden.Root asChild>
          <SheetTitle>{displayed?.title ?? source.title}</SheetTitle>
        </VisuallyHidden.Root>
        <VisuallyHidden.Root asChild>
          <SheetDescription>
            {translate(
              'auto.components.TaskPage.pluginTaskDetailDescription',
              'Preview and start work from the selected task.'
            )}
          </SheetDescription>
        </VisuallyHidden.Root>
        <div className="flex h-full min-h-0 flex-col">
          {/* Why: the sheet sits under the fixed Windows/Linux window controls at the top right. */}
          <div className="flex flex-none items-start gap-3 border-b border-border/50 px-4 py-3 pr-[max(1rem,var(--window-controls-width,0px))]">
            <div className="min-w-0 flex-1 space-y-1">
              <h2 className="text-[15px] font-semibold leading-snug text-foreground">
                {displayed?.title ?? ''}
              </h2>
              <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {displayed?.status ? (
                  <span
                    className={cn(
                      'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
                      getPluginTaskStatusTone(displayed.status.tone)
                    )}
                  >
                    {displayed.status.label}
                  </span>
                ) : null}
                {displayed?.priority ? <span>{displayed.priority}</span> : null}
                {displayed?.owner ? <span className="truncate">{displayed.owner}</span> : null}
                <span>{source.title}</span>
              </div>
            </div>
            <div className="flex flex-none items-center gap-1">
              {displayed?.url ? (
                <Button
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => {
                    if (displayed.url) {
                      void window.api.shell.openUrl(displayed.url)
                    }
                  }}
                  aria-label={translate('auto.components.TaskPage.pluginTaskOpenLink', 'Open link')}
                >
                  <ExternalLink />
                </Button>
              ) : null}
              <Button
                size="sm"
                disabled={!displayed?.start}
                onClick={() => displayed && onStart(displayed)}
              >
                <ArrowRight />
                {translate('auto.components.TaskPage.9497f2787c', 'Start workspace')}
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={onClose}
                aria-label={translate('auto.components.TaskPage.pluginTaskCloseDetail', 'Close')}
              >
                <X />
              </Button>
            </div>
          </div>
          {displayed && !displayed.start && displayed.startBlockedReason ? (
            <p className="flex-none border-b border-border/50 px-4 py-2 text-xs text-muted-foreground">
              {displayed.startBlockedReason}
            </p>
          ) : null}
          <div className="min-h-0 flex-1 overflow-y-auto scrollbar-sleek px-4 py-4">
            {error ? (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            ) : loading && !detail ? (
              <div className="flex justify-center py-10">
                <LoaderCircle className="size-5 animate-spin text-muted-foreground" />
              </div>
            ) : detail?.bodyMarkdown?.trim() ? (
              <CommentMarkdown
                content={detail.bodyMarkdown}
                variant="document"
                className="text-[14px] leading-relaxed"
              />
            ) : (
              <p className="text-sm italic text-muted-foreground">
                {translate('auto.components.TaskPage.pluginTaskNoBody', 'No description provided.')}
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  )
}
