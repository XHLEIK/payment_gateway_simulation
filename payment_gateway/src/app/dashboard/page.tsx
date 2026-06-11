'use client';

import React from 'react';
import { useAuth } from '../../components/providers';
import LayoutShell from '../../components/layout-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Badge } from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  Wallet, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Activity, 
  CheckCircle2, 
  XCircle,
  Clock,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  Loader2
} from 'lucide-react';
import Link from 'next/link';

export default function DashboardPage() {
  const { user } = useAuth();

  // 1. Fetch Wallet Balance (For all users)
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const res = await api.get('/wallet/balance');
      return res.data;
    },
  });

  // 2. Fetch Recent Transactions (Scoped by role in backend automatically)
  const { data: txsData, isLoading: txsLoading } = useQuery({
    queryKey: ['recent-transactions'],
    queryFn: async () => {
      const res = await api.get('/transactions?page=1&limit=5');
      return res.data;
    },
  });

  // 3. Fetch Analytics Summary (Admin only)
  const { data: analyticsData, isLoading: analyticsLoading } = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: async () => {
      const res = await api.get('/analytics/summary?period=weekly');
      return res.data;
    },
    enabled: user?.role === 'admin',
  });

  const recentTxs = txsData?.items || [];
  const balance = balanceData?.balance !== undefined ? balanceData.balance : 0.0;

  return (
    <LayoutShell>
      {/* Welcome banner */}
      <div className="mb-8 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">
            Welcome back, {user?.name}!
          </h2>
          <p className="text-sm text-zinc-500">
            Manage your digital wallet and verify secure portal payments.
          </p>
        </div>
        
        {user?.role === 'admin' && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-xs font-bold text-indigo-400 uppercase tracking-wider">
            <ShieldCheck className="h-4 w-4" />
            Admin Account
          </div>
        )}
      </div>

      {/* Admin stats widgets */}
      {user?.role === 'admin' && analyticsData && (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="bg-zinc-950 border border-zinc-900 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">
                Total Volume (INR)
              </span>
              <TrendingUp className="h-4 w-4 text-zinc-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-zinc-100">
                ₹{analyticsData.totalVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-zinc-500 mt-1">Global transaction sum</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border border-zinc-900 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">
                Gateway Success Rate
              </span>
              <Activity className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-zinc-100">
                {analyticsData.successRate}%
              </div>
              <p className="text-xs text-zinc-500 mt-1">Simulation verification index</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border border-zinc-900 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">
                Successful Payments
              </span>
              <CheckCircle2 className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-zinc-100">
                {analyticsData.totalSuccess}
              </div>
              <p className="text-xs text-zinc-500 mt-1">Cleared transaction records</p>
            </CardContent>
          </Card>

          <Card className="bg-zinc-950 border border-zinc-900 shadow-sm">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest leading-none">
                Failed Payments
              </span>
              <XCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-extrabold text-zinc-100">
                {analyticsData.totalFailed}
              </div>
              <p className="text-xs text-zinc-500 mt-1">Blocked or timed out checkouts</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Main Grid split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left column: balance & quick actions */}
        <div className="flex flex-col gap-8 lg:col-span-1">
          {/* Wallet Balance Card */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-950/40 via-zinc-950 to-zinc-950 border border-zinc-900 shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-indigo-600/10 blur-2xl" />
            
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Regilly Wallet Balance
                </span>
              </div>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="text-4xl font-black text-zinc-50 tracking-tight">
                ₹{balanceLoading ? '...' : balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                Linked to portal account: {user?.email}
              </p>
            </CardContent>
            <CardHeader className="border-t border-zinc-900/50 pt-4 flex flex-row gap-3">
              <Link href="/wallet" className="flex-1">
                <Button variant="primary" className="w-full text-xs py-2 font-bold shadow-md">
                  Recharge Portal
                </Button>
              </Link>
            </CardHeader>
          </Card>

          {/* Quick Access Info Card */}
          <Card className="bg-zinc-950 border border-zinc-900">
            <CardHeader>
              <CardTitle className="text-base font-bold">Regilly Gateways</CardTitle>
              <CardDescription className="text-xs">Secure transaction authorization guidelines</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-3.5 text-xs text-zinc-400">
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center font-bold text-zinc-300 shrink-0 select-none">
                  1
                </div>
                <p>Verify checkout order details before signing requests.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center font-bold text-zinc-300 shrink-0 select-none">
                  2
                </div>
                <p>Verify webhook signature HMAC tags to validate mock credit notifications.</p>
              </div>
              <div className="flex gap-3">
                <div className="w-6 h-6 rounded-full bg-zinc-900 flex items-center justify-center font-bold text-zinc-300 shrink-0 select-none">
                  3
                </div>
                <p>Avoid sharing transaction reference IDs or keys with unverified actors.</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right column: Recent Transactions list */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          <Card className="bg-zinc-950 border border-zinc-900 h-full flex flex-col justify-between">
            <div>
              <CardHeader className="flex flex-row items-center justify-between pb-4 border-b border-zinc-900/50">
                <div>
                  <CardTitle className="text-lg font-bold">Recent Transactions</CardTitle>
                  <CardDescription className="text-xs">Latest activity logs in this portal session</CardDescription>
                </div>
                <Link href="/transactions">
                  <Button variant="ghost" className="text-xs gap-1 font-bold">
                    View History
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </Link>
              </CardHeader>
              
              <CardContent className="p-0">
                {txsLoading ? (
                  <div className="py-20 flex justify-center items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-600" />
                  </div>
                ) : recentTxs.length === 0 ? (
                  <div className="py-20 text-center text-zinc-500 text-sm">
                    No transactions recorded. Initiate a wallet recharge to start.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-900">
                    {recentTxs.map((tx: any) => {
                      const isCredit = tx.type === 'CREDIT';
                      const isSuccess = tx.status === 'SUCCESS';
                      const isFailed = tx.status === 'FAILED';
                      const isRefunded = tx.status === 'REFUNDED';
                      
                      return (
                        <div key={tx.id} className="flex items-center justify-between px-6 py-4 hover:bg-zinc-900/10 transition-colors">
                          <div className="flex items-center gap-3">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-zinc-200">
                                {isCredit ? 'Deposit (Card Recharge)' : 'Portal Debit (Payment)'}
                              </span>
                              <span className="text-xs text-zinc-500 font-mono">
                                {tx.referenceId} • {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className={`text-sm font-black ${
                              isCredit ? 'text-emerald-400' : 'text-zinc-200'
                            }`}>
                              {isCredit ? '+' : '-'}₹{tx.amount.toFixed(2)}
                            </span>
                            
                            <Badge variant={
                              isSuccess ? 'success' : isFailed ? 'danger' : isRefunded ? 'info' : 'warning'
                            }>
                              {tx.status}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </div>
            
            <CardHeader className="border-t border-zinc-900/50 py-4 text-center">
              <span className="text-xs text-zinc-500">
                Showing last 5 transaction records. Scoped for secure audit trails.
              </span>
            </CardHeader>
          </Card>
        </div>
      </div>
    </LayoutShell>
  );
}
