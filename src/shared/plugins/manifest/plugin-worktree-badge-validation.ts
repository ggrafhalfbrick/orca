import type { RefinementCtx } from 'zod'

type WorktreeBadgeValidationManifest = {
  contributes: {
    commands: { id: string; action?: string; when?: 'global' | 'workspace' }[]
    worktreeBadges: { id: string; commands: string[] }[]
  }
  capabilities: { kind: string }[]
}

/** Integration-only: worktree badges name workspace worker commands and need workspace:read. */
export function validateWorktreeBadges(
  manifest: WorktreeBadgeValidationManifest,
  ctx: RefinementCtx
): void {
  const badges = manifest.contributes.worktreeBadges
  const seen = new Set<string>()
  for (const [index, badge] of badges.entries()) {
    if (seen.has(badge.id)) {
      ctx.addIssue({
        code: 'custom',
        path: ['contributes', 'worktreeBadges', index],
        message: `duplicate worktreeBadges id: ${badge.id}`
      })
    }
    seen.add(badge.id)
  }
  const commands = new Map(manifest.contributes.commands.map((command) => [command.id, command]))
  for (const [index, badge] of badges.entries()) {
    for (const [commandIndex, commandId] of badge.commands.entries()) {
      const command = commands.get(commandId)
      if (!command || command.action !== undefined || command.when !== 'workspace') {
        ctx.addIssue({
          code: 'custom',
          path: ['contributes', 'worktreeBadges', index, 'commands', commandIndex],
          message: `must name a contributed worker command with when "workspace": ${commandId}`
        })
      }
    }
  }
  // Why: running a badge command hands the plugin the worktree's folder path.
  if (
    badges.length > 0 &&
    !manifest.capabilities.some((capability) => capability.kind === 'workspace:read')
  ) {
    ctx.addIssue({
      code: 'custom',
      path: ['capabilities'],
      message: 'workspace:read capability required when contributes.worktreeBadges is non-empty'
    })
  }
}
