// Sample plugin runs in a lazily forked plain-Node worker; its default export receives commands, events and capability-gated host API.
export default function activate(orca) {
  orca.commands.register('hello-ping', async () => {
    const stored = await orca.host.call('storage.get', { key: 'pings' })
    const count = (typeof stored?.value === 'number' ? stored.value : 0) + 1
    await orca.host.call('storage.set', { key: 'pings', value: count })
    // A string result is shown as-is in Orca; objects are shown as JSON.
    return count === 1 ? 'Pong! First ping.' : `Pong! ${count} pings so far.`
  })

  // Workspace commands get `args.worktree` (path, displayName, branch, host) when run from a
  // workspace badge, the workspace context menu, or the palette; `message` is shown as a toast.
  orca.commands.register('hello-worktree', async (args) => ({
    message: args?.worktree
      ? `${args.worktree.displayName} is at ${args.worktree.path}`
      : 'Run this command on a workspace.'
  }))

  orca.events.on('workspace.created', async (payload) => {
    orca.log(`${payload.kind} created: ${payload.workspaceId} at ${payload.path}`)
    await orca.host.call('notifications.show', {
      title: 'Workspace created',
      body: payload.path
    })
  })

  orca.events.on('agent.status.changed', (payload) => {
    orca.log(`agent status: ${payload.state} in ${payload.workspaceId ?? 'unknown workspace'}`)
  })
}
