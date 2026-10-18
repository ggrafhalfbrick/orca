import { OrcaRuntimeWithGetTerminalInteractiveWait } from './terminal/wait/terminal-interactive-wait'

// Why its own layer: terminal-interactive-wait.ts is at its line cap and this is plugin-only.
export abstract class OrcaRuntimeWithPluginWorktreeContext extends OrcaRuntimeWithGetTerminalInteractiveWait {
  /** Context of a worktree the user ran a plugin worktree command on. */
  async resolvePluginWorktreeContext(worktreeId: string): Promise<{
    path: string
    displayName: string
    branch: string
    host: 'local' | 'ssh'
  } | null> {
    try {
      const resolved = await this.resolveWorktreeSelector(`id:${worktreeId}`)
      const repo = this.store?.getRepo(resolved.repoId)
      return {
        path: resolved.git.path,
        displayName: resolved.displayName,
        branch: resolved.git.branch,
        host: repo?.connectionId ? 'ssh' : 'local'
      }
    } catch {
      return null
    }
  }
}
