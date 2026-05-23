import { ReactNode, useEffect } from "react";
import { useAuthStore } from "../stores/authStore";

export function AuthProvider({ children }: { children: ReactNode }) {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
  }, [initialize]);

  return <>{children}</>;
}

export const useAuth = useAuthStore;
