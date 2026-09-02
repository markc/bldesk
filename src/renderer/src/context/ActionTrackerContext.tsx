import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../api/client'
import { describeActionFailure, pollActionToSettled } from '../api/queries'

type ServerAction = components['schemas']['Action']

export type TrackedActionState =
  | 'running'
  | 'completed'
  | 'errored'
  | 'awaiting-interaction'
  | 'blocked-by-invoice'
  | 'lost'

export interface TrackedAction {
  actionId: number
  /** What the user asked for, in their words: "Rebuild Server OS". */
  label: string
  /** Which machine, when we know it. */
  resourceName?: string
  state: TrackedActionState
  /** Populated once settled, for the failure case. */
  detail?: string
  percentComplete?: number
  /**
   * BinaryLane's own description of the current step, e.g. "Backup of SYSTEM:
   * 38.5GB of 40.0 GB (310MB/s) - less than 1 minute remaining". Preferred over
   * `current_step`, which is only ever the bare step name.
   */
  stepDetail?: string
  startedAt: number
}

interface ActionTrackerValue {
  tracked: TrackedAction[]
  /** Register a submitted action so its real outcome gets reported. */
  track: (action: ServerAction, label: string, resourceName?: string) => void
  dismiss: (actionId: number) => void
}

const ActionTrackerContext = createContext<ActionTrackerValue | null>(null)

/**
 * Background tracking cadence. Deliberately not the blocking mutation's 2s: a
 * region migration or rebuild runs for minutes, and 2s would mean hundreds of
 * requests for one operation. Attentive early, then easing off.
 */
function backgroundInterval(elapsedMs: number): number {
  if (elapsedMs < 30_000) return 3000
  if (elapsedMs < 120_000) return 8000
  return 15_000
}

/** Completed toasts clear themselves; failures stay until acknowledged. */
const COMPLETED_TOAST_TTL_MS = 8000

export function ActionTrackerProvider({
  client,
  children
}: {
  client: BinaryLaneClient | null
  children: React.ReactNode
}) {
  const [tracked, setTracked] = useState<TrackedAction[]>([])
  const queryClient = useQueryClient()
  /** One controller per tracked action, so teardown or a profile switch stops the polls. */
  const controllers = useRef(new Map<number, AbortController>())

  const update = useCallback((actionId: number, patch: Partial<TrackedAction>) => {
    setTracked((prev) => prev.map((t) => (t.actionId === actionId ? { ...t, ...patch } : t)))
  }, [])

  /** One auto-dismiss timer per completed action; see the effect below for why. */
  const dismissTimers = useRef(new Map<number, ReturnType<typeof setTimeout>>())

  const dismiss = useCallback((actionId: number) => {
    controllers.current.get(actionId)?.abort()
    controllers.current.delete(actionId)
    const timer = dismissTimers.current.get(actionId)
    if (timer) {
      clearTimeout(timer)
      dismissTimers.current.delete(actionId)
    }
    setTracked((prev) => prev.filter((t) => t.actionId !== actionId))
  }, [])

  const track = useCallback(
    (action: ServerAction, label: string, resourceName?: string) => {
      if (!client || !action?.id) return
      if (controllers.current.has(action.id)) return

      const controller = new AbortController()
      controllers.current.set(action.id, controller)

      setTracked((prev) => [
        ...prev.filter((t) => t.actionId !== action.id),
        {
          actionId: action.id,
          label,
          resourceName,
          state: 'running',
          percentComplete: action.progress?.percent_complete,
          startedAt: Date.now()
        }
      ])

      const trackingStartedAt = Date.now()

      void (async () => {
        try {
          const pollOptions = {
            // No deadline: this is the long-operation path. A rebuild that takes
            // twenty minutes should say "still going", never "timed out".
            timeoutMs: null,
            // Measured from when tracking began, not from each call below, so a
            // resumed watch does not drop back to the 3s opening cadence.
            intervalMs: () => backgroundInterval(Date.now() - trackingStartedAt),
            signal: controller.signal,
            onProgress: (fresh: ServerAction) =>
              update(action.id, {
                percentComplete: fresh.progress?.percent_complete,
                stepDetail: fresh.progress?.current_step_detail ?? undefined
              })
          }

          let settled = await pollActionToSettled(client, action.id, { ...pollOptions, initial: action })

          // `awaiting-interaction` settles the poll — the blocking mutation needs
          // that, so it can release the UI lock instead of burning its timeout on
          // a question no amount of waiting will answer. Background tracking
          // wants the opposite: keep watching, because the operator is about to
          // answer and the action will carry on. Without this the toast would
          // sit on "waiting for your answer" forever, still pointing at a prompt
          // that vanished the moment the answer was accepted.
          let promptRequested = false
          while (
            (settled.state === 'awaiting-interaction' || settled.state === 'blocked-by-invoice') &&
            !controller.signal.aborted
          ) {
            if (settled.state === 'awaiting-interaction') {
              update(action.id, { state: 'awaiting-interaction' })
              if (!promptRequested) {
                promptRequested = true
                // The toast tells the user to see the prompt, but the account-wide
                // watch that renders it polls on its own 20s cycle. Pull it forward
                // so the two never disagree about whether there is a question.
                void queryClient.invalidateQueries({ queryKey: ['actions-awaiting-interaction'] })
              }
            } else {
              update(action.id, {
                state: 'blocked-by-invoice',
                detail: `Blocked by invoice #${settled.action.blocking_invoice_id}, which requires payment.`
              })
            }
            // No `initial`: pass the stale stalled snapshot back in and it would
            // classify the same way again without ever asking BinaryLane.
            settled = await pollActionToSettled(client, action.id, pollOptions)
          }

          if (controller.signal.aborted) return

          if (settled.state === 'completed') {
            update(action.id, { state: 'completed', percentComplete: 100 })
          } else if (settled.state === 'errored') {
            update(action.id, { state: 'errored', detail: describeActionFailure(settled.action) ?? undefined })
          } else {
            update(action.id, { state: 'running' })
          }

          // Whatever happened, the cached view of the account is now stale.
          void queryClient.invalidateQueries({ queryKey: ['servers'] })
          if (settled.action?.resource_id) {
            const resourceId = settled.action.resource_id
            void queryClient.invalidateQueries({ queryKey: ['server', resourceId] })
            // Backups and snapshots are cached under their own keys, so a
            // completed take_backup or restore would otherwise leave the list
            // showing what it held before the action ran.
            void queryClient.invalidateQueries({ queryKey: ['serverBackups', resourceId] })
            void queryClient.invalidateQueries({ queryKey: ['serverSnapshots', resourceId] })
          }
        } catch (err) {
          if (controller.signal.aborted) return
          update(action.id, {
            state: 'lost',
            detail: err instanceof Error ? err.message : String(err)
          })
        } finally {
          // Only retire our own controller. `finally` runs on the aborted early
          // returns above too, so an unconditional delete here would evict a
          // newer controller that had since been registered for the same id —
          // leaving it invisible to both `dismiss` and the duplicate guard.
          if (controllers.current.get(action.id) === controller) {
            controllers.current.delete(action.id)
          }
        }
      })()
    },
    [client, queryClient, update]
  )

  /**
   * Auto-clear successes only — an error nobody saw is worse than a stale toast.
   *
   * Scheduled once per action and deliberately NOT torn down on re-render. A
   * naive `return () => timers.forEach(clearTimeout)` here looks correct but
   * never fires while any other action is still polling: each progress update
   * makes a new `tracked` array, which would clear and restart this timer every
   * few seconds. Successes would then sit on screen indefinitely, which is the
   * opposite of the intent.
   */
  useEffect(() => {
    for (const action of tracked) {
      if (action.state !== 'completed') continue
      if (dismissTimers.current.has(action.actionId)) continue
      const timer = setTimeout(() => {
        dismissTimers.current.delete(action.actionId)
        dismiss(action.actionId)
      }, COMPLETED_TOAST_TTL_MS)
      dismissTimers.current.set(action.actionId, timer)
    }
  }, [tracked, dismiss])

  useEffect(() => {
    const timers = dismissTimers.current
    return () => {
      timers.forEach(clearTimeout)
      timers.clear()
    }
  }, [])

  // Switching profile (or unmounting) must not leave polls running against the old token.
  useEffect(() => {
    return () => {
      controllers.current.forEach((c) => c.abort())
      controllers.current.clear()
    }
  }, [client])

  const value = useMemo<ActionTrackerValue>(() => ({ tracked, track, dismiss }), [tracked, track, dismiss])

  return <ActionTrackerContext.Provider value={value}>{children}</ActionTrackerContext.Provider>
}

/**
 * Register long-running actions so the UI reports what actually happened.
 * Returns a no-op tracker outside the provider so a component can call it
 * without needing to know whether it is mounted inside one.
 */
export function useTrackedActions(): ActionTrackerValue {
  const ctx = useContext(ActionTrackerContext)
  return ctx ?? { tracked: [], track: () => {}, dismiss: () => {} }
}
