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
      if (error) throw new Error(JSON.stringify(error))
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

export function useInvoices(client: BinaryLaneClient | null) {
  return useQuery({
    queryKey: ['invoices'],
    queryFn: async () => {
      if (!client) return []
      const { data, error } = await client.GET('/v2/customers/my/invoices')
      if (error) throw new Error(JSON.stringify(error))
      return data?.invoices || []
    },
    enabled: !!client
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
      const query: Record<string, any> = {
        data_interval: interval,
        per_page: 200
      }
      if (start) query.start = start
      if (end) query.end = end

      const { data, error } = await client.GET('/v2/samplesets/{server_id}', {
        params: {
          path: { server_id: serverId },
          query: query as any
        }
      })
      console.log('[DEBUG useSampleSets]', { serverId, interval, start, end, dataCount: data?.sample_sets?.length, error })
      if (error) {
        console.warn('[useSampleSets] Error loading sample sets:', error)
        return []
      }
      return data?.sample_sets || []
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

// --- SERVER NETWORKING (async actions, polled to completion) ---

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

      let action: ServerAction = queued
      const deadline = Date.now() + ACTION_POLL_TIMEOUT_MS
      while (action.status === 'in-progress') {
        if (Date.now() > deadline) {
          throw new Error(
            `"${actionPayload.type}" is still in progress after ${ACTION_POLL_TIMEOUT_MS / 1000}s (action #${action.id}). It may still complete; this page refreshes automatically.`
          )
        }
        await new Promise((r) => setTimeout(r, ACTION_POLL_INTERVAL_MS))
        let poll: { data?: { action?: ServerAction }; error?: unknown }
        try {
          poll = await client.GET('/v2/actions/{action_id}', {
            params: { path: { action_id: action.id } },
            signal: AbortSignal.timeout(ACTION_REQUEST_TIMEOUT_MS)
          })
        } catch (err) {
          // One slow poll is not a lost action — the deadline check above bounds the total wait.
          if (isTimeoutError(err)) continue
          throw err
        }
        if (poll.error) throw new Error(`Lost track of action #${action.id}: ${describeApiError(poll.error)}`)
        if (poll.data?.action) action = poll.data.action
      }
      if (action.status !== 'completed') {
        throw new Error(action.reason || `"${actionPayload.type}" ${action.status}`)
      }
      return action
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
