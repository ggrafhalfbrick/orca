// Opens Unity projects from Orca worktrees. Runs in Orca's plugin worker.
import { openUnityProject } from './src/open-project.mjs'

export default function activate(orca) {
  orca.commands.register('open-editor', (args) => openUnityProject(args?.worktree))
}
