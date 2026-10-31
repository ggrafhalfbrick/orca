import type { CanUseTool, OnUserDialog, PermissionResult } from '@anthropic-ai/claude-agent-sdk'
import type { ClaudePromptRegistry } from './claude-structured-prompt-replies'
import type { ClaudeStructuredSessionEvent } from './structured/claude-structured-session-state'
import {
  claudePermissionPresentation,
  claudePermissionSubject
} from './claude-permission-presentation'
import { claudePromptQuestions } from './claude-prompt-registry'
import { claudePermissionModeBypassesToolAsks } from './claude-structured-launch-resolution'
import type { AgentChatPermissionChoice } from '../../shared/agent-chat-permission-mode'

export type ClaudePermissionCallbackDeps = {
  sessionId: string
  prompts: ClaudePromptRegistry
  emit: (event: ClaudeStructuredSessionEvent) => void
  /** Full access: a tool-permission ask runs without prompting. A genuine question or a plan
   *  proposal still reaches the user — the CLI's bypass flag never suppresses those either. */
  permissionMode?: AgentChatPermissionChoice
}

function allowResult(
  input: Record<string, unknown>,
  toolUseId: string | undefined
): PermissionResult {
  return {
    behavior: 'allow',
    updatedInput: input,
    ...(toolUseId ? { toolUseID: toolUseId } : {})
  }
}

function denySafeResult(toolUseId: string | undefined): PermissionResult {
  return {
    behavior: 'deny',
    message: 'Orca could not decode this permission request.',
    ...(toolUseId ? { toolUseID: toolUseId } : {})
  }
}

/** Malformed requests are denied; provider cancellation forgets the callback without replying. */
export function buildClaudePermissionCallbacks(deps: ClaudePermissionCallbackDeps): {
  canUseTool: CanUseTool
  onUserDialog: OnUserDialog
} {
  const canUseTool: CanUseTool = (toolName, input, options) =>
    new Promise<PermissionResult | null>((resolve) => {
      let cancel = (): void => {}
      const settle = (response: PermissionResult | null): void => {
        options.signal.removeEventListener('abort', cancel)
        resolve(response)
      }
      const subject = claudePermissionSubject(toolName, input)
      const isQuestion = toolName === 'AskUserQuestion' && claudePromptQuestions(input).length > 0
      // Full access skips the ask for tool permissions, but never for a question or a plan proposal.
      if (
        claudePermissionModeBypassesToolAsks(deps.permissionMode) &&
        !isQuestion &&
        subject?.kind !== 'plan'
      ) {
        settle(allowResult(input, options.toolUseID))
        return
      }
      const prompt = deps.prompts.register({
        ...claudePermissionPresentation(options),
        ...(subject ? { subject } : {}),
        requestId: options.requestId,
        toolName,
        toolUseId: options.toolUseID,
        input,
        suggestions: options.suggestions ?? [],
        settle,
        ...(options.agentID ? { agentId: options.agentID } : {})
      })
      if (!prompt) {
        settle(denySafeResult(options.toolUseID))
        return
      }
      cancel = (): void => {
        if (deps.prompts.forgetIfPending(prompt)) {
          deps.emit({
            type: 'prompt-cancelled',
            sessionId: deps.sessionId,
            promptKey: prompt.promptKey
          })
          // Null tells the SDK to write no response to the cancelled request.
          settle(null)
        }
      }
      if (options.signal.aborted) {
        // Abort events are not replayed for listeners added after cancellation.
        cancel()
        return
      }
      options.signal.addEventListener('abort', cancel, { once: true })
      deps.emit({ type: 'prompt', sessionId: deps.sessionId, prompt })
    })

  const onUserDialog: OnUserDialog = () => Promise.resolve({ behavior: 'cancelled' })

  return { canUseTool, onUserDialog }
}
