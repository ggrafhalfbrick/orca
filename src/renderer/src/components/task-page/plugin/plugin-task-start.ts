import { useAppStore } from '@/store'
import type { PluginTaskItem } from '../../../../../shared/plugins/plugin-task-source'
import type { Repo } from '../../../../../shared/repo-types'

function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, '/').replace(/\/+$/, '')
}

function isWindowsDrivePath(value: string): boolean {
  return /^[a-z]:\//i.test(value)
}

/** Finds the project for a recipe's folder; local projects win over SSH ones with the same path. */
export function findRepoIdForProjectPath(
  repos: readonly Pick<Repo, 'id' | 'path' | 'connectionId'>[],
  projectPath: string
): string | null {
  const wanted = normalizeProjectPath(projectPath)
  const caseInsensitive = isWindowsDrivePath(wanted)
  const matches = repos.filter((repo) => {
    const candidate = normalizeProjectPath(repo.path)
    return caseInsensitive ? candidate.toLowerCase() === wanted.toLowerCase() : candidate === wanted
  })
  return (matches.find((repo) => !repo.connectionId) ?? matches[0])?.id ?? null
}

/** Opens Create workspace prefilled from the item's start recipe; the user reviews before creating. */
export function openComposerForPluginTask(item: PluginTaskItem): boolean {
  const recipe = item.start
  if (!recipe) {
    return false
  }
  const store = useAppStore.getState()
  const repoId = recipe.projectPath
    ? findRepoIdForProjectPath(store.repos, recipe.projectPath)
    : null
  store.openModal('new-workspace-composer', {
    prefilledName: recipe.workspaceName ?? item.title,
    ...(repoId ? { initialRepoId: repoId } : {}),
    ...(recipe.baseRef ? { initialBaseBranch: recipe.baseRef } : {}),
    ...(recipe.agentPrompt ? { initialAgentDraft: recipe.agentPrompt } : {}),
    telemetrySource: 'sidebar'
  })
  return true
}
