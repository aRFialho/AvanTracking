
import React, { createContext, useContext, useState, useEffect } from 'react';

export type Role = 'ADMIN' | 'USER';

interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
}

interface AuthContextType {
  user: User | null;
  isAuthenticated: boolean;
  login: (email: string, pass: string, remember: boolean) => Promise<boolean>;
  logout: () => void;
  isLoading: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// MOCK DB - Updated Credentials
const MOCK_DB_USERS = [
  { id: '1', email: 'admin@autrack.com.br', pass: 'Alfenas@172839', name: 'Admin', role: 'ADMIN' as Role },
];

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
    // Simulate API delay
    await new Promise(r => setTimeout(r, 1000));

    const foundUser = MOCK_DB_USERS.find(u => u.email === email && u.pass === pass);
    
    if (foundUser) {
      const sessionUser = {
        id: foundUser.id,
        email: foundUser.email,
        name: foundUser.name,
        role: foundUser.role
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
