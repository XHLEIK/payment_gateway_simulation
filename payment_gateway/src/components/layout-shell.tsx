'use client';

import React, { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from './providers';
import { 
  LayoutDashboard, 
  Wallet, 
  History, 
  BarChart3, 
  ShieldAlert, 
  LogOut, 
  Loader2,
  Menu,
  X
} from 'lucide-react';
import Link from 'next/link';

interface LayoutShellProps {
  children: React.ReactNode;
}

export default function LayoutShell({ children }: LayoutShellProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);

  // Auth Guard: redirect to login if unauthenticated
  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router]);

  // Enforce admin routes security
  useEffect(() => {
    if (!isLoading && isAuthenticated && user && pathname.startsWith('/admin') && user.role !== 'admin') {
      router.push('/dashboard');
    }
  }, [user, isAuthenticated, isLoading, pathname, router]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-zinc-950">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-4" />
        <p className="text-zinc-400 text-sm font-medium animate-pulse">
          Securing Arunachal Pradesh Portal Session...
        </p>
      </div>
    );
  }

  const navItems = [
    { name: 'Dashboard', path: '/dashboard', icon: LayoutDashboard, role: 'all' },
    { name: 'Wallet', path: '/wallet', icon: Wallet, role: 'all' },
    { name: 'Transactions', path: '/transactions', icon: History, role: 'all' },
    { name: 'Analytics', path: '/analytics', icon: BarChart3, role: 'admin' },
    { name: 'Admin Control', path: '/admin', icon: ShieldAlert, role: 'admin' },
  ];

  const filteredNavItems = navItems.filter(
    (item) => item.role === 'all' || (user && user.role === item.role)
  );

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  return (
    <div className="flex-1 flex flex-col min-h-screen bg-zinc-950 text-zinc-100">
      {/* 1. Header Header */}
      <header className="h-16 border-b border-zinc-900 bg-zinc-950 sticky top-0 z-40 flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm text-white tracking-widest shadow-md">
              AP
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest leading-none">
                APPSC Gateway
              </span>
              <span className="text-sm font-extrabold text-zinc-200 tracking-tight">
                Arunachal Pradesh Portal
              </span>
            </div>
          </div>
        </div>

        {/* User profile dropdown trigger */}
        <div className="flex items-center gap-3.5">
          <div className="hidden sm:flex flex-col text-right">
            <span className="text-sm font-bold text-zinc-200">{user?.name}</span>
            <span className="text-xs font-medium text-indigo-400 uppercase tracking-wider leading-none">
              {user?.role} Role
            </span>
          </div>
          <div className="w-9 h-9 rounded-full bg-zinc-800 border border-zinc-700/50 flex items-center justify-center text-zinc-200 font-bold uppercase select-none">
            {user?.name?.charAt(0)}
          </div>
        </div>
      </header>

      <div className="flex-1 flex relative">
        {/* 2. Left Sidebar for Desktop */}
        <aside className="hidden md:flex flex-col w-64 border-r border-zinc-900 bg-zinc-950/40 p-4 shrink-0 justify-between">
          <div className="flex flex-col gap-1.5">
            {filteredNavItems.map((item) => {
              const active = pathname === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold transition-all ${
                    active
                      ? 'bg-indigo-600/10 text-indigo-400 border border-indigo-500/20'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/50 border border-transparent'
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  {item.name}
                </Link>
              );
            })}
          </div>

          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-semibold text-zinc-500 hover:text-red-400 hover:bg-red-500/5 border border-transparent hover:border-red-500/10 transition-all cursor-pointer mt-8"
          >
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </aside>

        {/* 3. Mobile Navigation Menu Overlay */}
        {mobileMenuOpen && (
          <div className="fixed inset-0 top-16 bg-zinc-950/90 backdrop-blur-sm z-30 md:hidden flex flex-col p-6 animate-fade-in justify-between">
            <div className="flex flex-col gap-2">
              {filteredNavItems.map((item) => {
                const active = pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    href={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-4 rounded-xl px-5 py-3.5 text-base font-bold transition-all ${
                      active
                        ? 'bg-indigo-600/15 text-indigo-400 border border-indigo-500/20'
                        : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40 border border-transparent'
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    {item.name}
                  </Link>
                );
              })}
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center gap-4 rounded-xl px-5 py-3.5 text-base font-bold text-zinc-500 hover:text-red-400 hover:bg-red-500/5 border border-transparent transition-all cursor-pointer"
            >
              <LogOut className="h-5 w-5" />
              Sign Out
            </button>
          </div>
        )}

        {/* 4. Page Content Body */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          {children}
        </main>
      </div>
    </div>
  );
}
