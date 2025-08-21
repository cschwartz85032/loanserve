import { QueryClient, QueryFunction } from "@tanstack/react-query";

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    try {
      const errorData = await res.json();
      // Handle standardized error format
      if (errorData.success === false) {
        throw new Error(errorData.error || res.statusText);
      }
      // Handle old format
      if (errorData.error) {
        throw new Error(errorData.error);
      }
      throw new Error(JSON.stringify(errorData));
    } catch (e) {
      // If JSON parsing fails, fall back to text
      const text = await res.text();
      throw new Error(`${res.status}: ${text || res.statusText}`);
    }
  }
}

interface ApiRequestOptions extends Omit<RequestInit, 'body'> {
  body?: any;  // Allow any type for body, we'll handle stringification
}

export async function apiRequest(
  url: string,
  options?: ApiRequestOptions,
): Promise<Response> {
  // Check if body needs to be stringified
  let body = options?.body;
  if (body && typeof body !== 'string') {
    body = JSON.stringify(body);
  }
  
  const res = await fetch(url, {
    ...options,
    body,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
    credentials: "include",
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
    // Handle query key properly - first element is the URL, rest are params
    let url = queryKey[0] as string;
    
    // If there are additional params, handle them as query parameters
    if (queryKey.length > 1 && typeof queryKey[1] === 'object' && queryKey[1] !== null) {
      const params = queryKey[1] as Record<string, any>;
      const queryParams = new URLSearchParams();
      
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          queryParams.append(key, String(value));
        }
      });
      
      const queryString = queryParams.toString();
      if (queryString) {
        url += `?${queryString}`;
      }
    }
    
    const res = await fetch(url, {
      credentials: "include",
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
