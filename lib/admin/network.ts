import ipaddr from 'ipaddr.js';
import { AdminError } from './validation';

type Environment = Record<string, string | undefined>;
type Address = ReturnType<typeof ipaddr.parse>;
type Cidr = [Address, number];

function normalized(address: Address): Address {
  return address.kind() === 'ipv6' && (address as ipaddr.IPv6).isIPv4MappedAddress()
    ? (address as ipaddr.IPv6).toIPv4Address()
    : address;
}

export function parseAdminIpAllowlist(value: string | undefined): Cidr[] {
  const source = value?.trim();
  if (!source) return [];
  const entries = source.split(',').map(item => item.trim()).filter(Boolean);
  try {
    return entries.map(entry => {
      if(!entry.includes('/')){
        const address=ipaddr.parse(entry);
        return [normalized(address),address.kind()==='ipv4'||(address.kind()==='ipv6'&&(address as ipaddr.IPv6).isIPv4MappedAddress())?32:128] as Cidr;
      }
      const [address, prefix] = ipaddr.parseCIDR(entry);
      if (address.kind() === 'ipv6' && (address as ipaddr.IPv6).isIPv4MappedAddress()) {
        if (prefix < 96) throw new Error('Mapped IPv4 CIDR is broader than its address family.');
        return [(address as ipaddr.IPv6).toIPv4Address(), prefix - 96] as Cidr;
      }
      return [address, prefix] as Cidr;
    });
  } catch {
    throw new AdminError('Administrator network policy is misconfigured.', 503);
  }
}

export function requestClientIp(headers: Headers): Address | null {
  // Vercel appends the real client address to x-vercel-forwarded-for and
  // overwrites x-real-ip. The left-most x-forwarded-for hop is whatever the
  // browser sent, so it must never decide an allowlist match. A missing
  // trusted address fails closed once a policy is configured.
  const vercelChain = headers.get('x-vercel-forwarded-for');
  const candidate = vercelChain
    ? vercelChain.split(',').map(item => item.trim()).filter(Boolean).at(-1)
    : headers.get('x-real-ip')?.split(',')[0]?.trim();
  if (!candidate || !ipaddr.isValid(candidate)) return null;
  try { return normalized(ipaddr.parse(candidate)); } catch { return null; }
}

export function isAdminIpAllowed(headers: Headers, env: Environment = process.env) {
  const cidrs = parseAdminIpAllowlist(env.ADMIN_IP_ALLOWLIST);
  if (!cidrs.length) return true;
  const address = requestClientIp(headers);
  if (!address) return false;
  return cidrs.some(([network, prefix]) => address.kind() === network.kind() && address.match(network, prefix));
}

export function assertAdminIpAllowed(headers: Headers, env: Environment = process.env) {
  if (!isAdminIpAllowed(headers, env)) {
    throw new AdminError('Administrator access is unavailable from this network.', 403);
  }
}
