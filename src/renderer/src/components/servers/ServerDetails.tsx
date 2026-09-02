import React, { useState, useEffect } from 'react'
import {
  ArrowLeft,
  Link2,
  Play,
  RotateCw,
  Power,
  Terminal,
  Activity,
  Cpu,
  HardDrive,
  Radio,
  Key,
  Copy,
  Check,
  Globe,
  Loader2
} from 'lucide-react'
import { components } from '@shared/api/schema'
import { BinaryLaneClient } from '../../api/client'
import { LocalSshKey } from '@shared/ipc-types'
import { FirewallManager } from '../firewall/FirewallManager'
import { BackupManager } from '../backups/BackupManager'
import { ServerNetwork } from './ServerNetwork'
import { ServerSettings } from './ServerSettings'
import { ServerUsage } from './ServerUsage'
import {
  useServerMetrics,
  useServerConsole,
  useServerActionMutation,
  useServerDiagnosticMutation
} from '../../api/queries'
import { useTrackedActions } from '../../context/ActionTrackerContext'
import { logoForDistribution } from '../../lib/distroHelper'
import { launchSsh } from '../../lib/launchSsh'
import { copyDeepLink } from '../../lib/deeplinks'
import { describeActionType } from '../../lib/actionLabels'
import { ServerSubTab } from '../layout/Sidebar'

type ServerResponse = components['schemas']['Server']

interface ServerDetailsProps {
  server: ServerResponse
  client: BinaryLaneClient | null
  activeSubTab?: ServerSubTab
  onBack: () => void
  onOpenTerminal?: (ip: string) => void
}

/**
 * These probe the guest, not the hypervisor: `ping` pings the VPS itself and
 * `uptime` returns the VPS's own uptime. Host node uptime is a different value
 * entirely, and already on the server object as `host.uptime_ms`.
 */
const DIAGNOSTIC_LABELS: Record<string, string> = {
  ping: 'VPS ping',
  uptime: 'VPS uptime',
  is_running: 'Power state'
}

const isDiagnostic = (actionType: string): boolean => actionType in DIAGNOSTIC_LABELS

/** A diagnostic trigger that shows a spinner and a verb while its action runs. */
const DiagnosticButton: React.FC<{
  label: string
  busyLabel: string
  active: boolean
  disabled: boolean
  onClick: () => void
}> = ({ label, busyLabel, active, disabled, onClick }) => (
  <button
    onClick={onClick}
    disabled={disabled}
    aria-busy={active}
    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] hover:border-[#017cb6] text-xs font-medium rounded transition disabled:opacity-50"
  >
    {active && <Loader2 className="w-3.5 h-3.5 animate-spin text-[#017cb6]" />}
    {active ? busyLabel : label}
  </button>
)

/** Render a millisecond uptime as "12 days, 4 hours". */
function formatUptime(ms: number): string {
  const totalMinutes = Math.floor(ms / 60000)
  const days = Math.floor(totalMinutes / 1440)
  const hours = Math.floor((totalMinutes % 1440) / 60)
  const minutes = totalMinutes % 60
  const parts: string[] = []
  if (days) parts.push(`${days} day${days === 1 ? '' : 's'}`)
  if (hours) parts.push(`${hours} hour${hours === 1 ? '' : 's'}`)
  if (!days && !hours) parts.push(`${minutes} minute${minutes === 1 ? '' : 's'}`)
  return parts.join(', ')
}

/**
 * A completed diagnostic reports its answer in `result_data` — except ping,
 * which leaves it null and signals success purely by reaching `completed`. So
 * the absence of a value is not the absence of an answer, and this says so
 * rather than printing "null".
 */
function describeDiagnostic(
  actionType: string,
  action: { result_data?: string | null; started_at?: string | null; completed_at?: string | null }
): string {
  const label = DIAGNOSTIC_LABELS[actionType] ?? actionType
  const output = action.result_data?.trim()
  if (output) return `${label}: ${output}`

  let took = ''
  if (action.started_at && action.completed_at) {
    const ms = new Date(action.completed_at).getTime() - new Date(action.started_at).getTime()
    if (Number.isFinite(ms) && ms >= 0) took = ` (${(ms / 1000).toFixed(1)}s)`
  }
  return `${label} completed successfully${took}.`
}

export const ServerDetails: React.FC<ServerDetailsProps> = ({
  server,
  client,
  activeSubTab = 'overview',
  onBack
}) => {
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [actionInProgress, setActionInProgress] = useState<string | null>(null)
  /** `ok` drives the styling — a failed diagnostic must not read as an answer. */
  const [diagnosticResult, setDiagnosticResult] = useState<{ text: string; ok: boolean } | null>(null)
  const [localKeys, setLocalKeys] = useState<LocalSshKey[]>([])
  const [selectedKeyPath, setSelectedKeyPath] = useState<string>('')
  const [linkCopied, setLinkCopied] = useState(false)

  const handleCopyLink = async () => {
    await copyDeepLink({ kind: 'server', serverId: server.id, subTab: activeSubTab })
    setLinkCopied(true)
    setTimeout(() => setLinkCopied(false), 1500)
  }

  useEffect(() => {
    if (window.bldeskApi?.getLocalSshKeys) {
      window.bldeskApi
        .getLocalSshKeys()
        .then((keys) => {
          if (Array.isArray(keys)) {
            setLocalKeys(keys)
            const defaultKey = keys.find((k) => k.privateKeyPath)
            if (defaultKey?.privateKeyPath) {
              setSelectedKeyPath(defaultKey.privateKeyPath)
            }
          }
        })
        .catch(console.error)
    }
  }, [])

  const metricsQuery = useServerMetrics(client, server.id)
  const consoleQuery = useServerConsole(client, server.id)
  const serverAction = useServerActionMutation(client)
  const diagnosticAction = useServerDiagnosticMutation(client, server.id)
  const { track } = useTrackedActions()

  const primaryV4 =
    server.networks?.v4?.find((v) => v.type === 'public')?.ip_address ||
    server.networks?.v4?.[0]?.ip_address ||
    '127.0.0.1'

  const primaryV6 = server.networks?.v6?.[0]?.ip_address
  const isRunning = server.status === 'active'
  const distroIcon = logoForDistribution(server.image?.distribution)
  const ramGB = (server.memory / 1024).toFixed(0)

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 1500)
  }

  const handleAction = async (actionType: string, customPayload: any = {}) => {
    if (!confirm(`Trigger action "${actionType}" on server #${server.id}?`)) return
    setActionInProgress(actionType)
    try {
      // Diagnostics are awaited, because their answer only exists once the
      // action completes. Everything else is handed to the tracker, so the
      // panel is not held while a rebuild runs.
      if (isDiagnostic(actionType)) {
        setDiagnosticResult(null)
        const completed = await diagnosticAction.mutateAsync({ type: actionType, ...customPayload })
        setDiagnosticResult({ text: describeDiagnostic(actionType, completed), ok: true })
        return
      }

      const res = await serverAction.mutateAsync({
        serverId: server.id,
        actionPayload: { type: actionType, ...customPayload }
      })
      window.bldeskApi?.sendNotification?.({
        title: `Server Action: ${describeActionType(actionType)}`,
        body: `Action initiated successfully.`
      })
      if (res) track(res, describeActionType(actionType), server.name)
    } catch (err: any) {
      if (isDiagnostic(actionType)) {
        setDiagnosticResult({
          text: `${DIAGNOSTIC_LABELS[actionType]} failed: ${err.message || 'Unknown error'}`,
          ok: false
        })
      } else {
        alert(`Action failed: ${err.message || 'Unknown error'}`)
      }
    } finally {
      setActionInProgress(null)
    }
  }

  const handleLaunchRescueConsole = () => {
    if (!consoleQuery.data) return
    const url = consoleQuery.data.browser || consoleQuery.data.iframe
    window.bldeskApi?.openRescueConsole?.({
      serverId: server.id,
      serverName: server.name,
      url,
      width: consoleQuery.data.width || 1024,
      height: consoleQuery.data.height || 768
    })
  }

  const sample = metricsQuery.data?.average

  return (
    <div className="h-full flex flex-col bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa] overflow-y-auto select-text">
      {/* 1. Authentic PanelSite ServerHeader */}
      <div className="p-4 bg-white dark:bg-[#2b3035] border-b border-[#ced4da] dark:border-[#373b3e] shadow-sm sticky top-0 z-20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Header Info */}
          <div>
            <div className="flex items-center gap-2">
              <button
                onClick={onBack}
                className="md:hidden text-xs text-[#017cb6] hover:underline flex items-center gap-1"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span>Servers</span>
              </button>
              <h1 className="text-lg font-bold text-[#212529] dark:text-white flex items-center gap-2">
                <img src={distroIcon} alt="" className="w-5 h-5 object-contain" />
                <span><span className="text-[#6c757d] dark:text-slate-400 font-normal">Server:</span> {server.name}</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                    isRunning
                      ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border border-rose-500/30'
                  }`}
                >
                  {isRunning ? 'Running' : 'Stopped'}
                </span>
              </h1>
            </div>

            {/* Breadcrumb Specs */}
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#6c757d] dark:text-slate-400 mt-1">
              <span className="font-mono text-[#212529] dark:text-slate-200">{primaryV4}</span>
              <span>•</span>
              <span className="font-mono">#{server.id}</span>
              <button
                onClick={handleCopyLink}
                className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] text-[#6c757d] hover:text-[#017cb6] hover:bg-black/[0.05] dark:hover:bg-white/[0.06] transition"
                title="Copy bldesk:// link to this server"
              >
                {linkCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Link2 className="w-3 h-3" />}
                <span>{linkCopied ? 'Copied' : 'Copy link'}</span>
              </button>
              <span>•</span>
              <span>{server.region?.name || server.region?.slug?.toUpperCase()}</span>
              <span>•</span>
              <span>{server.vcpus} vCPUs / {ramGB} GB RAM / {server.disk} GB Disk</span>
              <span>•</span>
              <span>{server.image?.full_name || server.image?.name}</span>
            </div>
          </div>

          {/* Quick Action Controls */}
          <div className="flex flex-wrap items-center gap-2">
            {/* SSH Key Selector */}
            <div className="flex items-center gap-1 bg-[#f8f9fa] dark:bg-[#212529] px-2 py-1 border border-[#ced4da] dark:border-[#373b3e] rounded">
              <Key className="w-3.5 h-3.5 text-[#f1ca00] flex-shrink-0" />
              <select
                value={selectedKeyPath}
                onChange={(e) => setSelectedKeyPath(e.target.value)}
                className="bg-transparent text-xs text-[#212529] dark:text-slate-200 focus:outline-none cursor-pointer max-w-[120px]"
              >
                <option value="">Default Key</option>
                {localKeys.map((k) => (
                  <option key={k.name} value={k.privateKeyPath || ''} className="bg-white dark:bg-[#2b3035]">
                    {k.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() =>
                launchSsh({
                  host: primaryV4,
                  username: 'root',
                  privateKeyPath: selectedKeyPath || undefined
                })
              }
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-[#017cb6] hover:bg-[#016594] rounded transition shadow-sm"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span>Launch SSH</span>
            </button>

            <button
              onClick={handleLaunchRescueConsole}
              disabled={!consoleQuery.data}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700/60 rounded transition disabled:opacity-50"
              title="Open Out-of-Band Rescue VNC / Serial Console"
            >
              <Radio className="w-3.5 h-3.5" />
              <span>Console</span>
            </button>

            {isRunning ? (
              <>
                <button
                  onClick={() => handleAction('reboot')}
                  disabled={!!actionInProgress}
                  className="p-1.5 text-[#6c757d] hover:text-amber-500 hover:bg-[#e9ecef] dark:hover:bg-[#343a40] rounded transition border border-[#ced4da] dark:border-[#373b3e]"
                  title="Reboot"
                >
                  <RotateCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => handleAction('shutdown')}
                  disabled={!!actionInProgress}
                  className="p-1.5 text-[#6c757d] hover:text-rose-500 hover:bg-[#e9ecef] dark:hover:bg-[#343a40] rounded transition border border-[#ced4da] dark:border-[#373b3e]"
                  title="Graceful Shutdown"
                >
                  <Power className="w-3.5 h-3.5" />
                </button>
              </>
            ) : (
              <button
                onClick={() => handleAction('power_on')}
                disabled={!!actionInProgress}
                className="flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-700/60 rounded transition hover:bg-emerald-100"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Power On</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {diagnosticResult && (
        <div
          className={`mx-6 mt-4 p-3 border text-xs rounded flex items-center justify-between ${
            diagnosticResult.ok
              ? 'bg-sky-50 dark:bg-sky-950/40 border-sky-200 dark:border-sky-800 text-sky-800 dark:text-sky-300'
              : 'bg-red-500/10 border-red-500/40 text-red-700 dark:text-red-400'
          }`}
        >
          <span>{diagnosticResult.text}</span>
          <button onClick={() => setDiagnosticResult(null)} className="text-[#017cb6] hover:underline text-xs">
            Dismiss
          </button>
        </div>
      )}

      {/* 2. SubTab Viewport */}
      <div className="p-6 space-y-6">
        {/* OVERVIEW TAB */}
        {activeSubTab === 'overview' && (
          <div className="space-y-6">
            {/* Real-time Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>CPU Usage</span>
                  <Cpu className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#212529] dark:text-white">
                    {sample ? `${sample.cpu_usage_percent.toFixed(1)}%` : '—'}
                  </span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">{server.vcpus} vCPU</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>Memory</span>
                  <Activity className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#212529] dark:text-white">
                    {sample && server.memory > 0
                      ? `${((sample.memory_usage_bytes / (server.memory * 1024 * 1024)) * 100).toFixed(1)}%`
                      : '—'}
                  </span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">{ramGB} GB allocated</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>Disk Storage</span>
                  <HardDrive className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-[#212529] dark:text-white">{server.disk} GB</span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">NVMe High IOPS</span>
                </div>
              </div>

              <div className="bg-white dark:bg-[#2b3035] p-4 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
                <div className="flex items-center justify-between text-xs text-[#6c757d] dark:text-slate-400">
                  <span>Network Status</span>
                  <Globe className="w-4 h-4 text-[#017cb6]" />
                </div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">Online</span>
                  <span className="text-xs text-[#6c757d] dark:text-slate-400">1 Gbps Uplink</span>
                </div>
              </div>
            </div>

            {/* Server Information & Network DefTable Cards */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* DefTable 1: Server Info */}
              <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] font-semibold text-xs text-[#495057] dark:text-[#ced4da]">
                  Server Information
                </div>
                <div className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e] text-xs">
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Server ID</span>
                    <span className="font-mono text-[#212529] dark:text-white font-medium">#{server.id}</span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Hostname</span>
                    <span className="text-[#212529] dark:text-white font-medium">{server.name}</span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Data Centre</span>
                    <span className="text-[#212529] dark:text-white font-medium">
                      {server.region?.name} ({server.region?.slug?.toUpperCase()})
                    </span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Operating System</span>
                    <span className="text-[#212529] dark:text-white font-medium">
                      {server.image?.full_name || server.image?.name}
                    </span>
                  </div>
                  <div className="flex py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Created At</span>
                    <span className="text-[#212529] dark:text-white">
                      {server.created_at ? new Date(server.created_at).toLocaleDateString() : '—'}
                    </span>
                  </div>
                </div>
              </div>

              {/* DefTable 2: Network & Addressing */}
              <div className="bg-white dark:bg-[#2b3035] rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm overflow-hidden">
                <div className="px-4 py-3 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] font-semibold text-xs text-[#495057] dark:text-[#ced4da]">
                  Network & Addressing
                </div>
                <div className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e] text-xs">
                  <div className="flex items-center justify-between py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">Public IPv4</span>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-[#212529] dark:text-white font-medium">{primaryV4}</span>
                      <button
                        onClick={() => handleCopy(primaryV4)}
                        className="text-[#6c757d] hover:text-[#017cb6]"
                      >
                        {copiedText === primaryV4 ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>

                  {primaryV6 && (
                    <div className="flex items-center justify-between py-2.5 px-4">
                      <span className="w-32 text-[#6c757d] dark:text-slate-400">Public IPv6</span>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-[#212529] dark:text-white truncate max-w-[200px]">
                          {primaryV6}
                        </span>
                        <button
                          onClick={() => handleCopy(primaryV6)}
                          className="text-[#6c757d] hover:text-[#017cb6]"
                        >
                          {copiedText === primaryV6 ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">VPC Network</span>
                    <span className="text-[#212529] dark:text-white font-medium">
                      {server.vpc_id ? `Attached (VPC #${server.vpc_id})` : 'Default Public Bridge'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between py-2.5 px-4">
                    <span className="w-32 text-[#6c757d] dark:text-slate-400">SSH Connect</span>
                    <button
                      onClick={() => handleCopy(`ssh root@${primaryV4}`)}
                      className="flex items-center gap-1.5 text-xs text-[#017cb6] hover:underline font-mono"
                    >
                      <span>ssh root@{primaryV4}</span>
                      <Copy className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* USAGE & METRICS TAB */}
        {activeSubTab === 'usage' && <ServerUsage client={client} server={server} />}

        {/* REMOTE ACCESS TAB */}
        {activeSubTab === 'remote-access' && (
          <div className="space-y-6">
            <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
              <h3 className="text-sm font-bold text-[#212529] dark:text-white mb-2">Native Terminal & SSH Keys</h3>
              <p className="text-xs text-[#6c757d] dark:text-slate-400 mb-4">
                Launch an instant SSH connection in your macOS/Windows terminal using your hardware-vault keys.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={() =>
                    launchSsh({
                      host: primaryV4,
                      username: 'root',
                      privateKeyPath: selectedKeyPath || undefined
                    })
                  }
                  className="px-4 py-2 bg-[#017cb6] hover:bg-[#016594] text-white text-xs font-medium rounded transition flex items-center gap-2 shadow-sm"
                >
                  <Terminal className="w-4 h-4" />
                  <span>Launch Terminal Now</span>
                </button>
                <button
                  onClick={handleLaunchRescueConsole}
                  disabled={!consoleQuery.data}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-medium rounded transition flex items-center gap-2 shadow-sm disabled:opacity-50"
                >
                  <Radio className="w-4 h-4" />
                  <span>Open Out-of-Band Rescue VNC</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* BACKUPS TAB */}
        {activeSubTab === 'backups' && (
          <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
            <BackupManager client={client} initialServerId={server.id} />
          </div>
        )}

        {/* NETWORK TAB */}
        {activeSubTab === 'network' && <ServerNetwork client={client} server={server} />}

        {/* FIREWALL TAB */}
        {activeSubTab === 'firewall' && (
          <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm">
            <FirewallManager client={client} initialServerId={server.id} />
          </div>
        )}

        {/* SETTINGS TAB */}
        {activeSubTab === 'settings' && <ServerSettings client={client} server={server} />}

        {/* RECOVERY TAB */}
        {activeSubTab === 'recovery' && (
          <div className="bg-white dark:bg-[#2b3035] p-5 rounded-lg border border-[#ced4da] dark:border-[#373b3e] shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-[#212529] dark:text-white">Emergency Recovery & Rescue</h3>
            <p className="text-xs text-[#6c757d] dark:text-slate-400">
              Run diagnostics against the VPS or reboot into safe rescue mode.
            </p>

            {/* The host node is already on the server object, so this needs no
                request. Shown beside the VPS diagnostics because the two used to
                be conflated: the `uptime` action returns the guest's uptime, not
                the hypervisor's, and they are routinely weeks apart. */}
            {server.host && (
              <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs p-2.5 rounded bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e]">
                <span className="text-[#495057] dark:text-[#adb5bd]">
                  Host node{' '}
                  <span className="font-mono font-medium text-[#212529] dark:text-white">
                    {server.host.display_name || '—'}
                  </span>
                </span>
                {typeof server.host.uptime_ms === 'number' && (
                  <span className="text-[#495057] dark:text-[#adb5bd]">
                    Host uptime{' '}
                    <span className="font-medium text-[#212529] dark:text-white">
                      {formatUptime(server.host.uptime_ms)}
                    </span>
                  </span>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 pt-2">
              <DiagnosticButton
                label="VPS Ping Check"
                busyLabel="Pinging..."
                active={actionInProgress === 'ping'}
                disabled={!!actionInProgress}
                onClick={() => handleAction('ping')}
              />
              <DiagnosticButton
                label="VPS Uptime"
                busyLabel="Checking..."
                active={actionInProgress === 'uptime'}
                disabled={!!actionInProgress}
                onClick={() => handleAction('uptime')}
              />
              <button
                onClick={() => handleAction('enable_rescue_mode')}
                disabled={!!actionInProgress}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 border border-amber-500/40 text-amber-700 dark:text-amber-400 text-xs font-medium rounded hover:bg-amber-500/20 transition disabled:opacity-50"
              >
                {actionInProgress === 'enable_rescue_mode' && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                {actionInProgress === 'enable_rescue_mode' ? 'Enabling...' : 'Boot into Rescue Mode'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
