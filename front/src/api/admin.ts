import {api} from './client';

export interface AdminTotals {
  users: number;
  verified_users: number;
  products: number;
  active_products: number;
  checks_24h: number;
  failed_checks_24h: number;
  alerts_pending: number;
  alerts_failed: number;
  alerts_sent: number;
}

export interface AdminUserRow {
  id: number;
  email: string;
  is_email_verified: boolean;
  is_active: boolean;
  is_admin: boolean;
  created_at: string;
  products: number;
  last_login_at: string | null;
}

export interface AdminOverview {
  totals: AdminTotals;
  last_check_at: string | null;
  email_enabled: boolean;
  check_interval_minutes: number;
  users: AdminUserRow[];
}

export function getAdminOverview(signal?: AbortSignal) {
  return api<AdminOverview>('/api/admin/overview', {signal});
}

export function deleteUser(id: number) {
  return api<void>(`/api/admin/users/${id}`, {method: 'DELETE'});
}
