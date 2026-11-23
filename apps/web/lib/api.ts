/** Browser-side JSON fetch to the API (same origin via Next rewrites). */
/** Fired on the window after any successful write through `api()`. */
export const DATA_CHANGED = 'sugami:data-changed';

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  const res = await fetch(`/api${path}`, {
    credentials: 'same-origin',
    headers: {
      Accept: 'application/json',
      ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...headers,
    },
    body: json !== undefined ? JSON.stringify(json) : init.body,
    ...rest,
  });
  const wrote = res.ok && (rest.method ?? 'GET').toUpperCase() !== 'GET';
  // Something changed on the server: lets the menu numbers refresh right away instead of on their timer.
  if (wrote && typeof window !== 'undefined') window.dispatchEvent(new Event(DATA_CHANGED));
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => ({}))) as { message?: string | string[] };
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message.join('; ') : body.message;
    throw new ApiError(msg ?? `Lỗi ${res.status}`, res.status);
  }
  return body as T;
}
