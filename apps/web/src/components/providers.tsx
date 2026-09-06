"use client";
import {
  AuthKitProvider,
  useAuth,
  useAccessToken,
} from "@workos-inc/authkit-nextjs/components";
import { ConvexReactClient, ConvexProviderWithAuth } from "convex/react";
import { useCallback, useState } from "react";
function useWorkOSAuth() {
  const { user, loading } = useAuth();
  const { getAccessToken, refresh } = useAccessToken();
  const fetchAccessToken = useCallback(
    async ({ forceRefreshToken }: { forceRefreshToken: boolean }) => {
      try {
        return (
          (forceRefreshToken ? await refresh() : await getAccessToken()) ?? null
        );
      } catch {
        return null;
      }
    },
    [getAccessToken, refresh],
  );
  return { isLoading: loading, isAuthenticated: !!user, fetchAccessToken };
}
export function Providers({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () => new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!),
  );
  return (
    <AuthKitProvider>
      <ConvexProviderWithAuth client={client} useAuth={useWorkOSAuth}>
        {children}
      </ConvexProviderWithAuth>
    </AuthKitProvider>
  );
}
