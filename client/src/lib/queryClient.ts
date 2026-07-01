import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { getAccessToken } from "@/lib/authToken";

// ─── Auth header helper ───────────────────────────────────────────────────────
function authHeaders(extra?: Record<string, string>): Record<string, string> {
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
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    try {
      const res = await fetch(queryKey.join("/") as string, {
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
          `Network error on GET ${queryKey.join("/")}:`,
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
