"use client";
import { getSession } from "../auth/auth-service";
import { createV2ApiClient } from "./v2-client";

// Pin a mounted domain to its user without caching tokens. T06 still owns sessions.
export function createSessionClient(expectedUserId: string) {
  return createV2ApiClient({
    tokenSupplier: async () => {
      const result = await getSession();
      if (result.error) return { data: null, error: result.error };
      return { data: result.data?.user.id === expectedUserId ? result.data.access_token : null, error: null };
    },
  });
}
