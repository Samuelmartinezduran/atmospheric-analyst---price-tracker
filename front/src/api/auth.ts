import {api} from './client';
import type {
  LoginResponse,
  MessageResponse,
  MessageWithDebugToken,
  RevokeOthersResponse,
  Session,
  User,
} from './types';

const BASE = '/api/auth';

// Las rutas públicas van con `auth: false`: un 401 en el login es «credenciales
// inválidas», no una sesión que haya que renovar.

export function register(email: string, password: string) {
  return api<MessageWithDebugToken>(`${BASE}/register`, {method: 'POST', body: {email, password}, auth: false});
}

export function verifyEmail(token: string) {
  return api<MessageResponse>(`${BASE}/verify-email`, {method: 'POST', body: {token}, auth: false});
}

export function resendVerification(email: string) {
  return api<MessageWithDebugToken>(`${BASE}/resend-verification`, {method: 'POST', body: {email}, auth: false});
}

export function login(email: string, password: string) {
  return api<LoginResponse>(`${BASE}/login`, {method: 'POST', body: {email, password}, auth: false});
}

export function logout() {
  return api<MessageResponse>(`${BASE}/logout`, {method: 'POST', auth: false});
}

export function getMe(signal?: AbortSignal) {
  return api<User>(`${BASE}/me`, {signal});
}

export function changePassword(currentPassword: string, newPassword: string) {
  return api<MessageResponse>(`${BASE}/change-password`, {
    method: 'POST',
    body: {current_password: currentPassword, new_password: newPassword},
  });
}

export function forgotPassword(email: string) {
  return api<MessageWithDebugToken>(`${BASE}/forgot-password`, {method: 'POST', body: {email}, auth: false});
}

export function resetPassword(token: string, newPassword: string) {
  return api<MessageResponse>(`${BASE}/reset-password`, {
    method: 'POST',
    body: {token, new_password: newPassword},
    auth: false,
  });
}

export async function listSessions(signal?: AbortSignal) {
  const response = await api<{sessions: Session[]}>(`${BASE}/sessions`, {signal});
  return response.sessions;
}

export function revokeOtherSessions() {
  return api<RevokeOthersResponse>(`${BASE}/sessions/revoke-others`, {method: 'POST'});
}
