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
  X,
  Bell,
  Check
} from 'lucide-react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../services/api';

interface LayoutShellProps {
  children: React.ReactNode;
}

export default function LayoutShell({ children }: LayoutShellProps) {
  const { user, isAuthenticated, isLoading, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [notificationPanelOpen, setNotificationPanelOpen] = React.useState(false);

  // Poll notifications unread count every 15 seconds
  const { data: unreadCountData } = useQuery({
    queryKey: ['notifications-unread-count'],
    queryFn: async () => {
      const res = await api.get('/notifications/unread-count');
      return res.data.count;
    },
    refetchInterval: 15000,
    enabled: isAuthenticated,
  });

  const unreadCount = unreadCountData || 0;

  // Fetch all notifications list
  const { data: notificationsData, isLoading: notificationsLoading } = useQuery({
    queryKey: ['notifications-list'],
    queryFn: async () => {
      const res = await api.get('/notifications');
      return res.data.items;
    },
    enabled: isAuthenticated && notificationPanelOpen,
  });

  const notifications = notificationsData || [];

  const markAllReadMutation = useMutation({
    mutationFn: async () => {
      await api.patch('/notifications/read-all');
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const markSingleReadMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.patch(`/notifications/${id}/read`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications-unread-count'] });
      queryClient.invalidateQueries({ queryKey: ['notifications-list'] });
    },
  });

  const handleMarkAllRead = (e: React.MouseEvent) => {
    e.stopPropagation();
    markAllReadMutation.mutate();
  };

  const handleNotificationClick = (n: any) => {
    if (!n.isRead) {
      markSingleReadMutation.mutate(n.id);
    }
    
    // Navigate based on type
    if (n.metadata?.transactionId) {
      router.push(`/transactions`);
    } else if (n.metadata?.disputeId) {
      if (user?.role === 'admin') {
        router.push('/admin');
      } else {
        router.push('/transactions');
      }
    }
    setNotificationPanelOpen(false);
  };

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
          Securing Regilly Assignment Portal Session...
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
    <div className="h-screen flex flex-col bg-zinc-950 text-zinc-100 overflow-hidden">
      {/* 1. Header Header */}
      <header className="h-16 border-b border-zinc-900 bg-zinc-950 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden text-zinc-400 hover:text-zinc-200 cursor-pointer"
          >
            {mobileMenuOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center font-bold text-sm text-white tracking-widest shadow-md">
              RA
            </span>
            <div className="flex flex-col">
              <span className="text-xs font-bold text-indigo-500 uppercase tracking-widest leading-none">
                Regilly Gateway
              </span>
              <span className="text-sm font-extrabold text-zinc-200 tracking-tight">
                Regilly Assignment Portal
              </span>
            </div>
          </div>
        </div>

        {/* User profile dropdown trigger */}
        <div className="flex items-center gap-4">
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setNotificationPanelOpen(!notificationPanelOpen)}
              className="relative p-2 rounded-lg text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 border border-zinc-900/50 hover:border-zinc-800 transition-all cursor-pointer"
            >
              <Bell className="h-5 w-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex h-2.5 w-2.5">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
                </span>
              )}
            </button>
          </div>

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

      <div className="flex-1 flex relative overflow-hidden">
        {/* 2. Left Sidebar for Desktop */}
        <aside className="hidden md:flex flex-col w-64 border-r border-zinc-900 bg-zinc-950/40 p-4 shrink-0 justify-between h-full">
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
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-7xl mx-auto w-full h-full">
          {children}
        </main>
      </div>

      {/* Sliding Notification Panel */}
      {notificationPanelOpen && (
        <>
          <div 
            className="fixed inset-0 z-40 bg-black/50 backdrop-blur-xs transition-opacity" 
            onClick={() => setNotificationPanelOpen(false)}
          />
          <div className="fixed right-0 top-0 h-screen w-80 bg-zinc-950 border-l border-zinc-900 z-50 flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
            <div className="p-4 border-b border-zinc-900 flex justify-between items-center shrink-0 bg-zinc-950">
              <div className="flex items-center gap-2">
                <Bell className="h-4 w-4 text-indigo-400" />
                <h3 className="text-sm font-bold text-zinc-200">Notifications</h3>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-bold bg-indigo-950 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                    {unreadCount} new
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="text-[10px] font-bold text-indigo-400 hover:text-indigo-300 cursor-pointer"
                  >
                    Mark all read
                  </button>
                )}
                <button
                  onClick={() => setNotificationPanelOpen(false)}
                  className="p-1 text-zinc-500 hover:text-zinc-300 hover:bg-zinc-900 rounded cursor-pointer"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-zinc-900/50 bg-zinc-950/20">
              {notificationsLoading ? (
                <div className="py-12 flex justify-center items-center">
                  <Loader2 className="h-6 w-6 animate-spin text-zinc-700" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="py-12 text-center text-zinc-500 text-xs px-4">
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n: any) => (
                  <div 
                    key={n.id} 
                    onClick={() => handleNotificationClick(n)}
                    className={`p-4 flex flex-col gap-1.5 cursor-pointer transition-colors hover:bg-zinc-900/40 relative ${
                      !n.isRead ? 'bg-indigo-950/5' : ''
                    }`}
                  >
                    {!n.isRead && (
                      <div className="absolute top-4.5 left-2 w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />
                    )}
                    <div className="pl-2.5 flex justify-between items-start gap-2">
                      <span className={`text-xs font-bold ${!n.isRead ? 'text-zinc-100' : 'text-zinc-400'}`}>
                        {n.title}
                      </span>
                      <span className="text-[9px] text-zinc-500 whitespace-nowrap">
                        {new Date(n.createdAt).toLocaleDateString('en-IN', {
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </span>
                    </div>
                    <p className="pl-2.5 text-[11px] text-zinc-400 leading-snug">
                      {n.message}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
