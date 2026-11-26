/** Resumen legible de un user agent: «Chrome en Windows». Aproximado y sin dependencias. */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return 'Dispositivo desconocido';
  const ua = userAgent;

  let browser = 'Navegador';
  if (/Edg\//.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/.test(ua)) browser = 'Opera';
  else if (/Firefox\//.test(ua)) browser = 'Firefox';
  else if (/Chrome\//.test(ua)) browser = 'Chrome';
  else if (/Safari\//.test(ua)) browser = 'Safari';
  else if (/curl|python|httpx|okhttp|PostmanRuntime/i.test(ua)) browser = 'Cliente HTTP';

  let os: string | null = null;
  if (/Windows/.test(ua)) os = 'Windows';
  else if (/Android/.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/.test(ua)) os = 'macOS';
  else if (/Linux/.test(ua)) os = 'Linux';

  return os ? `${browser} en ${os}` : browser;
}
