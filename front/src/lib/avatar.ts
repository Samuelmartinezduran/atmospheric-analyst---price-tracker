/** Degradado estable para el avatar a partir del email (sin fotos ni servicios externos). */
export function avatarGradient(email: string): string {
  let hash = 0;
  for (const char of email.trim().toLowerCase()) hash = (Math.imul(hash, 31) + char.codePointAt(0)!) | 0;
  const hue = Math.abs(hash) % 360;
  const second = (hue + 40 + (Math.abs(hash >> 8) % 80)) % 360;
  return `linear-gradient(135deg, hsl(${hue} 85% 72%), hsl(${second} 80% 45%))`;
}
