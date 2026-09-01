import { Preferences } from '@capacitor/preferences'
import { AccountProfile, IpcApi } from '@shared/ipc-types'
import { formatSshCommand, sshUriHost, validateSshTarget } from '@shared/ssh'

const PROFILES_KEY = 'bldesk_profiles_v1'
const ACTIVE_PROFILE_KEY = 'bldesk_active_profile_id_v1'

export async function initMobileBridge(): Promise<void> {
  if (typeof window === 'undefined') return

  // If running inside Electron, native bldeskApi is already exposed via preload
  if (window.bldeskApi) {
    return
  }

  console.log('[MobileBridge] Initializing Capacitor/Web bridge for mobile Android...')

  const getStoredProfiles = async (): Promise<AccountProfile[]> => {
    try {
      const { value } = await Preferences.get({ key: PROFILES_KEY })
      if (value) {
        return JSON.parse(value)
      }
    } catch {
      const local = localStorage.getItem(PROFILES_KEY)
      if (local) return JSON.parse(local)
    }
    return []
  }

  const saveStoredProfiles = async (profiles: AccountProfile[]): Promise<void> => {
    try {
      await Preferences.set({ key: PROFILES_KEY, value: JSON.stringify(profiles) })
    } catch {
      localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles))
    }
  }

  const mobileApi: IpcApi = {
    getProfiles: async (): Promise<Omit<AccountProfile, 'token'>[]> => {
      const list = await getStoredProfiles()
      return list.map(({ token: _, ...rest }) => rest)
    },
    getActiveProfile: async (): Promise<AccountProfile | null> => {
      const profiles = await getStoredProfiles()
      if (profiles.length === 0) return null

      let activeId: string | null = null
      try {
        const { value } = await Preferences.get({ key: ACTIVE_PROFILE_KEY })
        activeId = value
      } catch {
        activeId = localStorage.getItem(ACTIVE_PROFILE_KEY)
      }

      if (activeId) {
        const found = profiles.find((p) => p.id === activeId)
        if (found) return found
      }
      return profiles[0]
    },
    saveProfile: async (input: { name: string; token: string; isDefault?: boolean }): Promise<{ success: boolean; profileId: string; error?: string }> => {
      try {
        const profiles = await getStoredProfiles()
        const newProfile: AccountProfile = {
          id: `profile_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: input.name,
          token: input.token,
          isDefault: input.isDefault,
          createdAt: new Date().toISOString()
        }

        const updated = [...profiles, newProfile]
        await saveStoredProfiles(updated)

        if (input.isDefault || profiles.length === 0) {
          await mobileApi.setActiveProfile(newProfile.id)
        }

        return { success: true, profileId: newProfile.id }
      } catch (err: any) {
        return { success: false, profileId: '', error: err.message }
      }
    },
    deleteProfile: async (profileId: string): Promise<{ success: boolean }> => {
      const profiles = await getStoredProfiles()
      const updated = profiles.filter((p) => p.id !== profileId)
      await saveStoredProfiles(updated)
      return { success: true }
    },
    setActiveProfile: async (profileId: string): Promise<{ success: boolean }> => {
      try {
        await Preferences.set({ key: ACTIVE_PROFILE_KEY, value: profileId })
      } catch {
        localStorage.setItem(ACTIVE_PROFILE_KEY, profileId)
      }
      return { success: true }
    },
    launchNativeTerminal: async (opts) => {
      const invalid = validateSshTarget(opts)
      if (invalid) return { success: false, error: invalid }
      // sshUriHost brackets IPv6 and percent-encodes a zone delimiter, as an ssh:// URI needs.
      const host = sshUriHost(opts.host) ?? opts.host.trim()
      const uri = `ssh://${opts.username || 'root'}@${host}${opts.port ? `:${opts.port}` : ''}`
      window.open(uri, '_system')
      return { success: true, terminal: 'ssh:// handler', command: formatSshCommand(opts, 'posix') }
    },
    openRescueConsole: async (opts) => {
      window.open(opts.url, '_blank')
      return { success: true }
    },
    getLocalSshKeys: async () => {
      return []
    },
    sendNotification: async (opts) => {
      console.log(`[Notification] ${opts.title}: ${opts.body}`)
      if ('Notification' in window && Notification.permission === 'granted') {
        new Notification(opts.title, { body: opts.body })
      }
    },
    minimizeWindow: async () => {},
    maximizeWindow: async () => {},
    closeWindow: async () => {},
    isMaximized: async () => false,
    openExternal: async (url: string) => {
      window.open(url, '_blank')
    }
  }

  ;(window as any).bldeskApi = mobileApi
}
