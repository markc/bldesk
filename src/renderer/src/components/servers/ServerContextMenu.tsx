import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { ExternalLink, Terminal, Link2, Copy, RotateCw, Power, Play, Radio } from 'lucide-react'
import { components } from '@shared/api/schema'
import { formatDeepLink } from '@shared/deeplink'
import { primaryIpv4 } from '../../lib/deeplinks'

type ServerResponse = components['schemas']['Server']

export interface ContextMenuState {
  server: ServerResponse
  x: number
  y: number
}

interface ServerContextMenuProps {
  state: ContextMenuState
  onClose: () => void
  onOpen: (server: ServerResponse) => void
  onSsh: (ip: string) => void
  onCopyLink: (serverId: number) => void
  onAction: (serverId: number, type: 'power_on' | 'reboot' | 'shutdown') => void
  actionInProgress: boolean
}

/**
 * Lightweight in-renderer context menu for a server row. Rendered fixed at the
 * click point, nudged back on-screen if it would overflow, closed on outside
 * click / Escape / scroll.
 */
export const ServerContextMenu: React.FC<ServerContextMenuProps> = ({
  state,
  onClose,
  onOpen,
  onSsh,
  onCopyLink,
  onAction,
  actionInProgress
}) => {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: state.x, y: state.y })
  const { server } = state
  const ip = primaryIpv4(server)
  const isRunning = server.status === 'active'

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const { innerWidth, innerHeight } = window
    const r = el.getBoundingClientRect()
    setPos({
      x: state.x + r.width > innerWidth - 8 ? Math.max(8, state.x - r.width) : state.x,
      y: state.y + r.height > innerHeight - 8 ? Math.max(8, innerHeight - r.height - 8) : state.y
    })
  }, [state.x, state.y])

  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('mousedown', down)
    document.addEventListener('keydown', key)
    document.addEventListener('scroll', onClose, true)
    window.addEventListener('blur', onClose)
    return () => {
      document.removeEventListener('mousedown', down)
      document.removeEventListener('keydown', key)
      document.removeEventListener('scroll', onClose, true)
      window.removeEventListener('blur', onClose)
    }
  }, [onClose])

  const run = (fn: () => void) => () => {
    onClose()
    fn()
  }

  const item =
    'w-full flex items-center gap-2 px-2.5 py-1.5 text-left text-xs rounded hover:bg-black/[0.05] dark:hover:bg-white/[0.08] transition disabled:opacity-40 disabled:hover:bg-transparent'

  return (
    <div
      ref={ref}
      style={{ left: pos.x, top: pos.y }}
      className="fixed z-[60] w-56 p-1 bg-white dark:bg-[#2b3035] text-[#212529] dark:text-[#f8f9fa] border border-[#ced4da] dark:border-[#373b3e] rounded-md shadow-xl select-none"
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-2.5 py-1.5 text-[11px] font-semibold text-[#6c757d] dark:text-slate-400 truncate border-b border-[#ced4da]/60 dark:border-[#373b3e] mb-1">
        {server.name} <span className="font-mono font-normal">#{server.id}</span>
      </div>

      <button className={item} onClick={run(() => onOpen(server))}>
        <ExternalLink className="w-3.5 h-3.5 text-[#017cb6]" /> Open
      </button>
      <button className={item} disabled={!ip} onClick={run(() => ip && onSsh(ip))}>
        <Terminal className="w-3.5 h-3.5 text-[#017cb6]" /> SSH as root
      </button>

      <div className="my-1 border-t border-[#ced4da]/60 dark:border-[#373b3e]" />

      <button className={item} disabled={!ip} onClick={run(() => ip && navigator.clipboard.writeText(ip))}>
        <Copy className="w-3.5 h-3.5" /> Copy IP {ip && <span className="ml-auto font-mono text-[10px] text-[#6c757d]">{ip}</span>}
      </button>
      <button className={item} onClick={run(() => onCopyLink(server.id))} title={formatDeepLink({ kind: 'server', serverId: server.id })}>
        <Link2 className="w-3.5 h-3.5" /> Copy bldesk:// link
      </button>
      <button
        className={item}
        onClick={run(() => navigator.clipboard.writeText(formatDeepLink({ kind: 'console', serverId: server.id })))}
        title={formatDeepLink({ kind: 'console', serverId: server.id })}
      >
        <Radio className="w-3.5 h-3.5" /> Copy console link
      </button>

      <div className="my-1 border-t border-[#ced4da]/60 dark:border-[#373b3e]" />

      {isRunning ? (
        <>
          <button className={item} disabled={actionInProgress} onClick={run(() => onAction(server.id, 'reboot'))}>
            <RotateCw className="w-3.5 h-3.5 text-amber-500" /> Reboot…
          </button>
          <button className={item} disabled={actionInProgress} onClick={run(() => onAction(server.id, 'shutdown'))}>
            <Power className="w-3.5 h-3.5 text-rose-500" /> Shutdown…
          </button>
        </>
      ) : (
        <button className={item} disabled={actionInProgress} onClick={run(() => onAction(server.id, 'power_on'))}>
          <Play className="w-3.5 h-3.5 text-emerald-500" /> Power on…
        </button>
      )}
    </div>
  )
}
