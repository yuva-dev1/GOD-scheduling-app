import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import type { Role } from "../../config/roles";
import * as authApi from "../../services/authApi";
import { adminLogin as adminLoginApi } from "../../services/adminApi";
import type { AuthUser } from "../../types/auth";

const TOKEN_STORAGE_KEY = "kainkaryam_token";

interface AuthContextValue {
  user: AuthUser | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<string | null>;
  register: (
    email: string,
    password: string,
    role: Role,
  ) => Promise<string | null>;
  loginAsAdmin: (password: string) => Promise<string | null>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function readStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function storeToken(token: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage failures (private browsing, blocked storage, etc).
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const stored = readStoredToken();
    if (!stored) {
      setLoading(false);
      return;
    }
    authApi
      .fetchCurrentUser(stored)
      .then((result) => {
        if (result.success && result.user) {
          setToken(stored);
          setUser(result.user);
        } else {
          storeToken(null);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function login(email: string, password: string) {
    const result = await authApi.login(email, password);
    if (result.success && result.token && result.user) {
      storeToken(result.token);
      setToken(result.token);
      setUser(result.user);
      return null;
    }
    return result.message ?? "Login failed";
  }

  async function register(email: string, password: string, role: Role) {
    const result = await authApi.register(email, password, role);
    if (result.success && result.token && result.user) {
      storeToken(result.token);
      setToken(result.token);
      setUser(result.user);
      return null;
    }
    return result.message ?? "Registration failed";
  }

  async function loginAsAdmin(password: string) {
    const result = await adminLoginApi(password);
    if (result.success && result.token && result.user) {
      storeToken(result.token);
      setToken(result.token);
      setUser(result.user);
      return null;
    }
    return result.message ?? "Login failed";
  }

  function logout() {
    storeToken(null);
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, register, loginAsAdmin, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
