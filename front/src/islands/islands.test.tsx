import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {clearCache} from '../lib/cache';

// Navegación de Astro y saltos de página: se sustituyen para poder comprobarlos.
const nav = vi.hoisted(() => ({navigate: vi.fn(async () => {}), replaceLocation: vi.fn()}));
vi.mock('../lib/nav', () => nav);

import LoginForm from './LoginForm';
import ProductsPage from './ProductsPage';
import ResetForm from './ResetForm';
import VerifyCard from './VerifyCard';
import {loginUrl, safeNext} from '../lib/session';

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];
type Handler = (init?: RequestInit) => Response;

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

const user = {id: 1, email: 'samuel@example.com', is_email_verified: true, is_active: true, created_at: '2026-01-01T00:00:00Z'};

let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;
let routes: Record<string, Handler>;

function calledPaths(): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

function at(path: string) {
  window.history.replaceState(null, '', path);
}

beforeEach(() => {
  clearCache();
  nav.navigate.mockClear();
  nav.replaceLocation.mockClear();
  routes = {
    '/api/auth/me': () => json(401, {detail: 'No autenticado'}),
    '/api/auth/refresh': () => json(401, {detail: 'No autenticado'}),
  };
  fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>(async (input, init) => {
    const handler = routes[String(input)];
    return handler ? handler(init) : json(200, []);
  });
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  at('/');
});

describe('a dónde volver tras entrar', () => {
  it('solo rutas de esta web', () => {
    expect(safeNext('/alertas')).toBe('/alertas');
    expect(safeNext('/producto?id=3')).toBe('/producto?id=3');
    expect(safeNext('//evil.example')).toBe('/');
    expect(safeNext('/\\evil.example')).toBe('/');
    expect(safeNext('https://evil.example')).toBe('/');
    expect(safeNext('/entrar?next=/x')).toBe('/');
    expect(safeNext(null)).toBe('/');
  });

  it('loginUrl lleva ?next= salvo para la portada', () => {
    expect(loginUrl('/')).toBe('/entrar');
    expect(loginUrl('/producto?id=3')).toBe('/entrar?next=%2Fproducto%3Fid%3D3');
  });
});

describe('páginas privadas', () => {
  it('sin sesión van a /entrar?next=… sin pedir productos', async () => {
    at('/?q=asus');
    render(<ProductsPage />);

    expect(screen.getByRole('status')).toHaveTextContent('Cargando…');
    await waitFor(() => expect(nav.replaceLocation).toHaveBeenCalledWith('/entrar?next=%2F%3Fq%3Dasus'));
    expect(calledPaths()).not.toContain('/api/products');
  });

  it('con sesión pintan el panel y piden sus datos', async () => {
    routes['/api/auth/me'] = () => json(200, user);
    routes['/api/products'] = () => json(200, []);
    routes['/api/summary'] = () =>
      json(200, {
        products: {total: 0, below_target: 0, above_target: 0, unavailable: 0, error: 0, never_checked: 0},
        checks_24h: 0,
        failed_checks_24h: 0,
        last_check_at: null,
        next_check_at: null,
        check_interval_minutes: 360,
        email_enabled: true,
      });

    render(<ProductsPage />);

    expect(await screen.findByRole('heading', {name: 'Productos', level: 1})).toBeInTheDocument();
    expect(screen.getByText('Sigue un producto nuevo')).toBeInTheDocument();
    await waitFor(() => expect(calledPaths()).toEqual(expect.arrayContaining(['/api/products', '/api/summary', '/api/alerts'])));
    expect(await screen.findByText('Te avisamos por correo')).toBeInTheDocument();
    expect(nav.replaceLocation).not.toHaveBeenCalled();
  });

  it('los enlaces antiguos de los emails van a la ruta nueva', async () => {
    at('/?verify_token=abc123');
    render(<ProductsPage />);
    await waitFor(() => expect(nav.replaceLocation).toHaveBeenCalledWith('/verificar?token=abc123'));
    expect(calledPaths()).not.toContain('/api/auth/me');
  });
});

describe('cuenta', () => {
  it('tras entrar vuelve a la página que se quería abrir', async () => {
    routes['/api/auth/login'] = () => json(200, {user});
    at('/entrar?next=%2Falertas');
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email'), user.email);
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña larga');
    await userEvent.click(screen.getByRole('button', {name: 'Entrar'}));

    await waitFor(() => expect(nav.navigate).toHaveBeenCalledWith('/alertas', {replace: true}));
  });

  it('con 403 avisa de email sin verificar y deja reenviarlo (con el token de desarrollo)', async () => {
    routes['/api/auth/login'] = () => json(403, {detail: 'Tienes que verificar tu email antes de entrar.'});
    routes['/api/auth/resend-verification'] = () => json(200, {message: 'Te hemos enviado otro email.', debug_token: 'tok-dev'});
    at('/entrar');
    render(<LoginForm />);

    await userEvent.type(screen.getByLabelText('Email'), 'nuevo@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña larga');
    await userEvent.click(screen.getByRole('button', {name: 'Entrar'}));

    expect(await screen.findByText(/email está sin verificar/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Reenviar email de verificación'}));

    expect(await screen.findByText('tok-dev')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Verificar ahora'})).toHaveAttribute('href', '/verificar?token=tok-dev');
    expect(nav.navigate).not.toHaveBeenCalled();
  });

  it('con 401 enseña el error sin intentar renovar la sesión', async () => {
    routes['/api/auth/login'] = () => json(401, {detail: 'Email o contraseña incorrectos.'});
    at('/entrar');
    render(<LoginForm />);
    await userEvent.type(screen.getByLabelText('Email'), user.email);
    await userEvent.type(screen.getByLabelText('Contraseña'), 'otra contraseña');
    await userEvent.click(screen.getByRole('button', {name: 'Entrar'}));

    expect(await screen.findByText('Email o contraseña incorrectos.')).toBeInTheDocument();
    expect(nav.replaceLocation).not.toHaveBeenCalled();
  });

  it('/verificar?token= verifica sola, una sola vez', async () => {
    routes['/api/auth/verify-email'] = () => json(200, {message: 'Email verificado correctamente.'});
    at('/verificar?token=abc123');
    const {unmount} = render(<VerifyCard />);

    expect(await screen.findByRole('heading', {name: 'Email verificado'})).toBeInTheDocument();
    unmount();
    render(<VerifyCard />);
    await screen.findByRole('heading', {name: 'Email verificado'});

    const calls = fetchMock.mock.calls.filter(([input]) => String(input) === '/api/auth/verify-email');
    expect(calls).toHaveLength(1);
    expect(calls[0][1]?.body).toBe(JSON.stringify({token: 'abc123'}));
  });

  it('/restablecer sin token explica qué hacer', () => {
    at('/restablecer');
    render(<ResetForm />);
    expect(screen.getByText(/falta el código/)).toBeInTheDocument();
  });

  it('/restablecer?token= pide la contraseña nueva', () => {
    at('/restablecer?token=xyz');
    render(<ResetForm />);
    expect(screen.getByRole('heading', {name: 'Elige una contraseña nueva'})).toBeInTheDocument();
    expect(screen.getByLabelText('Contraseña nueva')).toBeInTheDocument();
  });
});
