import { create } from "zustand";
import { api, ApiError } from "../lib/api";
import type { LoginResponse, User } from "../types/api";

type LoginInput = {
  email: string;
  password: string;
};

type SignupInput = LoginInput & {
  name?: string;
};

type AuthStore = {
  token: string | null;
  user: User | null;
  ready: boolean;
  initialize(): Promise<void>;
  login(input: LoginInput): Promise<void>;
  googleLogin(credential: string): Promise<void>;
  signup(input: SignupInput): Promise<void>;
  googleSignup(credential: string): Promise<void>;
  logout(): void;
};

const STORAGE_KEY = "firstdraft.auth";
let initializePromise: Promise<void> | null = null;

export const useAuthStore = create<AuthStore>((set, get) => ({
  token: null,
  user: null,
  ready: false,

  async initialize() {
    if (get().ready) return;
    if (initializePromise) return initializePromise;

    initializePromise = initializeAuth(set);
    return initializePromise;
  },

  async login(input) {
    const response = await api.login(input);
    setAuthenticated(response, set);
  },

  async googleLogin(credential) {
    const response = await api.googleLogin({ credential });
    setAuthenticated(response, set);
  },

  async signup(input) {
    const response = await api.signup(input);
    setAuthenticated(response, set);
  },

  async googleSignup(credential) {
    const response = await api.googleSignup({ credential });
    setAuthenticated(response, set);
  },

  logout() {
    clearStoredAuth();
    set({ token: null, user: null });
  },
}));

function setAuthenticated(
  response: LoginResponse,
  set: (state: Partial<AuthStore>) => void,
): void {
  set({ token: response.token, user: response.user });
  writeStoredAuth({ token: response.token, user: response.user });
}

async function initializeAuth(
  set: (state: Partial<AuthStore>) => void,
): Promise<void> {
  const stored = readStoredAuth();
  if (!stored) {
    set({ ready: true });
    return;
  }

  set({ token: stored.token, user: stored.user });
  try {
    const { user } = await api.me(stored.token);
    set({ user, ready: true });
    writeStoredAuth({ token: stored.token, user });
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) {
      clearStoredAuth();
      set({ token: null, user: null, ready: true });
      return;
    }

    set({ ready: true });
  }
}

function readStoredAuth(): Pick<LoginResponse, "token" | "user"> | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Pick<LoginResponse, "token" | "user">;
    if (!parsed.token || !parsed.user) return null;
    if (!localStorage.getItem(STORAGE_KEY)) {
      localStorage.setItem(STORAGE_KEY, raw);
    }
    return parsed;
  } catch {
    return null;
  }
}

function writeStoredAuth(value: Pick<LoginResponse, "token" | "user">): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(value));
}

function clearStoredAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}
