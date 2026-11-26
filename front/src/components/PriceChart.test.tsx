import {fireEvent, render, screen} from '@testing-library/react';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import type {HistoryPoint} from '../api/types';
import {PriceChart} from './PriceChart';

const point = (id: number, checkedAt: string, price: number | null): HistoryPoint => ({
  id,
  product_id: 1,
  price,
  currency: 'EUR',
  status: price === null ? 'error' : 'ok',
  error_message: null,
  checked_at: checkedAt,
});

// Historial con el hueco real de abril a noviembre.
const history = [
  point(1, '2026-03-23T10:00:00Z', 349.99),
  point(2, '2026-03-24T10:00:00Z', 349.99),
  point(3, '2026-04-01T10:00:00Z', 429.95),
  point(4, '2026-11-26T10:00:00Z', 822.12),
];

beforeEach(() => {
  // jsdom no mide: se fija un ancho de 800 px.
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(800);
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('PriceChart', () => {
  it('sombrea el hueco sin lecturas y lo cuenta en el resumen accesible', () => {
    const {container} = render(<PriceChart history={history} target={350} />);
    expect(container.querySelectorAll('.gap rect')).toHaveLength(1);
    expect(screen.getByText('sin lecturas')).toBeInTheDocument();
    expect(screen.getByText(/Hay un tramo sin lecturas: del 1 abr 2026 al 26 nov 2026/)).toBeInTheDocument();
    // La línea se corta en el hueco: dos tramos y un puente discontinuo.
    expect(container.querySelectorAll('path.line')).toHaveLength(2);
    expect(container.querySelectorAll('path.bridge')).toHaveLength(1);
  });

  it('la escala de tiempo es real: el hueco ocupa casi todo el ancho', () => {
    const {container} = render(<PriceChart history={history} target={350} />);
    const rect = container.querySelector('.gap rect')!;
    const width = Number(rect.getAttribute('width'));
    const plot = 800 - 70 - 16;
    expect(width / plot).toBeGreaterThan(0.95);
  });

  it('dibuja la línea discontinua del objetivo con su etiqueta', () => {
    render(<PriceChart history={history} target={350} />);
    expect(screen.getByText(/objetivo 350,00/)).toBeInTheDocument();
  });

  it('se explora con el teclado (patrón slider)', () => {
    render(<PriceChart history={history} target={350} />);
    const slider = screen.getByRole('slider', {name: /Explorar las lecturas/});
    fireEvent.focus(slider);
    expect(slider).toHaveAttribute('aria-valuenow', '4');
    fireEvent.keyDown(slider, {key: 'Home'});
    expect(slider).toHaveAttribute('aria-valuenow', '1');
    expect(slider.getAttribute('aria-valuetext')).toMatch(/349,99/);
    fireEvent.keyDown(slider, {key: 'ArrowRight'});
    expect(slider).toHaveAttribute('aria-valuenow', '2');
  });

  it('sin precios lo dice en vez de dibujar', () => {
    render(<PriceChart history={[point(1, '2026-11-26T10:00:00Z', null)]} target={350} />);
    expect(screen.getAllByText(/Todavía no hay lecturas con precio/).length).toBeGreaterThan(0);
    expect(screen.queryByRole('slider')).toBeNull();
  });
});
