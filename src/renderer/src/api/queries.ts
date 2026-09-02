import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { BinaryLaneClient } from './client'
import { components } from '@shared/api/schema'

type ServerResponse = components['schemas']['Server']

// --- SERVERS & COMPUTE ---

export function useServers(client: BinaryLaneClient | null, profileId?: string) {
  return useQuery<ServerResponse[]>({
    queryKey: ['servers', profileId || 'default'],
    queryFn: async () => {
      if (!client) return []
      let allServers: any[] = []
      let page = 1
      let hasMore = true

      while (hasMore && page <= 10) {
        const { data, error } = await client.GET('/v2/servers', {
          params: { query: { per_page: 200, page } }
        })
        if (error) {
          console.warn('[useServers] Query error:', error)
          break
        }
        const pageServers = data?.servers || []
        allServers = [...allServers, ...pageServers]
        if (!data?.links?.pages?.next || pageServers.length === 0) {
          hasMore = false
        } else {
          page++
        }
      }

      // Persist to local cache for instant cold-start loading
      try {
        if (profileId && allServers.length > 0) {
          localStorage.setItem(`bldesk_cached_servers_${profileId}`, JSON.stringify(allServers))
        }
      } catch {
        // ignore quota
      }

      return allServers
    },
    initialData: () => {
      if (!profileId) return undefined
      try {
        const raw = localStorage.getItem(`bldesk_cached_servers_${profileId}`)
        return raw ? JSON.parse(raw) : undefined
      } catch {
        return undefined
      }
    },
    enabled: !!client,
    refetchInterval: 15000,
    staleTime: 10000
  })
}

export function useServer(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['server', serverId],
    queryFn: async () => {
      if (!client || !serverId) return null
      const { data, error } = await client.GET('/v2/servers/{server_id}', {
        params: { path: { server_id: serverId } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.server || null
    },
    enabled: !!client && !!serverId,
    refetchInterval: 10000
  })
}

export function useServerMetrics(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverMetrics', serverId],
    queryFn: async () => {
      if (!client || !serverId) return null
      const { data, error } = await client.GET('/v2/samplesets/{server_id}/latest', {
        params: { path: { server_id: serverId } }
      })
      if (error) return null
      return data?.sample_set || null
    },
    enabled: !!client && !!serverId,
    refetchInterval: 5000 // live gauges poll every 5s
  })
}

export function useServerConsole(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverConsole', serverId],
    queryFn: async () => {
      if (!client || !serverId) return null
      const { data, error } = await client.GET('/v2/servers/{server_id}/console', {
        params: { path: { server_id: serverId } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.console || null
    },
    enabled: !!client && !!serverId,
    staleTime: 60000 // console URLs expire after temporary token
  })
}

// --- SERVER ACTIONS MUTATION ---

export function useServerActionMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ serverId, actionPayload }: { serverId: number; actionPayload: any }) => {
      if (!client) throw new Error('No client available')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: actionPayload
      })
      // describeApiError rather than JSON.stringify: the raw body was being shown
      // to users verbatim in an alert().
      if (error) throw new Error(describeApiError(error))
      return data?.action
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', variables.serverId] })
    }
  })
}

// --- ACCOUNT & BILLING ---

export function useAccount(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['account'],
    queryFn: async () => {
      if (!client) return null
      const { data, error } = await client.GET('/v2/account')
      if (error) throw new Error(JSON.stringify(error))
      return data?.account || null
    },
    enabled: !!client
  })
}

export function useBalance(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['balance'],
    queryFn: async () => {
      if (!client) return null
      const { data, error } = await client.GET('/v2/customers/my/balance')
      if (error) throw new Error(JSON.stringify(error))
      return data?.balance || null
    },
    enabled: !!client,
    refetchInterval: 60000
  })
}

/**
 * Invoices whose payment attempt failed and remain unpaid. Surfaced separately so
 * the billing view can warn about them without the user opening every invoice.
 */
export function useUnpaidInvoices(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['unpaid-invoices'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/customers/my/unpaid-payment-failed-invoices')
      if (error) throw new Error(JSON.stringify(error))
      return data?.invoices || []
    },
    enabled: !!client
  })
}

/**
 * Invoices are paginated server-side: `per_page` defaults to 20 and caps at 200.
 * Calling this without parameters silently returns only the 20 most recent and
 * drops `meta.total`, leaving older invoices unreachable — so page through it
 * explicitly and hand the total back for the pager.
 */
export function useInvoices(client: BinaryLaneClient | null, page = 1, perPage = 20) {
  return useQuery({
    queryKey: ['invoices', page, perPage],
    queryFn: async () => {
      if (!client) return { invoices: [], total: 0 }
      const { data, error } = await client.GET('/v2/customers/my/invoices', {
        params: { query: { page, per_page: perPage } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return { invoices: data?.invoices || [], total: data?.meta?.total ?? 0 }
    },
    enabled: !!client,
    placeholderData: (prev) => prev
  })
}

export function useDataUsage(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['dataUsageCurrent'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/data_usages/current')
      if (error) return []
      return data?.data_usages || []
    },
    enabled: !!client
  })
}

// --- VPCS ---

export function useVpcs(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['vpcs'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/vpcs')
      if (error) throw new Error(JSON.stringify(error))
      return data?.vpcs || []
    },
    enabled: !!client
  })
}

// --- FIREWALL RULES ---

export function useFirewallRules(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['firewallRules', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/advanced_firewall_rules', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return data?.firewall_rules || []
    },
    enabled: !!client && !!serverId
  })
}

export function useUpdateFirewallRulesMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (rules: any[]) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'change_advanced_firewall_rules',
          firewall_rules: rules
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['firewallRules', serverId] })
    }
  })
}

// --- LOAD BALANCERS ---

export function useLoadBalancers(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['loadBalancers'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/load_balancers')
      if (error) throw new Error(JSON.stringify(error))
      const lbs = data?.load_balancers || []

      // Concurrently fetch full details for each load balancer to ensure server_ids and live status are fully loaded
      const detailedLbs = await Promise.all(
        lbs.map(async (lb) => {
          try {
            const { data: detailData } = await client.GET('/v2/load_balancers/{load_balancer_id}', {
              params: { path: { load_balancer_id: lb.id } }
            })
            return detailData?.load_balancer || lb
          } catch {
            return lb
          }
        })
      )
      return detailedLbs
    },
    enabled: !!client
  })
}

export function useAddServerToLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ loadBalancerId, serverId }: { loadBalancerId: number; serverId: number }) => {
      if (!client) throw new Error('No client')
      const { error } = await client.POST('/v2/load_balancers/{load_balancer_id}/servers', {
        params: { path: { load_balancer_id: loadBalancerId } },
        body: { server_ids: [serverId] }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useRemoveServerFromLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ loadBalancerId, serverId }: { loadBalancerId: number; serverId: number }) => {
      if (!client) throw new Error('No client')
      const { error } = await client.DELETE('/v2/load_balancers/{load_balancer_id}/servers', {
        params: { path: { load_balancer_id: loadBalancerId } },
        body: { server_ids: [serverId] }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useCreateLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      if (!client) throw new Error('No client')
      const { data, error } = await client.POST('/v2/load_balancers', { body })
      if (error) throw new Error(JSON.stringify(error))
      return data?.load_balancer
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
    }
  })
}

export function useDeleteLoadBalancerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (loadBalancerId: number) => {
      if (!client) throw new Error('No client')
      const { error } = await client.DELETE('/v2/load_balancers/{load_balancer_id}', {
        params: { path: { load_balancer_id: loadBalancerId } }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['loadBalancers'] })
    }
  })
}

// --- DNS DOMAINS & RECORDS ---

export function useDomains(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['domains'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/domains')
      if (error) throw new Error(JSON.stringify(error))
      return data?.domains || []
    },
    enabled: !!client
  })
}

export function useDomainRecords(client: BinaryLaneClient | null, domainName: string | null) {
  return useQuery({
    queryKey: ['domainRecords', domainName],
    queryFn: async () => {
      if (!client || !domainName) return []
      const { data, error } = await client.GET('/v2/domains/{domain_name}/records', {
        params: { path: { domain_name: domainName } }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.domain_records || []
    },
    enabled: !!client && !!domainName
  })
}

// --- SIZES, REGIONS & IMAGES ---

export function useSizes(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['sizes'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/sizes')
      if (error) return []
      return data?.sizes || []
    },
    enabled: !!client,
    staleTime: 300000
  })
}

export function useRegions(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['regions'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/regions')
      if (error) return []
      return data?.regions || []
    },
    enabled: !!client,
    staleTime: 300000
  })
}

export function useImages(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['images'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/images')
      if (error) return []
      return data?.images || []
    },
    enabled: !!client,
    staleTime: 300000
  })
}

export function useHistoricalMetrics(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['historicalMetrics', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/samplesets/{server_id}', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return (data as any)?.sample_sets || []
    },
    enabled: !!client && !!serverId,
    refetchInterval: 30000
  })
}

/** API maximum for this endpoint. */
const SAMPLE_PAGE_SIZE = 200
/** Ceiling on paging, so an unexpectedly huge window can't fan out endlessly. */
const MAX_SAMPLE_PAGES = 6

export function useSampleSets(
  client: BinaryLaneClient | null,
  serverId: number | undefined,
  interval: 'five-minute' | 'half-hour' | 'four-hour' | 'day' | 'week' | 'month' = 'five-minute',
  start?: string,
  end?: string
) {
  return useQuery({
    queryKey: ['sample-sets', serverId, interval, start, end],
    queryFn: async () => {
      if (!client || !serverId) return []

      // `per_page` caps at 200, but a day at five-minute resolution is ~288
      // samples, so a single request silently returned the oldest 200 and left
      // the most recent several hours missing from the chart. Page through until
      // the window is complete.
      const fetchPage = async (page: number) => {
        const query: Record<string, any> = {
          data_interval: interval,
          per_page: SAMPLE_PAGE_SIZE,
          page
        }
        if (start) query.start = start
        if (end) query.end = end
        return client.GET('/v2/samplesets/{server_id}', {
          params: { path: { server_id: serverId }, query: query as any }
        })
      }

      const first = await fetchPage(1)
      if (first.error) {
        console.warn('[useSampleSets] Error loading sample sets:', first.error)
        return []
      }

      const sets = [...(first.data?.sample_sets || [])]
      const total = first.data?.meta?.total ?? sets.length
      const pages = Math.min(Math.ceil(total / SAMPLE_PAGE_SIZE), MAX_SAMPLE_PAGES)

      if (pages > 1) {
        const rest = await Promise.all(
          Array.from({ length: pages - 1 }, (_, i) => fetchPage(i + 2))
        )
        for (const r of rest) {
          if (r.error) {
            // A partial window still charts; better than dropping everything.
            console.warn('[useSampleSets] Error loading a sample page:', r.error)
            continue
          }
          sets.push(...(r.data?.sample_sets || []))
        }
      }
      return sets
    },
    enabled: !!client && !!serverId,
    refetchInterval: interval === 'five-minute' ? 30000 : 120000
  })
}

export function useCreateServerMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (body: any) => {
      if (!client) throw new Error('No client')
      const { data, error } = await client.POST('/v2/servers', {
        body
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.server
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

// --- SSH KEYS ---

export function useSshKeys(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['sshKeys'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/account/keys')
      if (error) throw new Error(JSON.stringify(error))
      return data?.ssh_keys || []
    },
    enabled: !!client
  })
}

export function useAddSshKeyMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({ name, publicKey }: { name: string; publicKey: string }) => {
      if (!client) throw new Error('No client')
      const { data, error } = await client.POST('/v2/account/keys', {
        body: { name, public_key: publicKey }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.ssh_key
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshKeys'] })
    }
  })
}

export function useDeleteSshKeyMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (keyId: number) => {
      if (!client) throw new Error('No client')
      const { error } = await client.DELETE('/v2/account/keys/{key_id}', {
        params: { path: { key_id: keyId } }
      })
      if (error) throw new Error(JSON.stringify(error))
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sshKeys'] })
    }
  })
}

// --- BACKUPS & SNAPSHOTS ---

export function useServerBackups(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverBackups', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/backups', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return data?.backups || []
    },
    enabled: !!client && !!serverId
  })
}

export function useServerSnapshots(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverSnapshots', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/snapshots', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return data?.snapshots || []
    },
    enabled: !!client && !!serverId
  })
}

export interface TakeBackupParams {
  label?: string
  backupType?: 'daily' | 'weekly' | 'monthly' | 'temporary'
  replacementStrategy?: 'none' | 'specified' | 'oldest' | 'newest'
  backupIdToReplace?: number
}

export function useServerActions(client: BinaryLaneClient | null, serverId: number | null) {
  return useQuery({
    queryKey: ['serverActions', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } }
      })
      if (error) return []
      return data?.actions || []
    },
    enabled: !!client && !!serverId,
    refetchInterval: 3000
  })
}

export function useTakeBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (params: string | TakeBackupParams | undefined) => {
      if (!client || !serverId) throw new Error('No client or serverId')

      const p: TakeBackupParams = typeof params === 'string' ? { label: params } : params || {}
      // Default to 'oldest' replacement strategy so that if all slots of this type are occupied,
      // BinaryLane smoothly replaces/rotates the oldest existing snapshot instead of throwing an error.
      const replacementStrategy = p.replacementStrategy || (p.backupIdToReplace ? 'specified' : 'oldest')
      const backupType = replacementStrategy === 'specified' ? undefined : (p.backupType || 'temporary')

      const body: any = {
        type: 'take_backup',
        replacement_strategy: replacementStrategy,
        label: p.label || undefined
      }

      if (backupType) {
        body.backup_type = backupType
      }
      if (p.backupIdToReplace) {
        body.backup_id_to_replace = p.backupIdToReplace
      }

      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body
      })
      if (error) {
        const errorObj = error as any
        const msg =
          errorObj?.message ||
          errorObj?.title ||
          (errorObj?.errors && Object.values(errorObj.errors).flat().join(', ')) ||
          JSON.stringify(error)
        throw new Error(msg)
      }
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['serverBackups', serverId] })
      queryClient.invalidateQueries({ queryKey: ['serverSnapshots', serverId] })
      queryClient.invalidateQueries({ queryKey: ['serverActions', serverId] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useImageDownloadMutation(client: BinaryLaneClient | null) {
  return useMutation({
    mutationFn: async (imageId: number) => {
      if (!client) throw new Error('No client')
      const { data, error } = await client.GET('/v2/images/{image_id}/download', {
        params: { path: { image_id: imageId } }
      })
      if (error) {
        const errorObj = error as any
        const msg = errorObj?.message || errorObj?.title || JSON.stringify(error)
        throw new Error(msg)
      }
      return data?.link
    }
  })
}

export function useRestoreBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (imageId: number) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'restore',
          image: imageId
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
    }
  })
}

export function useToggleAutomatedBackupsMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (enable: boolean) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: enable ? 'enable_backups' : 'disable_backups'
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
    }
  })
}

export function useAttachBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (imageId: number) => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'attach_backup',
          image: imageId
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
    }
  })
}

export function useDetachBackupMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      if (!client || !serverId) throw new Error('No client or serverId')
      const { data, error } = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: {
          type: 'detach_backup'
        }
      })
      if (error) throw new Error(JSON.stringify(error))
      return data?.action
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['server', serverId] })
    }
  })
}

// --- ASYNC SERVER ACTIONS ---

/**
 * Every server action is asynchronous: the POST returns an `in-progress` action
 * and a 200 means "queued", not "done". There are four ways to submit one, and
 * the difference is what should happen to the UI while it runs:
 *
 * - `useServerActionMutation` — submit and return immediately. For the list and
 *   detail views, whose callers hand the queued action to the action tracker and
 *   let a toast report the outcome.
 * - `useServerActionWithHandoff` — submit, wait briefly, then release the UI and
 *   return the action still running for the caller to track. For the settings
 *   panel, where a quick change should confirm inline but a rebuild must not
 *   hold the panel hostage.
 * - `useNetworkActionMutation` — submit and block until it settles. For network
 *   changes only, where the hazard is a second write landing on top of an
 *   unsettled first one, so keeping the UI locked is the point.
 * - `useServerDiagnosticMutation` — submit and block until it completes, then
 *   return the action for its `result_data`. For `ping` / `uptime` /
 *   `is_running`, whose whole purpose is a value that does not exist until the
 *   action finishes.
 *
 * All four share `pollActionToSettled`, so the per-request cap, the tolerance
 * for one slow poll, and the checks for an action stalled on an operator answer
 * or an unpaid invoice cannot drift apart between them.
 */

type ServerAction = components['schemas']['Action']

/** Turn an openapi-fetch error body into something a human can read. */
export function describeApiError(error: unknown): string {
  if (!error) return 'Unknown error'
  if (typeof error === 'string') return error
  const e = error as { message?: string; detail?: string; title?: string; errors?: Record<string, string[]> }
  if (e.message) return e.message
  if (e.detail) return e.detail
  if (e.errors) {
    return Object.entries(e.errors)
      .map(([field, msgs]) => `${field}: ${msgs.join(', ')}`)
      .join('; ')
  }
  return e.title || JSON.stringify(error)
}

/**
 * The detail of a failed action, or null when BinaryLane gave none.
 *
 * Deliberately does NOT fall back to `reason`. The spec defines that field as
 * "a user-friendly explanation of what is happening" — a running description,
 * not a verdict. A ping action carries reason "Your server is being pinged"
 * whether it succeeds or fails, so presenting it as the cause of a failure reads
 * as nonsense. The field that carries the cause is `error_message`, which the
 * live API returns on a failed action but which the generated schema only
 * declares on `Image` — hence the local cast rather than a schema change.
 */
export function describeActionFailure(action: ServerAction): string | null {
  const detail = (action as { error_message?: string | null }).error_message
  return detail && detail.trim() ? detail.trim() : null
}

/** One phrasing for "this action ended badly", used wherever an action is reported. */
export function actionFailureMessage(label: string, action: ServerAction): string {
  const detail = describeActionFailure(action)
  return detail ? `"${label}" ${action.status}: ${detail}` : `"${label}" ${action.status}`
}

/** The server actions the Network tab is allowed to submit — typed against the generated schema. */
export type NetworkActionPayload =
  | components['schemas']['ChangeIpv6']
  | components['schemas']['ChangeIpv6ReverseNameservers']
  | components['schemas']['ChangeReverseName']
  | components['schemas']['ChangePortBlocking']
  | components['schemas']['ChangeVpcIpv4']
  | components['schemas']['ChangeNetwork']
  | components['schemas']['ChangeSeparatePrivateNetworkInterface']

const ACTION_POLL_INTERVAL_MS = 2000
const ACTION_POLL_TIMEOUT_MS = 90_000
/** Per-request cap: a black-holed connection must not wedge the mutation (and the UI) forever. */
const ACTION_REQUEST_TIMEOUT_MS = 15_000

const isTimeoutError = (err: unknown): boolean =>
  err instanceof DOMException && (err.name === 'TimeoutError' || err.name === 'AbortError')

/**
 * How an action finished, from the client's point of view.
 *
 * `awaiting-interaction` and `blocked-by-invoice` are first-class outcomes
 * rather than flavours of "still running", because BinaryLane has no status for
 * either: a stalled action reports `in-progress` indefinitely, and the only
 * signals are a non-null `user_interaction_required` or `blocking_invoice_id`.
 * Anything that treats them as "keep waiting" burns its whole timeout and then
 * blames the server for being slow — or, with no deadline, waits for something
 * that will never arrive on its own.
 */
export type SettledAction =
  | { state: 'completed'; action: ServerAction }
  | { state: 'errored'; action: ServerAction }
  | { state: 'awaiting-interaction'; action: ServerAction }
  | { state: 'blocked-by-invoice'; action: ServerAction }
  | { state: 'timed-out'; action: ServerAction | null }

export interface PollActionOptions {
  /** The just-submitted action, if the caller already has it. Saves a first poll. */
  initial?: ServerAction
  /**
   * Overall budget. `null` means no deadline, for background tracking of things
   * like a rebuild or a region migration that legitimately run for minutes —
   * any fixed cap short enough to suit a power cycle will misreport those.
   */
  timeoutMs?: number | null
  /** Cadence, or a function of elapsed time so long waits can ease off. */
  intervalMs?: number | ((elapsedMs: number) => number)
  /** Lets a tracker drop an action on profile switch or teardown. */
  signal?: AbortSignal
  /** Fires on every fresh snapshot, for progress display. */
  onProgress?: (action: ServerAction) => void
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'))
      return
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    const onAbort = () => {
      clearTimeout(timer)
      reject(new DOMException('Aborted', 'AbortError'))
    }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

/** Classify a snapshot, or null if it is genuinely still working. */
function classifyAction(action: ServerAction): SettledAction | null {
  // Both checked before status on purpose: a stalled action still says `in-progress`.
  if (action.user_interaction_required) return { state: 'awaiting-interaction', action }
  if (action.blocking_invoice_id) return { state: 'blocked-by-invoice', action }
  if (action.status === 'completed') return { state: 'completed', action }
  if (action.status === 'errored') return { state: 'errored', action }
  return null
}

/**
 * Poll one action until it settles. The single place this repeat-until-done
 * logic lives — both the blocking network mutation and background tracking use
 * it, so the per-request cap, the tolerance for one slow poll, and the
 * paused-for-operator check cannot drift apart between them.
 *
 * Lifecycle outcomes are returned. A genuine API failure throws, because that
 * is a different kind of event from "the action finished badly".
 */
export async function pollActionToSettled(
  client: BinaryLaneClient,
  actionId: number,
  options: PollActionOptions = {}
): Promise<SettledAction> {
  const { initial, timeoutMs = ACTION_POLL_TIMEOUT_MS, intervalMs = ACTION_POLL_INTERVAL_MS, signal, onProgress } = options

  let action: ServerAction | null = initial ?? null
  if (action) {
    const settled = classifyAction(action)
    if (settled) return settled
  }

  const startedAt = Date.now()
  const deadline = timeoutMs == null ? Number.POSITIVE_INFINITY : startedAt + timeoutMs

  for (;;) {
    if (Date.now() > deadline) return { state: 'timed-out', action }

    const elapsed = Date.now() - startedAt
    await sleep(typeof intervalMs === 'function' ? intervalMs(elapsed) : intervalMs, signal)

    let poll: { data?: { action?: ServerAction }; error?: unknown }
    try {
      poll = await client.GET('/v2/actions/{action_id}', {
        params: { path: { action_id: actionId } },
        signal: AbortSignal.timeout(ACTION_REQUEST_TIMEOUT_MS)
      })
    } catch (err) {
      // One slow poll is not a lost action — the deadline above bounds the total wait.
      if (isTimeoutError(err) && !signal?.aborted) continue
      throw err
    }
    if (poll.error) throw new Error(`Lost track of action #${actionId}: ${describeApiError(poll.error)}`)
    if (poll.data?.action) {
      action = poll.data.action
      onProgress?.(action)
      const settled = classifyAction(action)
      if (settled) return settled
    }
  }
}

/**
 * Submit a server action and poll it until BinaryLane reports it finished.
 * Network changes (IPv6, port blocking, VPC moves, reverse DNS) are asynchronous
 * on the BL side, so a bare POST returning 200 only means "queued". Resolves only
 * on `completed`; anything else (errored, timeout, lost action) throws so the UI
 * never reports success it hasn't seen. The server cache is refetched before the
 * promise settles, so callers can trust `server.networks` once `mutateAsync` returns.
 */
export const networkActionMutationKey = (serverId: number | null) => ['network-action', serverId] as const

export function useNetworkActionMutation(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation<ServerAction, Error, NetworkActionPayload>({
    // Keyed so `useIsMutating(networkActionMutationKey(id))` can report an in-flight action
    // even after the component that started it unmounted (tab switch mid-action).
    mutationKey: networkActionMutationKey(serverId),
    mutationFn: async (actionPayload) => {
      if (!client || !serverId) throw new Error('No client available')
      let submitted: { data?: { action?: ServerAction }; error?: unknown }
      try {
        submitted = await client.POST('/v2/servers/{server_id}/actions', {
          params: { path: { server_id: serverId } },
          body: actionPayload,
          signal: AbortSignal.timeout(ACTION_REQUEST_TIMEOUT_MS)
        })
      } catch (err) {
        if (isTimeoutError(err)) {
          throw new Error(
            `BinaryLane did not answer the "${actionPayload.type}" request within ${ACTION_REQUEST_TIMEOUT_MS / 1000}s. It may or may not have been applied — check the interfaces above once they refresh.`
          )
        }
        throw err
      }
      if (submitted.error) throw new Error(describeApiError(submitted.error))

      const queued = submitted.data?.action
      if (!queued?.id) throw new Error(`BinaryLane accepted "${actionPayload.type}" but returned no action to track.`)

      // Blocking on purpose: a second network change over an unsettled first one
      // is the hazard here, so the UI stays locked until this one resolves.
      const settled = await pollActionToSettled(client, queued.id, { initial: queued })
      switch (settled.state) {
        case 'completed':
          return settled.action
        case 'awaiting-interaction':
          // Not something more waiting can fix — release the lock and let the
          // account-wide prompt collect the answer.
          throw new Error(
            `"${actionPayload.type}" is waiting for your confirmation (action #${settled.action.id}). Answer the prompt to let it continue.`
          )
        case 'blocked-by-invoice':
          throw new Error(
            `"${actionPayload.type}" is blocked by invoice #${settled.action.blocking_invoice_id}, which requires payment (action #${settled.action.id}).`
          )
        case 'timed-out':
          throw new Error(
            `"${actionPayload.type}" is still in progress after ${ACTION_POLL_TIMEOUT_MS / 1000}s (action #${queued.id}). It may still complete; this page refreshes automatically.`
          )
        case 'errored':
          throw new Error(actionFailureMessage(actionPayload.type, settled.action))
      }
    },
    onSettled: async () => {
      // Await the refetch so the mutation lock only releases once the UI has fresh data —
      // whole-list writes (IPv6 reverse nameservers) must never be built from a stale server.
      // refetchType 'all' also refreshes the server query when its tab is currently unmounted,
      // so a remount never briefly renders the pre-action snapshot.
      // The wait is capped: the refetch GETs have no timeout of their own, and a wedged
      // connection must not hold the UI lock after the action itself has already timed out.
      // The refetch keeps running in the background past the cap.
      const refetch = Promise.all([
        queryClient.invalidateQueries({ queryKey: ['server', serverId], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['servers'] }),
        queryClient.invalidateQueries({ queryKey: ['server-threshold-alerts', serverId] }),
        queryClient.invalidateQueries({ queryKey: ['server-advanced-features', serverId] })
      ])
      await Promise.race([refetch, new Promise((r) => setTimeout(r, ACTION_REQUEST_TIMEOUT_MS))])
    }
  })
}

/**
 * How long a submitted action is allowed to hold the UI before it is handed to
 * background tracking.
 *
 * This replaces guessing which operations are "long". Judging by action type
 * would mean hardcoding durations nobody has measured — and being wrong in the
 * expensive direction, since the previous 90s cap turned a perfectly healthy
 * rebuild into a reported failure. A short block instead lets quick actions
 * (rename, threshold alerts) still resolve inline and report a true
 * "completed", while anything slower keeps running with the UI released.
 */
const ACTION_HANDOFF_MS = 10_000

export type ServerActionOutcome =
  | { state: 'completed'; action: ServerAction }
  | { state: 'errored'; action: ServerAction }
  | { state: 'awaiting-interaction'; action: ServerAction }
  | { state: 'blocked-by-invoice'; action: ServerAction }
  /** Still running, and no longer holding the UI. The caller should track it. */
  | { state: 'handed-off'; action: ServerAction }

/**
 * Submit a server action, wait briefly for it to settle, and otherwise hand it
 * back still running so the caller can track it in the background.
 *
 * Reuses `networkActionMutationKey` so the existing `useIsMutating` busy locks
 * keep working, and so a Settings action and a Network action on the same
 * server continue to lock each other out as they do today.
 */
export function useServerActionWithHandoff(client: BinaryLaneClient | null, serverId: number | null) {
  const queryClient = useQueryClient()
  return useMutation<ServerActionOutcome, Error, Record<string, unknown> & { type: string }>({
    mutationKey: networkActionMutationKey(serverId),
    mutationFn: async (actionPayload) => {
      if (!client || !serverId) throw new Error('No client available')

      let submitted: { data?: { action?: ServerAction }; error?: unknown }
      try {
        submitted = await client.POST('/v2/servers/{server_id}/actions', {
          params: { path: { server_id: serverId } },
          body: actionPayload as never,
          signal: AbortSignal.timeout(ACTION_REQUEST_TIMEOUT_MS)
        })
      } catch (err) {
        if (isTimeoutError(err)) {
          throw new Error(
            `BinaryLane did not answer the "${actionPayload.type}" request within ${ACTION_REQUEST_TIMEOUT_MS / 1000}s. It may or may not have been applied — check the server once it refreshes.`
          )
        }
        throw err
      }
      if (submitted.error) throw new Error(describeApiError(submitted.error))

      const queued = submitted.data?.action
      if (!queued?.id) throw new Error(`BinaryLane accepted "${actionPayload.type}" but returned no action to track.`)

      const settled = await pollActionToSettled(client, queued.id, {
        initial: queued,
        timeoutMs: ACTION_HANDOFF_MS
      })
      if (settled.state === 'timed-out') {
        return { state: 'handed-off', action: settled.action ?? queued }
      }
      return settled
    },
    onSettled: async () => {
      const refetch = Promise.all([
        queryClient.invalidateQueries({ queryKey: ['server', serverId], refetchType: 'all' }),
        queryClient.invalidateQueries({ queryKey: ['servers'] }),
        queryClient.invalidateQueries({ queryKey: ['server-threshold-alerts', serverId] }),
        queryClient.invalidateQueries({ queryKey: ['server-advanced-features', serverId] })
      ])
      await Promise.race([refetch, new Promise((r) => setTimeout(r, ACTION_REQUEST_TIMEOUT_MS))])
    }
  })
}

/**
 * Diagnostics answer in seconds, and the caller is watching a spinner, so this
 * polls faster than the default and gives up sooner. Neither number is a
 * measurement of how long a diagnostic takes — the cap only has to be long
 * enough that a healthy one is never cut short.
 */
const DIAGNOSTIC_POLL_INTERVAL_MS = 1000
const DIAGNOSTIC_POLL_TIMEOUT_MS = 30_000

/**
 * Submit a diagnostic (`ping`, `uptime`, `is_running`) and wait for its answer.
 *
 * These are the one case that must block: the value the user asked for arrives
 * in `result_data`, which is only populated once the action reaches `completed`.
 * Reading the action returned by the POST gives `status: 'in-progress'` and no
 * result at all — which is why the panel used to report `"in-progress"` forever.
 * A toast is no use here either; the answer belongs inline, next to the button
 * that asked for it.
 */
export function useServerDiagnosticMutation(client: BinaryLaneClient | null, serverId: number | null) {
  return useMutation<ServerAction, Error, Record<string, unknown> & { type: string }>({
    mutationFn: async (actionPayload) => {
      if (!client || !serverId) throw new Error('No client available')

      const submitted = await client.POST('/v2/servers/{server_id}/actions', {
        params: { path: { server_id: serverId } },
        body: actionPayload as never,
        signal: AbortSignal.timeout(ACTION_REQUEST_TIMEOUT_MS)
      })
      if (submitted.error) throw new Error(describeApiError(submitted.error))

      const queued = submitted.data?.action
      if (!queued?.id) throw new Error(`BinaryLane accepted "${actionPayload.type}" but returned no action to track.`)

      const settled = await pollActionToSettled(client, queued.id, {
        initial: queued,
        timeoutMs: DIAGNOSTIC_POLL_TIMEOUT_MS,
        intervalMs: DIAGNOSTIC_POLL_INTERVAL_MS
      })
      switch (settled.state) {
        case 'completed':
          return settled.action
        case 'errored':
          throw new Error(actionFailureMessage(actionPayload.type, settled.action))
        case 'awaiting-interaction':
          throw new Error(
            `"${actionPayload.type}" is waiting for your confirmation (action #${settled.action.id}). Answer the prompt to let it continue.`
          )
        case 'blocked-by-invoice':
          throw new Error(
            `"${actionPayload.type}" is blocked by invoice #${settled.action.blocking_invoice_id}, which requires payment.`
          )
        case 'timed-out':
          throw new Error(
            `"${actionPayload.type}" had not finished after ${DIAGNOSTIC_POLL_TIMEOUT_MS / 1000}s (action #${queued.id}). It may still complete — check the server's action history.`
          )
      }
    }
  })
}

export function useServerThresholdAlerts(client: BinaryLaneClient | null, serverId: number | undefined) {
  return useQuery({
    queryKey: ['server-threshold-alerts', serverId],
    queryFn: async () => {
      if (!client || !serverId) return []
      const { data, error } = await client.GET('/v2/servers/{server_id}/threshold_alerts', {
        params: { path: { server_id: serverId } }
      })
      if (error) throw new Error(describeApiError(error))
      return data?.threshold_alerts || []
    },
    enabled: !!client && !!serverId
  })
}

export function useAvailableAdvancedFeatures(client: BinaryLaneClient | null, serverId: number | undefined) {
  return useQuery({
    queryKey: ['server-advanced-features', serverId],
    queryFn: async () => {
      if (!client || !serverId) return null
      const { data, error } = await client.GET('/v2/servers/{server_id}/available_advanced_features', {
        params: { path: { server_id: serverId } }
      })
      if (error) throw new Error(describeApiError(error))
      return data?.available_advanced_server_features || null
    },
    enabled: !!client && !!serverId
  })
}

// --- ACTIONS AWAITING USER INTERACTION (account-wide) ---

/**
 * BinaryLane can pause an action partway through and wait for the operator to
 * answer a yes/no question — a new server that never answered a ping, or one
 * that would not shut down cleanly. Two things make this easy to miss:
 *
 * 1. `status` stays `in-progress` the whole time it waits. There is no distinct
 *    status value for it; the only signal is a non-null `user_interaction_required`.
 * 2. Nothing resumes until someone answers via POST /v2/actions/{id}/proceed, so
 *    an unanswered prompt is a wedged operation, not a slow one.
 *
 * The watch is account-wide on purpose: the question usually arrives a minute or
 * more after the click that caused it (BinaryLane has to time out a ping or a
 * clean shutdown first), by which point the user has very likely navigated away
 * from — or closed — the view that started it.
 */

const INTERACTION_POLL_INTERVAL_MS = 20_000
const INTERACTION_PAGE_SIZE = 50

export type ActionAwaitingInteraction = ServerAction & {
  user_interaction_required: NonNullable<ServerAction['user_interaction_required']>
}

const awaitsInteraction = (action: ServerAction): action is ActionAwaitingInteraction =>
  action.user_interaction_required != null

async function fetchActionsPage(
  client: BinaryLaneClient,
  page: number
): Promise<{ actions: ServerAction[]; total: number }> {
  const { data, error } = await client.GET('/v2/actions', {
    params: { query: { page, per_page: INTERACTION_PAGE_SIZE } }
  })
  if (error) throw new Error(describeApiError(error))
  return { actions: data?.actions ?? [], total: data?.meta?.total ?? 0 }
}

/**
 * `/v2/actions` does not document its sort order, and guessing wrong would make
 * this watch silently never fire on a long-lived account — the worst failure
 * mode for a prompt whose whole job is to unblock a stuck operation. So rather
 * than assume, read the page we got: if its timestamps ascend, the newest
 * actions are at the far end and we go fetch that page too.
 */
function looksOldestFirst(actions: ServerAction[]): boolean {
  if (actions.length < 2) return false
  const first = Date.parse(actions[0].started_at)
  const last = Date.parse(actions[actions.length - 1].started_at)
  if (Number.isNaN(first) || Number.isNaN(last)) return false
  return last > first
}

export function useActionsAwaitingInteraction(client: BinaryLaneClient | null, profileId?: string) {
  return useQuery<ActionAwaitingInteraction[]>({
    queryKey: ['actions-awaiting-interaction', profileId || 'default'],
    queryFn: async () => {
      if (!client) return []
      const firstPage = await fetchActionsPage(client, 1)
      const seen = new Map<number, ServerAction>()
      for (const action of firstPage.actions) seen.set(action.id, action)

      if (firstPage.total > firstPage.actions.length && looksOldestFirst(firstPage.actions)) {
        const lastPage = Math.ceil(firstPage.total / INTERACTION_PAGE_SIZE)
        if (lastPage > 1) {
          const tail = await fetchActionsPage(client, lastPage)
          for (const action of tail.actions) seen.set(action.id, action)
          // A trailing page is usually a partial one — with total 101 and 50 per
          // page the newest page holds a single action, and a question raised a
          // few actions earlier would sit just off the end of it. Take one more
          // page back so a full page of recent history is always inspected.
          if (tail.actions.length < INTERACTION_PAGE_SIZE) {
            const previous = await fetchActionsPage(client, lastPage - 1)
            for (const action of previous.actions) seen.set(action.id, action)
          }
        }
      }

      return [...seen.values()].filter(awaitsInteraction)
    },
    enabled: !!client,
    refetchInterval: INTERACTION_POLL_INTERVAL_MS,
    // The interval is the retry: a failed poll should wait its turn rather than
    // stack extra requests on an API that may already be unhappy.
    retry: 0,
    staleTime: 0
  })
}

/**
 * Answer a waiting action. `proceed: true` means the operator agreed to the
 * specific thing `interaction_type` names — assume the server came up despite
 * the failed ping, or permit the unclean power off.
 */
export function useActionProceedMutation(client: BinaryLaneClient | null) {
  const queryClient = useQueryClient()
  return useMutation<void, Error, { actionId: number; proceed: boolean }>({
    mutationFn: async ({ actionId, proceed }) => {
      if (!client) throw new Error('No client available')
      const { error, response } = await client.POST('/v2/actions/{action_id}/proceed', {
        params: { path: { action_id: actionId } },
        body: { proceed }
      })
      if (error) throw new Error(describeApiError(error))
      // A successful answer is 204 No Content. There is deliberately no `data`
      // check here: treating an empty body as failure would report every
      // success as an error.
      if (!response.ok) {
        throw new Error(`BinaryLane did not accept the answer to action #${actionId} (HTTP ${response.status}).`)
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['actions-awaiting-interaction'] })
      queryClient.invalidateQueries({ queryKey: ['servers'] })
      queryClient.invalidateQueries({ queryKey: ['serverActions'] })
    }
  })
}
