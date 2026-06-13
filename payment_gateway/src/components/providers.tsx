'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api from '../services/api';

// 1. Initialize TanStack Query Client for local data-fetching caching state
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Turn off refetching on click-away window refocus
      retry: 1, // Only retry failed requests once before presenting error toast to user
      staleTime: 1000 * 60 * 5, // Cache entries are valid for 5 minutes before marked stale
    },
  },
});

interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'user';
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<any>;
  register: (name: string, email: string, password: string, role?: string) => Promise<any>;
  logout: () => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Authentication state provider wrapping local JWT lifecycle checks
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Attempt to recover existing user session on browser page mount
  useEffect(() => {
    async function restoreSession() {
      const savedToken = localStorage.getItem('regilly_pg_token');
      if (savedToken) {
        setToken(savedToken);
        try {
          const res = await api.get('/auth/me');
          setUser(res.data);
        } catch (err) {
          console.error('Failed to restore session:', err);
          logout(); // Clean invalid session items if token expired
        }
      }
      setIsLoading(false);
    }
    restoreSession();
  }, []);

  // Post login credentials and save JWT token
  const login = async (email: string, password: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password });
      const { access_token, user: userData } = res.data;
      localStorage.setItem('regilly_pg_token', access_token);
      setToken(access_token);
      setUser(userData);
      queryClient.clear(); // Flush cache on new session login
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  // Submit candidate registration
  const register = async (name: string, email: string, password: string, role?: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/register', { name, email, password, role });
      const { access_token, user: userData } = res.data;
      localStorage.setItem('regilly_pg_token', access_token);
      setToken(access_token);
      setUser(userData);
      queryClient.clear(); // Flush cache on new session registration
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  // Clear local storage and reset auth state
  const logout = () => {
    localStorage.removeItem('regilly_pg_token');
    setToken(null);
    setUser(null);
    queryClient.clear(); // Flush old query cache to avoid data leaks
  };

  // Refresh current user information (useful after updating password or settings)
  const refreshMe = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
    } catch (err) {
      logout();
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        isAuthenticated: !!token,
        isLoading,
        login,
        register,
        logout,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// React context hook helper
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

// Wrap all providers under one root component
export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>{children}</AuthProvider>
    </QueryClientProvider>
  );
}
