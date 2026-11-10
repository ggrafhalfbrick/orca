import type { PluginContributionSummaryItem } from '../../../../../shared/plugins/contributions/plugin-contribution-summary'
import type { PluginManifest } from '../../../../../shared/plugins/manifest/plugin-manifest'

// Why its own module: on integration, task sources and worktree badges together would push
// plugin-contributions.ts past max-lines, so their titles are read here.

/** The task lists and worktree badges a plugin adds, by title. */
export type Titles = {
  taskSources?: readonly string[]
  worktreeBadges: readonly string[]
}

export function fromManifest(contributes: PluginManifest['contributes']): Titles {
  return {
    taskSources: contributes.taskSources.map((source) => source.title),
    worktreeBadges: contributes.worktreeBadges.map((badge) => badge.title)
  }
}

export function fromSummary(summary: readonly PluginContributionSummaryItem[]): Titles {
  const names = (kind: PluginContributionSummaryItem['kind']) =>
    summary.filter((item) => item.kind === kind).map((item) => item.name)
  return { taskSources: names('taskSources'), worktreeBadges: names('worktreeBadges') }
}
