import React, { useState } from 'react'
import {
  Archive,
  Plus,
  RotateCcw,
  HardDrive,
  Loader2,
  Server,
  Disc,
  Clock,
  Download,
  X
} from 'lucide-react'
import { BinaryLaneClient } from '../../api/client'
import {
  useServers,
  useServerBackups,
  useServerSnapshots,
  useServerActions,
  useTakeBackupMutation,
  useRestoreBackupMutation,
  useToggleAutomatedBackupsMutation,
  useAttachBackupMutation,
  useDetachBackupMutation,
  useImageDownloadMutation
} from '../../api/queries'

interface BackupManagerProps {
  client: BinaryLaneClient | null
  initialServerId?: number | null
}

export const BackupManager: React.FC<BackupManagerProps> = ({ client, initialServerId }) => {
  const serversQuery = useServers(client)
  const servers = serversQuery.data || []

  const [selectedServerId, setSelectedServerId] = useState<number | null>(
    initialServerId || (servers.length > 0 ? servers[0].id : null)
  )

  const activeServerId = selectedServerId || (servers.length > 0 ? servers[0].id : null)
  const activeServer = servers.find((s) => s.id === activeServerId)

  // Queries for current server
  const backupsQuery = useServerBackups(client, activeServerId)
  const snapshotsQuery = useServerSnapshots(client, activeServerId)
  const actionsQuery = useServerActions(client, activeServerId)

  // Mutations
  const takeBackupMutation = useTakeBackupMutation(client, activeServerId)
  const restoreBackupMutation = useRestoreBackupMutation(client, activeServerId)
  const toggleAutomatedBackups = useToggleAutomatedBackupsMutation(client, activeServerId)
  const attachBackupMutation = useAttachBackupMutation(client, activeServerId)
  const detachBackupMutation = useDetachBackupMutation(client, activeServerId)
  const downloadMutation = useImageDownloadMutation(client)

  // Form & Action states
  const [isTakingSnapshot, setIsTakingSnapshot] = useState(false)
  const [snapshotLabel, setSnapshotLabel] = useState('')
  const [selectedSlot, setSelectedSlot] = useState('temporary')
  const [actionProcessingId, setActionProcessingId] = useState<number | null>(null)

  const backups = backupsQuery.data || []
  const snapshots = snapshotsQuery.data || []
  const actions = actionsQuery.data || []

  const activeBackupAction = actions.find(
    (a) =>
      a.status === 'in-progress' &&
      (a.type === 'take_backup' || a.type === 'restore' || a.type?.includes('backup'))
  )

  const allImages = [...snapshots, ...backups]
  const isAutoBackupEnabled = (activeServer as any)?.backup_ids?.length > 0 || (activeServer as any)?.next_backup_window

  // Take manual snapshot
  const handleTakeSnapshot = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!activeServerId) return

    let replacementStrategy: 'oldest' | 'specified' = 'oldest'
    let backupType: 'daily' | 'weekly' | 'monthly' | 'temporary' | undefined = 'temporary'
    let backupIdToReplace: number | undefined

    if (selectedSlot.startsWith('replace:')) {
      replacementStrategy = 'specified'
      backupType = undefined
      backupIdToReplace = Number(selectedSlot.split(':')[1])
    } else {
      backupType = (selectedSlot as any) || 'temporary'
      replacementStrategy = 'oldest'
    }

    try {
      await takeBackupMutation.mutateAsync({
        label: snapshotLabel.trim() || undefined,
        backupType,
        replacementStrategy,
        backupIdToReplace
      })
      window.bldeskApi?.sendNotification?.({
        title: 'Snapshot Initiated',
        body: `Snapshot creation started for server #${activeServerId}.`
      })
      setIsTakingSnapshot(false)
      setSnapshotLabel('')
      setSelectedSlot('temporary')
    } catch (err: any) {
      alert(`Snapshot failed: ${err.message}`)
    }
  }

  // Restore snapshot
  const handleRestore = async (imageId: number, name: string) => {
    if (!activeServerId) return
    if (!confirm(`RESTORE server #${activeServerId} to image "${name}" (#${imageId})? Current disk data will be overwritten.`)) return

    setActionProcessingId(imageId)
    try {
      await restoreBackupMutation.mutateAsync(imageId)
      window.bldeskApi?.sendNotification?.({
        title: 'Restore Initiated',
        body: `Server #${activeServerId} is restoring from image #${imageId}.`
      })
    } catch (err: any) {
      alert(`Restore failed: ${err.message}`)
    } finally {
      setActionProcessingId(null)
    }
  }

  // Attach disk image as secondary read-only drive
  const handleAttach = async (imageId: number, name: string) => {
    if (!activeServerId) return
    setActionProcessingId(imageId)
    try {
      await attachBackupMutation.mutateAsync(imageId)
      window.bldeskApi?.sendNotification?.({
        title: 'Backup Attached',
        body: `Image "${name}" mounted as secondary drive.`
      })
    } catch (err: any) {
      alert(`Attach failed: ${err.message}`)
    } finally {
      setActionProcessingId(null)
    }
  }

  // Download snapshot / backup disk image
  const handleDownload = async (imageId: number, name: string) => {
    if (!activeServerId) return
    setActionProcessingId(imageId)
    try {
      const link = await downloadMutation.mutateAsync(imageId)
      const downloadUrl = link?.disks?.[0]?.compressed_url || link?.disks?.[0]?.raw_url
      if (!downloadUrl) {
        throw new Error('No download URL returned for this image.')
      }
      window.open(downloadUrl, '_blank')
    } catch (err: any) {
      alert(`Download failed for "${name}": ${err.message}`)
    } finally {
      setActionProcessingId(null)
    }
  }

  // Detach secondary drive
  const handleDetach = async () => {
    if (!activeServerId) return
    try {
      await detachBackupMutation.mutateAsync()
      window.bldeskApi?.sendNotification?.({
        title: 'Drive Detached',
        body: `Secondary backup drive unmounted successfully.`
      })
    } catch (err: any) {
      alert(`Detach failed: ${err.message}`)
    }
  }

  // Toggle Automated Backups
  const handleToggleAuto = async () => {
    if (!activeServerId) return
    const enable = !isAutoBackupEnabled
    if (!confirm(`${enable ? 'Enable' : 'Disable'} automated nightly backups for ${activeServer?.name}?`)) return

    try {
      await toggleAutomatedBackups.mutateAsync(enable)
      window.bldeskApi?.sendNotification?.({
        title: 'Backup Schedule Updated',
        body: `Automated backups ${enable ? 'enabled' : 'disabled'} for server #${activeServerId}.`
      })
    } catch (err: any) {
      alert(`Schedule update failed: ${err.message}`)
    }
  }

  return (
    <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa]">
      {/* Header & Target Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[#212529] dark:text-white flex items-center gap-2.5">
            <Archive className="w-5 h-5 text-[#017cb6]" />
            <span>Server Backups & Disk Snapshots</span>
          </h1>
          <p className="text-xs text-[#6c757d] dark:text-slate-400 mt-0.5">
            Create on-demand point-in-time snapshots or mount backup images as live secondary drives for file recovery.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white dark:bg-[#2b3035] px-3 py-1.5 border border-[#ced4da] dark:border-[#373b3e] rounded shadow-sm">
            <Server className="w-3.5 h-3.5 text-[#017cb6]" />
            <select
              value={activeServerId || ''}
              onChange={(e) => setSelectedServerId(Number(e.target.value))}
              className="bg-transparent text-xs text-[#212529] dark:text-white focus:outline-none cursor-pointer max-w-[160px]"
            >
              {servers.map((s) => (
                <option key={s.id} value={s.id} className="bg-white dark:bg-[#2b3035]">
                  {s.name} (#{s.id})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => setIsTakingSnapshot(true)}
            disabled={!activeServerId || takeBackupMutation.isPending}
            className="flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#017cb6] hover:bg-[#016594] rounded transition shadow-sm disabled:opacity-50"
          >
            {takeBackupMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>Take Snapshot</span>
          </button>
        </div>
      </div>

      {/* Automated Backup Schedule Banner */}
      {activeServer && (
        <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg p-4 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded bg-[#017cb6]/10 flex items-center justify-center">
              <Clock className="w-5 h-5 text-[#017cb6]" />
            </div>
            <div>
              <div className="text-xs font-bold text-[#212529] dark:text-white flex items-center gap-2">
                <span>Automated Nightly Backups</span>
                <span
                  className={`px-2 py-0.5 text-[10px] font-semibold rounded-full ${
                    isAutoBackupEnabled
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/30'
                      : 'bg-amber-500/10 text-amber-700 dark:text-amber-400 border border-amber-500/30'
                  }`}
                >
                  {isAutoBackupEnabled ? 'Enabled' : 'Disabled'}
                </span>
              </div>
              <p className="text-[11px] text-[#6c757d] dark:text-slate-400 mt-0.5">
                {isAutoBackupEnabled
                  ? 'BinaryLane captures an automated delta snapshot nightly during your scheduled maintenance window.'
                  : 'Automated backups are currently turned off for this server.'}
              </p>
            </div>
          </div>

          <button
            onClick={handleToggleAuto}
            disabled={toggleAutomatedBackups.isPending}
            className={`px-3 py-1.5 text-xs font-medium rounded transition border ${
              isAutoBackupEnabled
                ? 'text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'
                : 'text-[#017cb6] bg-[#017cb6]/10 border-[#017cb6]/30 hover:bg-[#017cb6]/20'
            }`}
          >
            {isAutoBackupEnabled ? 'Disable Schedule' : 'Enable Nightly Backups'}
          </button>
        </div>
      )}

      {/* Active In-Progress Action Banner */}
      {activeBackupAction && (
        <div className="bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-lg p-3.5 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <Loader2 className="w-4 h-4 text-[#017cb6] animate-spin flex-shrink-0" />
            <div>
              <h4 className="text-xs font-bold text-[#212529] dark:text-white">
                {activeBackupAction.type === 'take_backup'
                  ? 'Disk Snapshot in Progress...'
                  : activeBackupAction.type === 'restore'
                  ? 'Restoring Disk Image...'
                  : 'Backup Task in Progress...'}
              </h4>
              <p className="text-[11px] text-[#6c757d] dark:text-slate-400">
                The hypervisor is actively creating your snapshot. It will appear in the table below automatically once ready.
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 text-[10px] font-bold rounded-full bg-blue-100 dark:bg-blue-900/60 text-[#017cb6] dark:text-blue-300 animate-pulse flex-shrink-0">
            Capturing Image
          </span>
        </div>
      )}

      {/* Snapshots & Backups List */}
      <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg shadow-sm overflow-hidden flex flex-col flex-shrink-0">
        <div className="p-3.5 bg-[#f1f1f1] dark:bg-[#262a2e] border-b border-[#ced4da] dark:border-[#373b3e] flex items-center justify-between">
          <h3 className="font-bold text-xs text-[#495057] dark:text-[#ced4da] flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-[#017cb6]" />
            <span>Available Disk Images for {activeServer?.name || `Server #${activeServerId}`}</span>
          </h3>
          <button
            onClick={handleDetach}
            disabled={detachBackupMutation.isPending}
            className="text-[11px] text-[#6c757d] hover:text-amber-500 hover:underline"
            title="Unmount secondary drive"
          >
            Detach Secondary Backup Disk
          </button>
        </div>

        {(backupsQuery.isLoading || snapshotsQuery.isLoading) && (
          <div className="p-12 text-center text-xs text-[#6c757d]">
            <Loader2 className="w-6 h-6 animate-spin text-[#017cb6] mx-auto mb-2" />
            <span>Querying disk snapshots from storage array...</span>
          </div>
        )}

        {!backupsQuery.isLoading && !snapshotsQuery.isLoading && allImages.length === 0 && (
          <div className="p-12 text-center text-xs text-[#6c757d] space-y-2">
            <Disc className="w-8 h-8 text-[#6c757d]/50 mx-auto" />
            <div className="font-semibold text-[#212529] dark:text-white">No Snapshots Found</div>
            <p className="text-[#6c757d] max-w-sm mx-auto text-[11px]">
              Take an instant snapshot before making configuration updates to ensure full rollback capabilities.
            </p>
            <button
              onClick={() => setIsTakingSnapshot(true)}
              className="mt-2 px-3.5 py-1.5 bg-[#017cb6] hover:bg-[#016594] text-white text-xs font-medium rounded transition shadow-sm"
            >
              Take First Snapshot
            </button>
          </div>
        )}

        {!backupsQuery.isLoading && !snapshotsQuery.isLoading && allImages.length > 0 && (
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-[#f8f9fa] dark:bg-[#212529] border-b border-[#ced4da] dark:border-[#373b3e] text-[#6c757d]">
                <th className="py-2.5 px-4">Name / Label</th>
                <th className="py-2.5 px-4">Created Date</th>
                <th className="py-2.5 px-4">Min Disk Size</th>
                <th className="py-2.5 px-4">Type</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#ced4da]/60 dark:divide-[#373b3e]">
              {allImages.map((img) => {
                const isProcessing = actionProcessingId === img.id
                return (
                  <tr key={img.id} className="hover:bg-[#f8f9fa] dark:hover:bg-[#32383e] transition">
                    <td className="py-3 px-4">
                      <div className="font-bold text-[#017cb6]">{img.name || `Snapshot #${img.id}`}</div>
                      <div className="text-[11px] text-[#6c757d] dark:text-slate-400 font-mono">#{img.id}</div>
                    </td>
                    <td className="py-3 px-4 text-[#6c757d] dark:text-slate-300">
                      {img.created_at ? new Date(img.created_at).toLocaleString() : '—'}
                    </td>
                    <td className="py-3 px-4 font-mono font-medium text-[#212529] dark:text-white">
                      {img.min_disk_size || activeServer?.disk || 20} GB
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#017cb6]/10 text-[#017cb6] uppercase">
                        {img.type || 'snapshot'}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleDownload(img.id, img.name)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 text-[11px] font-medium text-[#212529] dark:text-slate-200 bg-[#f1f1f1] dark:bg-[#343a40] hover:bg-[#e9ecef] rounded transition flex items-center gap-1"
                          title="Download compressed disk image"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                        <button
                          onClick={() => handleAttach(img.id, img.name)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 text-[11px] font-medium text-[#212529] dark:text-slate-200 bg-[#f1f1f1] dark:bg-[#343a40] hover:bg-[#e9ecef] rounded transition flex items-center gap-1"
                          title="Mount as secondary drive to extract files"
                        >
                          {isProcessing ? <Loader2 className="w-3 h-3 animate-spin" /> : <HardDrive className="w-3 h-3" />}
                          <span>Mount</span>
                        </button>
                        <button
                          onClick={() => handleRestore(img.id, img.name)}
                          disabled={isProcessing}
                          className="px-2.5 py-1 text-[11px] font-medium text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 rounded transition border border-rose-200 dark:border-rose-800 flex items-center gap-1"
                          title="Restore server back to this point in time"
                        >
                          <RotateCcw className="w-3 h-3" />
                          <span>Restore</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>

      {/* Take Snapshot Modal */}
      {isTakingSnapshot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <div className="bg-white dark:bg-[#2b3035] border border-[#ced4da] dark:border-[#373b3e] rounded-lg w-full max-w-md p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[#ced4da] dark:border-[#373b3e] pb-3">
              <h2 className="text-base font-bold text-[#212529] dark:text-white">Create Disk Snapshot</h2>
              <button onClick={() => setIsTakingSnapshot(false)} className="text-[#6c757d] hover:text-[#212529] dark:hover:text-white">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTakeSnapshot} className="space-y-4 text-xs">
              <p className="text-[#6c757d] dark:text-slate-400">
                Captures a full point-in-time image of the active disk drive for {activeServer?.name}.
              </p>

              <div>
                <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-1">
                  Backup Slot / Retention
                </label>
                <select
                  value={selectedSlot}
                  onChange={(e) => setSelectedSlot(e.target.value)}
                  className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white px-3 py-2 rounded focus:outline-none focus:border-[#017cb6]"
                >
                  <option value="temporary">Temporary Snapshot (Retained for up to 7 days)</option>
                  {(activeServer?.selected_size_options?.daily_backups ?? 0) > 0 && (
                    <option value="daily">Daily Backup Slot</option>
                  )}
                  {(activeServer?.selected_size_options?.weekly_backups ?? 0) > 0 && (
                    <option value="weekly">Weekly Backup Slot</option>
                  )}
                  {(activeServer?.selected_size_options?.monthly_backups ?? 0) > 0 && (
                    <option value="monthly">Monthly Backup Slot</option>
                  )}
                  {allImages.length > 0 && (
                    <optgroup label="Replace Existing Image">
                      {allImages.map((img) => (
                        <option key={img.id} value={`replace:${img.id}`}>
                          Replace: {img.name} (#{img.id})
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              </div>

              <div>
                <label className="block font-medium text-[#495057] dark:text-[#ced4da] mb-1">
                  Snapshot Name / Description (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Pre-upgrade Docker backup"
                  value={snapshotLabel}
                  onChange={(e) => setSnapshotLabel(e.target.value)}
                  className="w-full bg-[#f8f9fa] dark:bg-[#212529] border border-[#ced4da] dark:border-[#373b3e] text-xs text-[#212529] dark:text-white px-3 py-2 rounded focus:outline-none focus:border-[#017cb6]"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-[#ced4da] dark:border-[#373b3e]">
                <button
                  type="button"
                  onClick={() => setIsTakingSnapshot(false)}
                  className="px-3 py-1.5 text-xs text-[#6c757d] hover:text-[#212529] dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={takeBackupMutation.isPending}
                  className="px-4 py-1.5 bg-[#017cb6] hover:bg-[#016594] text-white font-medium rounded transition flex items-center gap-1.5 shadow-sm"
                >
                  {takeBackupMutation.isPending && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Start Snapshot</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
