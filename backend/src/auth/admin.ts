import { config } from '../config.js';

/** Case-insensitive check against ADMIN_USERS. */
export function isAdminUsername(username: string): boolean {
  const normalized = username.trim().toLowerCase();
  if (!normalized) return false;
  return config.adminUsers.some((entry) => entry === normalized);
}
