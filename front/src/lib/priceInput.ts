// Importes que escribe el usuario (formularios de alta y de objetivo).

/** Convierte lo que escribe el usuario («12,50», «1.099,95», «600») en número. */
export function parsePriceInput(raw: string): number | null {
  let text = raw.trim().replace(/[\s€]/g, '');
  if (!text) return null;
  if (text.includes(',')) {
    // Formato español: el punto separa miles y la coma, decimales.
    text = text.replace(/\./g, '').replace(',', '.');
  } else if (/^\d{1,3}(\.\d{3})+$/.test(text)) {
    // «1.099» sin coma: punto de miles, igual que en el texto de las tiendas (D6).
    text = text.replace(/\./g, '');
  }
  if (!/^\d+(\.\d{1,2})?$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) / 100 : null;
}

/** Precio con dos decimales y coma, para rellenar un campo de texto. */
export function priceToInput(value: number): string {
  return value.toFixed(2).replace('.', ',');
}
