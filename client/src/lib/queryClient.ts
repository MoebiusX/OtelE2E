import { QueryClient, QueryFunction } from '@tanstack/react-query';

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
  customHeaders?: Record<string, string>,
): Promise<Response> {
  const headers = {
    ...(data ? { 'Content-Type': 'application/json' } : {}),
    ...(customHeaders || {}),
  };

  // All API requests go through Kong Gateway:
  // - If client provides traceparent → Kong preserves and propagates it
  // - If no traceparent → Kong creates new trace context
  const KONG_URL = 'http://localhost:8000';

  let targetUrl = url;
  if (url.startsWith('/api')) {
    targetUrl = `${KONG_URL}${url}`;
  }

  const res = await fetch(targetUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: 'same-origin',
    cache: 'no-cache',
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = 'returnNull' | 'throw';
export const getQueryFn: <T>(options: { on401: UnauthorizedBehavior }) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey[0] as string;

    // Route all /api requests through Kong Gateway
    const KONG_URL = 'http://localhost:8000';
    const targetUrl = url.startsWith('/api') ? `${KONG_URL}${url}` : url;

    const res = await fetch(targetUrl, {
      credentials: 'same-origin',
      cache: 'no-cache',
    });

    if (unauthorizedBehavior === 'returnNull' && res.status === 401) {
      return null;
    }

    await throwIfResNotOk(res);
    return await res.json();
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: 'throw' }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});
