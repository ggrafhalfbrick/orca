import {
  perforceWorkspaceKey,
  runPerforceOperation,
  type PerforceWorkspaceTarget
} from '../runtime/runtime-perforce-client'

// Why: detection shells out to `p4 info` (over SSH or on an Orca server), so remember answers per workspace.
const detectionByKey = new Map<string, Promise<boolean>>()
const knownWorkspaces = new Set<string>()

/** Synchronous answer for key handlers: true only after a positive detection this session. */
export function isKnownPerforceWorkspace(target: PerforceWorkspaceTarget): boolean {
  return knownWorkspaces.has(perforceWorkspaceKey(target))
}

export function isPerforceDetectionPending(key: string): boolean {
  return detectionByKey.has(key)
}

/** Drops the remembered answer so the next detection asks p4 again. */
export function forgetPerforceDetection(key: string): void {
  detectionByKey.delete(key)
  knownWorkspaces.delete(key)
}

export function detectPerforceWorkspace(target: PerforceWorkspaceTarget): Promise<boolean> {
  const key = perforceWorkspaceKey(target)
  let pending = detectionByKey.get(key)
  if (!pending) {
    pending = Promise.resolve()
      .then(() => runPerforceOperation(target, 'detect', {}))
      .then((result) => {
        // Only positive answers are remembered so a later p4 setup/login is detected on retry.
        if (result.isWorkspace) {
          knownWorkspaces.add(key)
        } else {
          forgetPerforceDetection(key)
        }
        return result.isWorkspace
      })
      .catch(() => {
        detectionByKey.delete(key)
        return false
      })
    detectionByKey.set(key, pending)
  }
  return pending
}
