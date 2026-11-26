// Navegación sin recargar (ClientRouter). Envuelto para poder sustituirlo en los tests.
import {navigate as astroNavigate} from 'astro:transitions/client';

export function navigate(href: string, options: {replace?: boolean} = {}): Promise<void> {
  return astroNavigate(href, {history: options.replace ? 'replace' : 'auto'});
}

/** Salto completo sin dejar entrada en el historial (a /entrar, a la ruta nueva de un enlace antiguo…). */
export function replaceLocation(href: string): void {
  // Varias piezas pueden pedir el mismo salto a la vez (la barra lateral y la página): uno basta.
  const w = window as Window & {__aaRedirect?: string};
  if (w.__aaRedirect === href) return;
  w.__aaRedirect = href;
  window.location.replace(href);
}
