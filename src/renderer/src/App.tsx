import React, { useState, useEffect } from 'react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { TitleBar } from './components/layout/TitleBar'
import { Sidebar, ActiveTab, ServerSubTab } from './components/layout/Sidebar'
import { BottomNav } from './components/layout/BottomNav'
import { ServerList } from './components/servers/ServerList'
import { ServerDetails } from './components/servers/ServerDetails'
import { AuthModal } from './components/auth/AuthModal'
import { CommandPalette } from './components/palette/CommandPalette'
import { EmbeddedTerminal } from './components/terminal/EmbeddedTerminal'
import { VpcManager } from './components/vpcs/VpcManager'
import { DnsManager } from './components/dns/DnsManager'
import { SshKeysManager } from './components/keys/SshKeysManager'
import { FirewallManager } from './components/firewall/FirewallManager'
import { LoadBalancerManager } from './components/loadbalancers/LoadBalancerManager'
import { BackupManager } from './components/backups/BackupManager'
import { BillingOverview } from './components/billing/BillingOverview'
import { AccountOverview } from './components/account/AccountOverview'
import { ActionInteractionPrompt } from './components/actions/ActionInteractionPrompt'
import { ActionToasts } from './components/actions/ActionToasts'
import { ActionTrackerProvider } from './context/ActionTrackerContext'
import { useServers } from './api/queries'
import { createBinaryLaneClient } from './api/client'
import { AccountProfile } from '@shared/ipc-types'
import { ThemeProvider } from './context/ThemeContext'
import { useDeepLinkRouter } from './lib/deeplinks'
import { AlertCircle, KeyRound, X, Server, Loader2 } from 'lucide-react'

// Strict QueryClient settings: Never retry failed mutations (create/update/delete/actions) to prevent spamming!
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 20, // 20s freshness
      refetchOnWindowFocus: false,
      retry: (failureCount, error: any) => {
        // Never retry 401/403 auth errors or 404 missing resource errors
        if (error?.status === 401 || error?.status === 403 || error?.status === 404) return false
        return failureCount < 2
      }
    },
    mutations: {
      retry: 0 // ZERO automatic retries on ANY create/update/delete/action mutation!
    }
  }
})

function MainDashboard() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('servers')
  const [selectedServer, setSelectedServer] = useState<any | null>(null)
  const [activeServerSubTab, setActiveServerSubTab] = useState<ServerSubTab>('overview')
  const [isAuthOpen, setIsAuthOpen] = useState(false)
  const [isPaletteOpen, setIsPaletteOpen] = useState(false)
  const [isMobileDrawerOpen, setIsMobileDrawerOpen] = useState(false)
  const [profiles, setProfiles] = useState<Omit<AccountProfile, 'token'>[]>([])
  const [activeProfile, setActiveProfile] = useState<AccountProfile | null>(null)
  const [terminalHost, setTerminalHost] = useState<string | undefined>(undefined)
  const [authErrorBanner, setAuthErrorBanner] = useState<string | null>(null)
  const [isInitializing, setIsInitializing] = useState(true)

  const refreshProfiles = async () => {
    if (!window.bldeskApi) {
      // If outside Electron (mobile/web), dynamically load and initialize mobile bridge
      try {
        const { initMobileBridge } = await import('./api/mobile-bridge')
        await initMobileBridge()
      } catch (e) {
        console.warn('[App] Mobile bridge init warning:', e)
      }
    }

    if (!window.bldeskApi) {
      setIsInitializing(false)
      return
    }
    try {
      const pList = await window.bldeskApi.getProfiles()
      const active = await window.bldeskApi.getActiveProfile()
      setProfiles(pList)
      setActiveProfile(active)

      if (pList.length === 0) {
        setIsAuthOpen(true)
      }
    } catch (err) {
      console.error('[MainDashboard] Error loading profiles:', err)
    } finally {
      setIsInitializing(false)
    }
  }

  useEffect(() => {
    refreshProfiles()

    // Listen for global auth errors dispatched by API client
    const handleAuthError = () => {
      setAuthErrorBanner('API token authorization failed. Please verify or update your token in settings.')
    }
    window.addEventListener('bldesk:auth_error', handleAuthError)
    return () => window.removeEventListener('bldesk:auth_error', handleAuthError)
  }, [])

  // Create API Client with Active Profile Token
  const client = React.useMemo(() => {
    return activeProfile?.token ? createBinaryLaneClient(activeProfile.token) : null
  }, [activeProfile?.token])

  // Queries with local cache rehydration
  const { data: servers = [], isLoading: isLoadingServers } = useServers(client, activeProfile?.id)

  const handleSwitchProfile = async (profileId: string) => {
    if (!window.bldeskApi) return
    setAuthErrorBanner(null)
    await window.bldeskApi.setActiveProfile(profileId)
    await refreshProfiles()
    queryClient.invalidateQueries()
  }

  const handleOpenTerminalForIp = (ip: string) => {
    setTerminalHost(ip)
    setActiveTab('terminal')
  }

  const handleSelectTab = (tab: ActiveTab) => {
    setSelectedServer(null)
    setActiveTab(tab)
  }

  const handleSelectServer = (server: any) => {
    setSelectedServer(server)
    setActiveServerSubTab('overview')
  }

  // bldesk:// deep links (cold start + while running)
  useDeepLinkRouter({
    profiles,
    activeProfile,
    client,
    servers,
    isLoadingServers,
    onSwitchProfile: handleSwitchProfile,
    onSelectServer: handleSelectServer,
    onSelectServerSubTab: setActiveServerSubTab,
    onSelectTab: setActiveTab
  })

  if (isInitializing) {
    return (
      <div className="h-screen w-screen flex flex-col items-center justify-center bg-[#212529] text-[#f8f9fa] space-y-4 select-none">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-[#017cb6]/20 flex items-center justify-center">
            <Server className="w-6 h-6 text-[#017cb6]" />
          </div>
          <div className="text-2xl font-bold tracking-tight">
            <span className="text-[#017cb6]">binary</span>
            <span className="text-[#f1ca00]">lane</span>
            <span className="text-xs font-normal text-[#6c757d] ml-2">BLDesk</span>
          </div>
        </div>
        <div className="flex items-center gap-2.5 text-xs text-[#adb5bd]">
          <Loader2 className="w-4 h-4 text-[#017cb6] animate-spin" />
          <span>Connecting to BinaryLane Cloud...</span>
        </div>
      </div>
    )
  }

  return (
    <ActionTrackerProvider client={client}>
      <div className="h-screen w-screen flex flex-col bg-[#f8f9fa] dark:bg-[#212529] text-[#212529] dark:text-[#f8f9fa] overflow-hidden font-sans select-none">
        {/* Frameless Custom Titlebar */}
        <TitleBar
          activeProfile={activeProfile}
          profiles={profiles}
          onSwitchProfile={handleSwitchProfile}
          onOpenAuth={() => setIsAuthOpen(true)}
          onOpenCommandPalette={() => setIsPaletteOpen(true)}
          onToggleMobileDrawer={() => setIsMobileDrawerOpen((prev) => !prev)}
        />

        {/* Auth Error Banner if Token Fails / Returns 401 */}
        {authErrorBanner && (
          <div className="bg-amber-500 text-slate-900 px-4 py-2 text-xs font-medium flex items-center justify-between shadow-md z-30 animate-in slide-in-from-top duration-150">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{authErrorBanner}</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setIsAuthOpen(true)}
                className="bg-slate-900 text-white hover:bg-slate-800 px-2.5 py-1 rounded text-[11px] font-semibold flex items-center gap-1"
              >
                <KeyRound className="w-3 h-3" />
                <span>Update API Token</span>
              </button>
              <button onClick={() => setAuthErrorBanner(null)} className="p-0.5 hover:bg-black/10 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Main Workspace Layout */}
        <div className="flex-1 flex overflow-hidden relative">
          {/* Navigation Sidebar (Global + SubNav + Mobile Drawer) */}
          <Sidebar
            activeTab={activeTab}
            onSelectTab={handleSelectTab}
            serverCount={servers.length}
            selectedServer={selectedServer}
            activeServerSubTab={activeServerSubTab}
            onSelectServerSubTab={setActiveServerSubTab}
            onBackToServers={() => setSelectedServer(null)}
            isMobileDrawerOpen={isMobileDrawerOpen}
            onCloseMobileDrawer={() => setIsMobileDrawerOpen(false)}
          />

          {/* Dynamic Center Viewport */}
          <main className="flex-1 overflow-hidden bg-[#f8f9fa] dark:bg-[#212529] relative pb-14 md:pb-0 select-text">
            {activeTab === 'servers' && (
              selectedServer ? (
                <ServerDetails
                  server={selectedServer}
                  client={client}
                  activeSubTab={activeServerSubTab}
                  onBack={() => setSelectedServer(null)}
                  onOpenTerminal={handleOpenTerminalForIp}
                />
              ) : (
                <ServerList
                  servers={servers}
                  isLoading={isLoadingServers && servers.length === 0}
                  client={client}
                  onSelectServer={handleSelectServer}
                  onOpenTerminal={handleOpenTerminalForIp}
                />
              )
            )}

            {activeTab === 'terminal' && (
              <EmbeddedTerminal
                initialHost={terminalHost}
                onClose={() => setActiveTab('servers')}
              />
            )}

            {activeTab === 'vpcs' && (
              <VpcManager
                client={client}
                onSelectServer={(s) => {
                  handleSelectServer(s)
                  setActiveTab('servers')
                }}
              />
            )}

            {activeTab === 'firewall' && (
              <FirewallManager client={client} />
            )}

            {activeTab === 'loadbalancers' && (
              <LoadBalancerManager
                client={client}
                onSelectServer={(s) => {
                  handleSelectServer(s)
                  setActiveTab('servers')
                }}
              />
            )}

            {activeTab === 'dns' && (
              <DnsManager client={client} />
            )}

            {activeTab === 'backups' && (
              <BackupManager client={client} />
            )}

            {activeTab === 'keys' && (
              <SshKeysManager client={client} />
            )}

            {activeTab === 'billing' && (
              <BillingOverview client={client} />
            )}

            {activeTab === 'account' && (
              <AccountOverview client={client} />
            )}
          </main>
        </div>

        {/* Mobile Bottom Bar */}
        <BottomNav activeTab={activeTab} onSelectTab={handleSelectTab} onOpenDrawer={() => setIsMobileDrawerOpen(true)} />

        {/* Encrypted Vault Modal */}
        <AuthModal
          isOpen={isAuthOpen}
          onClose={() => setIsAuthOpen(false)}
          profiles={profiles}
          activeProfile={activeProfile}
          onProfileAddedOrUpdated={refreshProfiles}
        />

        {/* Command Palette (Ctrl+K / Cmd+K) */}
        <CommandPalette
          isOpen={isPaletteOpen}
          onClose={() => setIsPaletteOpen(false)}
          servers={servers}
          onSelectServer={handleSelectServer}
          onNavigateTab={setActiveTab}
        />

        {/* Actions BinaryLane has paused pending an answer. Mounted at the shell so
            the question still reaches the user after they navigate away from the
            view that started it. */}
        <ActionInteractionPrompt client={client} profileId={activeProfile?.id} servers={servers} />

        {/* Outcomes of actions still running in the background, for the same reason. */}
        <ActionToasts />
      </div>
    </ActionTrackerProvider>
  )
}

interface ErrorBoundaryProps {
  children: React.ReactNode
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

class AppErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[AppErrorBoundary] Caught error:', error, errorInfo)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="h-screen w-screen bg-[#212529] text-[#f8f9fa] flex flex-col items-center justify-center p-8 gap-4 select-text">
          <div className="flex items-center gap-3 text-red-400">
            <AlertCircle className="w-8 h-8" />
            <h1 className="text-xl font-bold">Something went wrong</h1>
          </div>
          <p className="text-sm text-[#adb5bd] max-w-md text-center">
            {this.state.error?.message || 'An unexpected rendering error occurred.'}
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => {
                localStorage.clear()
                window.location.reload()
              }}
              className="px-4 py-2 bg-[#017cb6] hover:bg-[#02699a] text-white rounded text-sm font-medium transition-colors"
            >
              Reset Cache & Reload
            </button>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 bg-[#343a40] hover:bg-[#495057] text-[#f8f9fa] rounded text-sm font-medium transition-colors"
            >
              Reload
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function App() {
  return (
    <AppErrorBoundary>
      <ThemeProvider>
        <QueryClientProvider client={queryClient}>
          <MainDashboard />
        </QueryClientProvider>
      </ThemeProvider>
    </AppErrorBoundary>
  )
}
export default App
