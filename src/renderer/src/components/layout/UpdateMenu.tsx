import React, { useEffect, useRef, useState } from 'react'
import { ArrowDownToLine, CheckCircle2, CloudOff, Loader2, RefreshCw, AlertTriangle, RotateCw, ChevronDown } from 'lucide-react'
import { UpdateChannel, UpdaterState } from '@shared/ipc-types'

/**
 * Title-bar update indicator + popover. Quiet when nothing is happening; shows a
 * gold dot when an update is downloading and a "Restart" pill once one is ready.
 */

export function useUpdaterState(): UpdaterState {
  const [state, setState] = useState<UpdaterState>({
    status: 'idle',
    currentVersion: typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : '1.0.28',
    channel: 'stable',
    supported: false
  })

  useEffect(() => {
    const api = window.bldeskApi
    if (!api?.getUpdaterState) return
    let unsub: (() => void) | undefined
    api.getUpdaterState().then(setState).catch(() => {})
    if (api.onUpdaterState) unsub = api.onUpdaterState(setState)
    return () => unsub?.()
  }, [])

  return state
}

export const UpdateMenu: React.FC = () => {
  const state = useUpdaterState()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  const busy = state.status === 'checking' || state.status === 'downloading' || state.status === 'available'
  const ready = state.status === 'ready'

  const check = () => window.bldeskApi?.checkForUpdates?.()
  const install = () => window.bldeskApi?.installUpdate?.()
  const setChannel = (c: UpdateChannel) => window.bldeskApi?.setUpdateChannel?.(c)

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      {ready ? (
        <button
          onClick={install}
          title={`Restart to install BLDesk ${state.availableVersion}`}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-900 bg-[#f1ca00] hover:bg-[#ffd633] rounded-md transition shadow"
        >
          <RotateCw className="w-3 h-3 animate-spin" />
          <span>Restart to update</span>
        </button>
      ) : state.apkUrl && state.status === 'available' ? (
        <button
          onClick={install}
          title={`Download and install BLDesk v${state.availableVersion}`}
          className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold text-slate-900 bg-[#f1ca00] hover:bg-[#ffd633] rounded-md transition shadow"
        >
          <ArrowDownToLine className="w-3.5 h-3.5" />
          <span>Update v{state.availableVersion}</span>
        </button>
      ) : (
        <button
          onClick={() => setOpen((o) => !o)}
          title={`BLDesk v${state.currentVersion} (${state.channel} channel)`}
          className="relative flex items-center gap-1.5 px-2 py-0.5 text-xs text-slate-300 hover:text-white bg-black/25 hover:bg-black/40 border border-white/10 hover:border-white/20 rounded-md transition shadow-inner font-mono"
        >
          {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin text-[#f1ca00]" /> : <span>v{state.currentVersion}</span>}
          <ChevronDown className="w-3 h-3 opacity-60" />
          {state.status === 'error' && <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-rose-500 ring-2 ring-[#343a40]" />}
          {state.status === 'up-to-date' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />}
          {state.status === 'check-failed' && <span className="w-1.5 h-1.5 rounded-full bg-slate-500" />}
          {state.status === 'available' && <span className="w-1.5 h-1.5 rounded-full bg-[#f1ca00]" />}
        </button>
      )}

      {/* Popover */}
      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-72 bg-white dark:bg-[#2b3035] text-[#212529] dark:text-[#f8f9fa] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-xl z-50 p-3 text-xs space-y-3 select-text">
          <div className="flex items-center justify-between">
            <div>
              <div className="font-bold">BLDesk</div>
              <div className="font-mono text-[#6c757d]">v{state.currentVersion}</div>
            </div>
            <StatusPill state={state} />
          </div>

          {state.apkUrl && state.status === 'available' && (
            <button
              onClick={install}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 bg-[#f1ca00] hover:bg-[#ffd633] text-slate-950 font-semibold rounded transition text-xs shadow"
            >
              <ArrowDownToLine className="w-3.5 h-3.5" />
              <span>Download APK (v{state.availableVersion})</span>
            </button>
          )}

          {state.status === 'check-failed' && (
            <div className="text-[11px] text-[#6c757d] dark:text-[#adb5bd] space-y-1">
              <div>Couldn't reach the update feed, so this build can't be confirmed as current.</div>
              {state.error && (
                <div className="font-mono text-[10px] opacity-70 break-words max-h-16 overflow-y-auto">{state.error}</div>
              )}
            </div>
          )}

          {state.status === 'error' && state.error && (
            <div className="text-[11px] text-rose-600 dark:text-rose-400 break-words max-h-16 overflow-y-auto">{state.error}</div>
          )}

          {state.status === 'downloading' && (
            <div className="h-1.5 w-full bg-black/10 dark:bg-white/10 rounded overflow-hidden">
              <div className="h-full bg-[#017cb6] transition-all" style={{ width: `${state.progress ?? 0}%` }} />
            </div>
          )}

          {state.releaseNotes && (state.status === 'available' || state.status === 'downloading' || ready) && (
            <div className="text-[11px] text-[#6c757d] dark:text-[#adb5bd] max-h-24 overflow-y-auto whitespace-pre-wrap border-l-2 border-[#017cb6]/40 pl-2">
              {state.releaseNotes}
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-1.5 text-[#6c757d] dark:text-[#adb5bd]">
              <span>Channel</span>
              <select
                value={state.channel}
                disabled={!state.supported}
                onChange={(e) => setChannel(e.target.value as UpdateChannel)}
                className="bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] rounded px-1.5 py-0.5 text-[#212529] dark:text-white outline-none disabled:opacity-50"
              >
                <option value="stable">Stable</option>
                <option value="beta">Beta</option>
              </select>
            </label>

            <button
              onClick={check}
              disabled={!state.supported || busy}
              className="flex items-center gap-1 px-2 py-1 bg-[#017cb6] hover:bg-[#016594] text-white rounded font-medium transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${state.status === 'checking' ? 'animate-spin' : ''}`} />
              <span>Check now</span>
            </button>
          </div>

          {!state.supported && (
            <div className="text-[11px] text-[#6c757d] dark:text-[#adb5bd]">
              Auto-update is only available in packaged desktop builds.
            </div>
          )}
          {state.lastCheckedAt && state.supported && (
            <div className="text-[10px] text-[#6c757d]">Last checked {new Date(state.lastCheckedAt).toLocaleString()}</div>
          )}
        </div>
      )}
    </div>
  )
}

const StatusPill: React.FC<{ state: UpdaterState }> = ({ state }) => {
  const base = 'flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold'
  switch (state.status) {
    case 'checking':
      return (
        <span className={`${base} bg-black/5 dark:bg-white/10 text-[#6c757d] dark:text-[#adb5bd]`}>
          <Loader2 className="w-3 h-3 animate-spin" /> Checking
        </span>
      )
    case 'available':
    case 'downloading':
      return (
        <span className={`${base} bg-[#017cb6]/15 text-[#017cb6]`}>
          <ArrowDownToLine className="w-3 h-3" /> {state.availableVersion ?? 'Update'} {state.progress != null ? `${state.progress}%` : ''}
        </span>
      )
    case 'ready':
      return (
        <span className={`${base} bg-[#f1ca00]/25 text-amber-700 dark:text-[#f1ca00]`}>
          <RotateCw className="w-3 h-3" /> {state.availableVersion} ready
        </span>
      )
    case 'up-to-date':
      return (
        <span className={`${base} bg-emerald-500/15 text-emerald-600 dark:text-emerald-400`}>
          <CheckCircle2 className="w-3 h-3" /> Up to date
        </span>
      )
    case 'check-failed':
      return (
        <span className={`${base} bg-black/5 dark:bg-white/10 text-[#6c757d] dark:text-[#adb5bd]`}>
          <CloudOff className="w-3 h-3" /> Couldn't check
        </span>
      )
    case 'error':
      return (
        <span className={`${base} bg-rose-500/15 text-rose-600 dark:text-rose-400`}>
          <AlertTriangle className="w-3 h-3" /> Error
        </span>
      )
    default:
      return state.supported ? null : (
        <span className={`${base} bg-black/5 dark:bg-white/10 text-[#6c757d] dark:text-[#adb5bd]`}>Dev build</span>
      )
  }
}
