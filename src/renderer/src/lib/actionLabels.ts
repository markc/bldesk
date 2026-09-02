/**
 * Human-readable names for BinaryLane action types.
 *
 * The API's action `type` is a snake_case identifier (`power_cycle`,
 * `enable_rescue_mode`). That is fine in a confirm dialog the user has just
 * opened deliberately, but a toast reporting an outcome minutes later is prose,
 * and "power_cycle" is not.
 *
 * Title-casing the identifier handles almost every type correctly, so the map
 * below covers only the words that rule gets wrong — acronyms.
 */
const ACRONYMS: Record<string, string> = {
  ipv4: 'IPv4',
  ipv6: 'IPv6',
  vpc: 'VPC',
  ssh: 'SSH',
  dns: 'DNS',
  ip: 'IP',
  os: 'OS',
  id: 'ID',
  cpu: 'CPU',
  url: 'URL'
}

export function describeActionType(type: string): string {
  if (!type) return 'Server action'
  return type
    .split('_')
    .map((word) => ACRONYMS[word.toLowerCase()] ?? word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}
