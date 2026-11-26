// Avisos flotantes. Los pinta <Toaster />, que vive en la barra lateral (persistente entre páginas).

export type ToastKind = 'ok' | 'err' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  message: string;
}

let items: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToasts(): ToastItem[] {
  return items;
}

export function dismissToast(id: number): void {
  items = items.filter((item) => item.id !== id);
  emit();
}

function push(kind: ToastKind, message: string, duration = kind === 'err' ? 8000 : 5000): void {
  const id = nextId++;
  items = [...items.slice(-3), {id, kind, message}];
  emit();
  setTimeout(() => dismissToast(id), duration);
}

export const toast = {
  success: (message: string) => push('ok', message),
  error: (message: string) => push('err', message),
  info: (message: string) => push('info', message),
};
