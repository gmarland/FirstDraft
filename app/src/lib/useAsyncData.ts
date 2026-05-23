import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { useAuth } from "./auth";

type AsyncData<T> = {
  data: T | null;
  error: string | null;
  loading: boolean;
  refresh(): Promise<void>;
  setData(next: T | null | ((current: T | null) => T | null)): void;
};

export function useAsyncData<T>(load: () => Promise<T>, deps: unknown[], pollMs?: number): AsyncData<T> {
  const { logout } = useAuth();
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      setError(null);
      const next = await load();
      setData(next);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 401) {
        logout();
        return;
      }

      setError(caught instanceof Error ? caught.message : "Request failed");
    } finally {
      setLoading(false);
    }
  }, [load, logout]);

  useEffect(() => {
    setLoading(true);
    void refresh();
  }, deps);

  useEffect(() => {
    if (!pollMs) return;
    const id = window.setInterval(() => void refresh(), pollMs);
    return () => window.clearInterval(id);
  }, [pollMs, refresh]);

  return { data, error, loading, refresh, setData };
}
