import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/authToken";

// ─── Auth header helper ───────────────────────────────────────────────────────
export function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const token = getAccessToken();
  return {
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...extra,
  };
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    throw new Error(`${res.status}: ${text}`);
  }
}

/**
 * The sentence a person should read, pulled out of an apiRequest failure.
 *
 * Errors carry the whole response body so callers can inspect it, which meant
 * a venue posting a flash deal on blocked dates was shown
 * `409: {"message":"Those dates are blocked...","conflicts":[...]}` — the
 * server's explanation was in there, wrapped in JSON nobody should have to
 * read.
 */
export function readableError(error: unknown, fallback = "Something went wrong"): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (!raw) return fallback;

  // apiRequest formats failures as "<status>: <body>".
  const body = raw.replace(/^\d{3}:\s*/, "").trim();
  try {
    const parsed = JSON.parse(body);
    const message = parsed?.message ?? parsed?.error;
    if (typeof message === "string" && message.trim()) return message.trim();
  } catch {
    // Not JSON — the body was already a sentence.
  }
  return body || fallback;
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown,
): Promise<Response> {
  try {
    const res = await fetch(url, {
      method,
      headers: data
        ? authHeaders({ "Content-Type": "application/json" })
        : authHeaders(),
      body: data ? JSON.stringify(data) : undefined,
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    if (error instanceof TypeError) {
      console.error(`Network error on ${method} ${url}:`, error.message);
      throw new Error(
        "Network error: Unable to connect to server. Please check your connection.",
      );
    }
    throw error;
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";

/**
 * The address a query key stands for. The parts are joined with "/", and a
 * plain object at the end becomes the query string, so
 * ["/api/admin/drafts", { city: "Amsterdam" }] fetches
 * /api/admin/drafts?city=Amsterdam while ["/api/admin/drafts"] still matches
 * it when the list is refreshed.
 */
export function urlForQueryKey(queryKey: readonly unknown[]): string {
  const last = queryKey[queryKey.length - 1];
  const hasParams = !!last && typeof last === "object" && !Array.isArray(last);
  const path = (hasParams ? queryKey.slice(0, -1) : queryKey).join("/");
  if (!hasParams) return path;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(last as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `${path}${path.includes("?") ? "&" : "?"}${query}` : path;
}
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const res = await fetch(urlForQueryKey(queryKey), {
        headers: authHeaders(),
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      if (error instanceof TypeError) {
        console.error(
          `Network error on GET ${urlForQueryKey(queryKey)}:`,
          error.message,
        );
        throw new Error(
          "Network error: Unable to connect to server. Please check your connection.",
        );
      }
      throw error;
    }
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
