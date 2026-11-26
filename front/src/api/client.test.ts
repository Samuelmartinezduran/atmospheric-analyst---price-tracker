import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  api,
  ApiError,
  CSRF_HEADER_NAME,
  NETWORK_MESSAGE,
  request,
  SESSION_EXPIRED_MESSAGE,
  setSessionExpiredHandler,
  VALIDATION_MESSAGE,
} from './client';

function json(status: number, body?: unknown): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: {'Content-Type': 'application/json'},
  });
}

type FetchArgs = [input: RequestInfo | URL, init?: RequestInit];

function headerOf(call: FetchArgs, name: string): string | null {
  return new Headers(call[1]?.headers).get(name);
}

function urlOf(call: FetchArgs): string {
  return String(call[0]);
}

let fetchMock: ReturnType<typeof vi.fn<(...args: FetchArgs) => Promise<Response>>>;

beforeEach(() => {
  fetchMock = vi.fn<(...args: FetchArgs) => Promise<Response>>();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  setSessionExpiredHandler(null);
  document.cookie = 'csrf_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/';
});

describe('cabecera CSRF', () => {
  it('envía X-CSRF-Token con el valor de la cookie en las mutaciones', async () => {
    document.cookie = 'csrf_token=abc123; path=/';
    fetchMock.mockImplementation(async () => json(200, {ok: true}));

    await api('/api/products', {method: 'POST', body: {url: 'x', desired_price: 1}});
    await api('/api/products/1', {method: 'PATCH', body: {desired_price: 2}});
    await api('/api/products/1', {method: 'DELETE'});

    for (const call of fetchMock.mock.calls) {
      expect(headerOf(call, CSRF_HEADER_NAME)).toBe('abc123');
      expect(call[1]?.credentials).toBe('include');
    }
  });

  it('no la envía en los GET', async () => {
    document.cookie = 'csrf_token=abc123; path=/';
    fetchMock.mockResolvedValue(json(200, []));

    await api('/api/products');

    expect(headerOf(fetchMock.mock.calls[0], CSRF_HEADER_NAME)).toBeNull();
  });

  it('usa rutas relativas y serializa el cuerpo como JSON', async () => {
    fetchMock.mockResolvedValue(json(201, {id: 1}));

    const {status} = await request('/api/products', {method: 'POST', body: {url: 'u', desired_price: 9.5}});

    const call = fetchMock.mock.calls[0];
    expect(urlOf(call)).toBe('/api/products');
    expect(call[1]?.body).toBe(JSON.stringify({url: 'u', desired_price: 9.5}));
    expect(headerOf(call, 'Content-Type')).toBe('application/json');
    expect(status).toBe(201);
  });
});

describe('renovación de sesión en 401', () => {
  it('renueva una vez y repite la petición', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401, {detail: 'No autenticado'}))
      .mockResolvedValueOnce(json(200, {user: {}})) // /refresh
      .mockResolvedValueOnce(json(200, [{id: 1}]));

    const data = await api<unknown[]>('/api/products');

    expect(data).toEqual([{id: 1}]);
    expect(fetchMock.mock.calls.map(urlOf)).toEqual(['/api/products', '/api/auth/refresh', '/api/products']);
  });

  it('con varias peticiones a la vez hace una sola renovación', async () => {
    let resolveRefresh: (value: Response) => void = () => {};
    const refreshPending = new Promise<Response>((resolve) => {
      resolveRefresh = resolve;
    });
    const firstAttempt = new Set<string>();
    fetchMock.mockImplementation((input) => {
      const url = String(input);
      if (url === '/api/auth/refresh') return refreshPending;
      if (!firstAttempt.has(url)) {
        firstAttempt.add(url);
        return Promise.resolve(json(401, {detail: 'No autenticado'}));
      }
      return Promise.resolve(json(200, {url}));
    });

    const pending = Promise.all([api('/api/products'), api('/api/alerts'), api('/api/auth/me')]);
    await vi.waitFor(() => expect(fetchMock.mock.calls.filter((c) => urlOf(c) === '/api/auth/refresh')).toHaveLength(1));
    resolveRefresh(json(200, {user: {}}));
    const results = await pending;

    expect(results).toEqual([{url: '/api/products'}, {url: '/api/alerts'}, {url: '/api/auth/me'}]);
    expect(fetchMock.mock.calls.filter((c) => urlOf(c) === '/api/auth/refresh')).toHaveLength(1);
  });

  it('si la renovación falla avisa de sesión caducada y lanza 401', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValueOnce(json(401, {detail: 'No autenticado'})).mockResolvedValueOnce(json(401, {detail: 'x'}));

    const error = await api('/api/products').catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
    expect((error as ApiError).message).toBe(SESSION_EXPIRED_MESSAGE);
    expect(onExpired).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('no repite en bucle si la petición repetida vuelve a dar 401', async () => {
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockResolvedValueOnce(json(200, {user: {}}))
      .mockResolvedValueOnce(json(401));

    await expect(api('/api/products')).rejects.toMatchObject({status: 401});
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('en las rutas públicas (auth: false) un 401 no intenta renovar', async () => {
    const onExpired = vi.fn();
    setSessionExpiredHandler(onExpired);
    fetchMock.mockResolvedValueOnce(json(401, {detail: 'Email o contraseña incorrectos.'}));

    await expect(api('/api/auth/login', {method: 'POST', body: {}, auth: false})).rejects.toMatchObject({
      status: 401,
      message: 'Email o contraseña incorrectos.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it('la petición repetida lleva la cookie CSRF nueva que deja /refresh', async () => {
    document.cookie = 'csrf_token=viejo; path=/';
    fetchMock
      .mockResolvedValueOnce(json(401))
      .mockImplementationOnce(async () => {
        document.cookie = 'csrf_token=nuevo; path=/';
        return json(200, {user: {}});
      })
      .mockResolvedValueOnce(json(200, {}));

    await api('/api/products/1/check', {method: 'POST'});

    const [first, refresh, retry] = fetchMock.mock.calls;
    expect(headerOf(first, CSRF_HEADER_NAME)).toBe('viejo');
    expect(headerOf(refresh, CSRF_HEADER_NAME)).toBe('viejo');
    expect(headerOf(retry, CSRF_HEADER_NAME)).toBe('nuevo');
  });
});

describe('errores tipados', () => {
  it('usa el detail en texto del backend', async () => {
    fetchMock.mockResolvedValueOnce(json(400, {detail: 'URL no soportada.'}));
    await expect(api('/api/products', {method: 'POST', body: {}})).rejects.toMatchObject({
      status: 400,
      message: 'URL no soportada.',
    });
  });

  it('con un 422 (detail en lista) muestra un mensaje genérico', async () => {
    fetchMock.mockResolvedValueOnce(
      json(422, {detail: [{loc: ['body', 'desired_price'], msg: 'Input should be greater than 0', type: 'greater_than'}]}),
    );
    const error = (await api('/api/products', {method: 'POST', body: {}}).catch((e: unknown) => e)) as ApiError;
    expect(error.message).toBe(VALIDATION_MESSAGE);
    expect(error.isValidation).toBe(true);
    expect(Array.isArray(error.detail)).toBe(true);
  });

  it('distingue el 409', async () => {
    fetchMock.mockResolvedValueOnce(json(409, {detail: 'Ya se está comprobando este producto.'}));
    await expect(api('/api/products/1/check', {method: 'POST'})).rejects.toMatchObject({status: 409});
  });

  it('sin conexión lanza un ApiError con estado 0', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    await expect(api('/api/products')).rejects.toMatchObject({status: 0, message: NETWORK_MESSAGE});
  });

  it('un 204 devuelve undefined', async () => {
    fetchMock.mockResolvedValueOnce(new Response(null, {status: 204}));
    await expect(api('/api/products/1', {method: 'DELETE'})).resolves.toBeUndefined();
  });

  it('un 500 sin detail da un mensaje en español', async () => {
    fetchMock.mockResolvedValueOnce(new Response('Internal Server Error', {status: 500}));
    await expect(api('/api/products')).rejects.toMatchObject({
      status: 500,
      message: 'El servidor ha tenido un problema. Inténtalo de nuevo dentro de un rato.',
    });
  });
});
