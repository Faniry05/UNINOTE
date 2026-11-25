export class ApiError extends Error {
  status: number;
  details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.details = details;
  }
}

type UnauthorizedListener = () => void;

class CentralizedApiClient {
  private token: string | null = null;
  private onUnauthorized: UnauthorizedListener | null = null;

  setToken(token: string | null): void {
    this.token = token;
  }

  getToken(): string | null {
    return this.token;
  }

  setUnauthorizedHandler(handler: UnauthorizedListener | null): void {
    this.onUnauthorized = handler;
  }

  async request<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers = new Headers(options.headers);
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    if (this.token) {
      headers.set('Authorization', `Bearer ${this.token}`);
    }

    const response = await fetch(`/api${path}`, {
      ...options,
      headers,
    });

    let payload: unknown = null;
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      payload = await response.json();
    }

    if (!response.ok) {
      if (response.status === 401 && this.onUnauthorized && !path.startsWith('/auth/login')) {
        this.onUnauthorized();
      }
      const message =
        typeof payload === 'object' &&
        payload !== null &&
        'error' in payload &&
        typeof (payload as { error: unknown }).error === 'string'
          ? (payload as { error: string }).error
          : `Erreur serveur (${response.status})`;
      throw new ApiError(message, response.status, payload);
    }

    return payload as T;
  }

  get<T>(path: string, query?: Record<string, string | number | boolean | undefined>): Promise<T> {
    const search = new URLSearchParams();
    if (query) {
      for (const [key, val] of Object.entries(query)) {
        if (val !== undefined && val !== '') {
          search.set(key, String(val));
        }
      }
    }
    const qs = search.toString();
    return this.request<T>(qs ? `${path}?${qs}` : path, { method: 'GET' });
  }

  post<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  patch<T>(path: string, body?: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'PATCH',
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }
}

export const apiClient = new CentralizedApiClient();
