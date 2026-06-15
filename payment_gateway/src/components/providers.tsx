'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import api, { setCsrfToken } from '../services/api';

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
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string, captchaId?: string, captchaValue?: string) => Promise<any>;
  register: (name: string, email: string, password: string, confirmPassword: string, captchaId: string, captchaValue: string, role?: string) => Promise<any>;
  logout: () => Promise<void>;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Authentication state provider wrapping local Cookie Session lifecycle checks
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Attempt to recover existing user session on browser page mount
  useEffect(() => {
    async function restoreSession() {
      try {
        const res = await api.get('/auth/me');
        if (res.data) {
          setUser(res.data);
          setCsrfToken(res.data.csrfToken);
        }
      } catch (err: any) {
        if (err.response?.status !== 401) {
          console.error('Failed to restore session:', err);
        }
        // Clear any old csrf configuration
        setCsrfToken(null);
        setUser(null);
      } finally {
        setIsLoading(false);
      }
    }
    restoreSession();
  }, []);

  // Post login credentials and save CSRF token in Axios memory
  const login = async (email: string, password: string, captchaId?: string, captchaValue?: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/login', { email, password, captchaId, captchaValue });
      const { user: userData, csrfToken } = res.data;
      setCsrfToken(csrfToken);
      setUser(userData);
      queryClient.clear(); // Flush cache on new session login
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  // Submit candidate registration
  const register = async (name: string, email: string, password: string, confirmPassword: string, captchaId: string, captchaValue: string) => {
    setIsLoading(true);
    try {
      const res = await api.post('/auth/register', { name, email, password, confirmPassword, captchaId, captchaValue });
      const { user: userData, csrfToken } = res.data;
      setCsrfToken(csrfToken);
      setUser(userData);
      queryClient.clear(); // Flush cache on new session registration
      return res.data;
    } finally {
      setIsLoading(false);
    }
  };

  // Post logout request, clear CSRF token, and reset auth state
  const logout = async () => {
    setIsLoading(true);
    try {
      await api.post('/auth/logout');
    } catch (err) {
      console.error('Error during backend logout endpoint call:', err);
    } finally {
      setCsrfToken(null);
      setUser(null);
      queryClient.clear(); // Flush old query cache to avoid data leaks
      setIsLoading(false);
    }
  };

  // Refresh current user information (useful after updating password or settings)
  const refreshMe = async () => {
    try {
      const res = await api.get('/auth/me');
      setUser(res.data);
      setCsrfToken(res.data.csrfToken);
    } catch (err) {
      setCsrfToken(null);
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
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
