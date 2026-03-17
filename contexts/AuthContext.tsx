
import React, { createContext, useContext, useState, useEffect } from 'react';

export type Role = 'ADMIN' | 'USER';

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId?: string | null;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, pass: string, remember: boolean) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Removed MOCK DB as we are now using real backend API

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Check both storages
    const storedUser = localStorage.getItem('session_user') || sessionStorage.getItem('session_user');
    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }
    setIsLoading(false);
  }, []);

  const login = async (email: string, pass: string, remember: boolean): Promise<boolean> => {
    try {
      const response = await fetch('/api/users/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password: pass }),
      });

      if (response.ok) {
        const foundUser = await response.json();
        
        const sessionUser = {
          id: foundUser.id,
          email: foundUser.email,
          name: foundUser.name,
          role: foundUser.role,
          companyId: foundUser.companyId, // Include companyId if present
        };
        
        setUser(sessionUser);
        
        if (remember) {
          localStorage.setItem('session_user', JSON.stringify(sessionUser));
        } else {
          sessionStorage.setItem('session_user', JSON.stringify(sessionUser));
        }
        return true;
      }
      return false;
    } catch (error) {
      console.error('Login error:', error);
      return false;
    }
  };

  const logout = () => {
    setUser(null);
    localStorage.removeItem('session_user');
    sessionStorage.removeItem('session_user');
  };

  return (
    <AuthContext.Provider value={{ 
      user, 
      isAuthenticated: !!user, 
      login, 
      logout,
      isLoading 
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
