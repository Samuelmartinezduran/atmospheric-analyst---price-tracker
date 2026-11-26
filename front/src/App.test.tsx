import {render, screen, waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter} from 'react-router';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {AppProviders, AppRoutes} from './App';

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

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppProviders>
        <AppRoutes />
      </AppProviders>
    </MemoryRouter>,
  );
}

beforeEach(() => {
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
});

describe('enlaces antiguos de los emails', () => {
  it('/?verify_token=X abre /verificar y verifica sola', async () => {
    routes['/api/auth/verify-email'] = () => json(200, {message: 'Email verificado correctamente.'});

    renderAt('/?verify_token=abc123');

    expect(await screen.findByRole('heading', {name: 'Email verificado'})).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([input]) => String(input) === '/api/auth/verify-email');
    expect(call?.[1]?.body).toBe(JSON.stringify({token: 'abc123'}));
    // La verificación se lanza una sola vez aunque el efecto se ejecute dos veces.
    expect(calledPaths().filter((p) => p === '/api/auth/verify-email')).toHaveLength(1);
  });

  it('/?reset_token=X abre /restablecer con el token', async () => {
    routes['/api/auth/reset-password'] = () => json(200, {message: 'ok'});

    renderAt('/?reset_token=xyz');

    expect(await screen.findByRole('heading', {name: 'Elige una contraseña nueva'})).toBeInTheDocument();
  });
});

describe('rutas privadas', () => {
  it('sin sesión, / lleva a /entrar sin pedir productos ni avisar de sesión caducada', async () => {
    renderAt('/');

    expect(await screen.findByRole('heading', {name: 'Iniciar sesión'})).toBeInTheDocument();
    expect(calledPaths()).not.toContain('/api/products');
    expect(screen.queryByText(/caducado/i)).not.toBeInTheDocument();
  });

  it('tras entrar vuelve a la página que se quería abrir', async () => {
    routes['/api/auth/login'] = () => json(200, {user});

    renderAt('/alertas');
    await screen.findByRole('heading', {name: 'Iniciar sesión'});

    await userEvent.type(screen.getByLabelText('Email'), user.email);
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña larga');
    await userEvent.click(screen.getByRole('button', {name: 'Entrar'}));

    expect(await screen.findByRole('heading', {name: 'Alertas', level: 1})).toBeInTheDocument();
    await waitFor(() => expect(calledPaths()).toContain('/api/alerts'));
  });

  it('con 403 al entrar ofrece reenviar la verificación y enseña el token de desarrollo', async () => {
    routes['/api/auth/login'] = () => json(403, {detail: 'Tienes que verificar tu email antes de entrar.'});
    routes['/api/auth/resend-verification'] = () => json(200, {message: 'Te hemos enviado otro email.', debug_token: 'tok-dev'});

    renderAt('/entrar');
    await screen.findByRole('heading', {name: 'Iniciar sesión'});
    await userEvent.type(screen.getByLabelText('Email'), 'nuevo@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'una contraseña larga');
    await userEvent.click(screen.getByRole('button', {name: 'Entrar'}));

    expect(await screen.findByText('Tienes que verificar tu email antes de entrar.')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', {name: 'Reenviar email de verificación'}));

    expect(await screen.findByText('tok-dev')).toBeInTheDocument();
    expect(screen.getByRole('link', {name: 'Verificar ahora'})).toHaveAttribute('href', '/verificar?token=tok-dev');
  });

  it('con sesión, / enseña el panel', async () => {
    routes['/api/auth/me'] = () => json(200, user);

    renderAt('/');

    expect(await screen.findByRole('heading', {name: 'Panel de precios'})).toBeInTheDocument();
    await waitFor(() => expect(calledPaths()).toContain('/api/products'));
  });
});
