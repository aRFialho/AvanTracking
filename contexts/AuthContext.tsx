import React, { createContext, useContext, useState, useEffect } from "react";

export type Role = "ADMIN" | "USER" | "ADMIN_SUPER";
export type AuthModule = "avantracking" | "logisync";

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId?: string | null;
  module?: AuthModule;
  isSuperAdmin?: boolean;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (
    email: string,
    pass: string,
    remember: boolean,
    module?: AuthModule,
  ) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
  token: string | null;
  setUser: (user: User | null, token?: string) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Removed MOCK DB as we are now using real backend API

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check both storages
    const storedUser =
      localStorage.getItem("session_user") ||
      sessionStorage.getItem("session_user");
    const storedToken =
      localStorage.getItem("session_token") ||
      sessionStorage.getItem("session_token");
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    if (storedToken) {
      setToken(storedToken);
    }
    setIsLoading(false);
  }, []);

  useEffect(() => {
    const handleExpiredSession = () => {
      setUser(null);
      setToken(null);
      localStorage.removeItem("session_user");
      localStorage.removeItem("session_token");
      sessionStorage.removeItem("session_user");
      sessionStorage.removeItem("session_token");
    };

    window.addEventListener("auth:expired", handleExpiredSession);

    return () => {
      window.removeEventListener("auth:expired", handleExpiredSession);
    };
  }, []);

  const login = async (
    email: string,
    pass: string,
    remember: boolean,
    module: AuthModule = "avantracking",
  ): Promise<boolean> => {
    try {
      const response = await fetch("/api/users/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password: pass, module }),
      });

      if (response.ok) {
        const data = await response.json();

        const sessionUser = {
          id: data.id,
          email: data.email,
          name: data.name,
          role: data.role as Role,
          companyId: data.companyId,
          module: (data.module || module || "avantracking") as AuthModule,
          isSuperAdmin: Boolean(data.isSuperAdmin),
        };

        setUser(sessionUser);
        setToken(data.token); // Guardar o token

        if (remember) {
          localStorage.setItem("session_user", JSON.stringify(sessionUser));
          localStorage.setItem("session_token", data.token);
        } else {
          sessionStorage.setItem("session_user", JSON.stringify(sessionUser));
          sessionStorage.setItem("session_token", data.token);
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    setToken(null);
    localStorage.removeItem("session_user");
    localStorage.removeItem("session_token");
    sessionStorage.removeItem("session_user");
    sessionStorage.removeItem("session_token");
  };

  const handleSetUser = (newUser: User | null, newToken?: string) => {
    setUser(newUser);
    if (newToken) {
      setToken(newToken);
      // Guardar no storage
      const storage = localStorage.getItem("session_user")
        ? localStorage
        : sessionStorage;
      storage.setItem("session_token", newToken);
      if (newUser) {
        storage.setItem("session_user", JSON.stringify(newUser));
      }
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        login,
        logout,
        isLoading,
        token,
        setUser: handleSetUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
};
