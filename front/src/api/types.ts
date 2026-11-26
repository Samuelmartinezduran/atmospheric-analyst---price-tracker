// Tipos del contrato descrito en docs/API.md.

export interface User {
  id: number;
  email: string;
  is_email_verified: boolean;
  is_active: boolean;
  created_at: string;
}

export interface Session {
  id: number;
  ip_address: string | null;
  user_agent: string | null;
  expires_at: string;
  revoked_at: string | null;
  created_at: string;
  is_current: boolean;
}

export interface MessageResponse {
  message: string;
}

/** Respuesta de register, resend-verification y forgot-password. */
export interface MessageWithDebugToken extends MessageResponse {
  /** Solo llega con APP_ENV=dev y AUTH_ENABLE_DEBUG_TOKENS activado. */
  debug_token?: string | null;
}

export interface LoginResponse {
  user: User;
}

export interface RevokeOthersResponse extends MessageResponse {
  revoked_count: number;
}

export interface Store {
  code: string;
  name: string;
  domains: string[];
  example_url: string;
}

export type ProductStatus = 'never_checked' | 'ok' | 'unavailable' | 'error';

export interface ProductStats {
  lowest_price: number | null;
  lowest_price_at: string | null;
  highest_price: number | null;
  avg_price_30d: number | null;
  checks_count: number | null;
}

export interface Product {
  id: number;
  url: string;
  store: string;
  title: string | null;
  image_url: string | null;
  desired_price: number;
  last_price: number | null;
  previous_price: number | null;
  currency: string;
  last_status: ProductStatus;
  last_error: string | null;
  last_checked_at: string | null;
  is_below_target: boolean;
  stats: ProductStats | null;
  created_at: string;
  updated_at: string;
}

export interface HistoryPoint {
  id: number;
  product_id: number;
  price: number | null;
  currency: string;
  status: string;
  error_message: string | null;
  checked_at: string;
}

export interface CheckSummary {
  total_products: number;
  checked_ok: number;
  checked_failed: number;
  alerts_created: number;
  skipped: number;
}

export type AlertStatus = 'pending' | 'sent' | 'failed';

export interface Alert {
  id: number;
  product_id: number;
  product_title: string | null;
  product_url: string;
  desired_price: number;
  triggered_price: number;
  currency: string;
  status: AlertStatus;
  attempts: number;
  error_message: string | null;
  triggered_at: string;
  sent_at: string | null;
}
