import { QueryClient, QueryFunction } from "@tanstack/react-query";

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
    ...(data ? { "Content-Type": "application/json" } : {}),
    ...(customHeaders || {}),
  };

  // Conditional Routing based on User Requirements:
  // 1. If NO trace headers are present -> Route to Kong (8000) for Context Injection.
  // 2. If trace headers ARE present -> Route directly to Backend (5000), bypassing Kong.

  const hasTraceHeaders = customHeaders && (
    'x-trace-id' in customHeaders ||
    'traceparent' in customHeaders
  );

  const KONG_URL = 'http://localhost:8000';

  // Default to direct backend routing
  let targetUrl = url;

  if (url.startsWith('/api') && !hasTraceHeaders) {
    // No headers -> Send to Kong for injection
    targetUrl = `${KONG_URL}${url}`;
  }
  // Else -> Keep as relative (direct to backend 5000)

  const res = await fetch(targetUrl, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
    credentials: "same-origin",
    cache: "no-cache",
  });

  await throwIfResNotOk(res);
  return res;
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
    async ({ queryKey }) => {
      const res = await fetch(queryKey[0] as string, {
        credentials: "same-origin",
        cache: "no-cache",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
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
