/**
 * Los emails antiguos enlazaban a `/?verify_token=X` y `/?reset_token=X`.
 * Devuelve la ruta nueva equivalente, o `null` si la URL no es uno de esos enlaces.
 */
export function getLegacyRedirect(search: string): string | null {
  const params = new URLSearchParams(search);
  const verifyToken = params.get('verify_token');
  if (verifyToken) return `/verificar?token=${encodeURIComponent(verifyToken)}`;
  const resetToken = params.get('reset_token');
  if (resetToken) return `/restablecer?token=${encodeURIComponent(resetToken)}`;
  return null;
}
