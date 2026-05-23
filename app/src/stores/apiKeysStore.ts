import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import { useAuthStore } from "./authStore";
import type { CreatedApiKey, ApiKey } from "../types/api";

type ApiKeysStore = {
  keys: ApiKey[] | null;
  loading: boolean;
  error: string | null;
  actionError: string | null;
  createdKey: CreatedApiKey | null;
  loadKeys(): Promise<void>;
  createKey(input: { name?: string }): Promise<void>;
  revokeKey(keyId: string): Promise<void>;
  clearCreatedKey(): void;
};

export const useApiKeysStore = create<ApiKeysStore>((set, get) => ({
  keys: null,
  loading: true,
  error: null,
  actionError: null,
  createdKey: null,

  async loadKeys() {
    const token = requireToken();

    set({ error: null });
    try {
      set({ keys: await api.listApiKeys(token) });
    } catch (caught) {
      handleAuthError(caught);
      set({ error: caught instanceof Error ? caught.message : "Unable to load API keys" });
    } finally {
      set({ loading: false });
    }
  },

  async createKey(input) {
    const token = requireToken();

    set({ actionError: null });
    try {
      const created = await api.createApiKey(token, input);
      set({ createdKey: created, keys: [created, ...(get().keys ?? [])] });
    } catch (caught) {
      handleAuthError(caught);
      set({ actionError: caught instanceof Error ? caught.message : "Unable to create API key" });
      throw caught;
    }
  },

  async revokeKey(keyId) {
    const token = requireToken();

    set({ actionError: null });
    try {
      const revoked = await api.revokeApiKey(token, keyId);
      set({ keys: (get().keys ?? []).map((key) => (key.keyId === keyId ? revoked : key)) });
    } catch (caught) {
      handleAuthError(caught);
      set({ actionError: caught instanceof Error ? caught.message : "Unable to revoke API key" });
    }
  },

  clearCreatedKey() {
    set({ createdKey: null });
  },
}));

function requireToken(): string {
  const token = useAuthStore.getState().token;
  if (!token) {
    throw new Error("Not authenticated");
  }

  return token;
}

function handleAuthError(caught: unknown): void {
  if (caught instanceof ApiError && caught.status === 401) {
    useAuthStore.getState().logout();
  }
}
