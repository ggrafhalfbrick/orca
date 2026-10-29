import { OrcaRuntimeWithRestoredHandlePaneStart } from './terminal/surface/restored-handle-pane-start'

// Why its own layer: the terminal runtime layers are at their line caps and this is plugin-only.
export abstract class OrcaRuntimeWithPluginWorktreeContext extends OrcaRuntimeWithRestoredHandlePaneStart {
  /** Context of a worktree the user ran a plugin worktree command on. */
  async resolvePluginWorktreeContext(worktreeId: string): Promise<{
    path: string
    displayName: string
    branch: string
    host: 'local' | 'ssh'
  } | null> {
    try {
      // Why the workspace resolver: folder workspaces run plugin commands too, and need a real path.
      const resolved = await this.resolveWorkspaceSelector(`id:${worktreeId}`, {
        requireUsableFolderPath: true
      })
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
