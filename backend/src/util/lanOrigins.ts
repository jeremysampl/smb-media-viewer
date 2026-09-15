import os from 'node:os';

function isPrivateIpv4(address: string): boolean {
  const parts = address.split('.').map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

/** LAN IPv4 addresses the Cast device can likely reach on this host. */
export function listLanIpv4Addresses(): string[] {
  const addresses: string[] = [];
  for (const entries of Object.values(os.networkInterfaces())) {
    if (!entries) continue;
    for (const entry of entries) {
      if (entry.internal || entry.family !== 'IPv4') continue;
      if (!isPrivateIpv4(entry.address)) continue;
      if (!addresses.includes(entry.address)) addresses.push(entry.address);
    }
  }
  return addresses;
}

export function normalizePublicOrigin(raw: string | undefined | null): string | null {
  if (!raw?.trim()) return null;
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.origin;
  } catch {
    return null;
  }
}

export function isLoopbackOrigin(origin: string): boolean {
  try {
    const host = new URL(origin).hostname;
    return host === 'localhost' || host === '127.0.0.1' || host === '::1';
  } catch {
    return false;
  }
}
