'use client';

import React, { useState } from 'react';
import LayoutShell from '../../components/layout-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Select } from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend
} from 'recharts';
import { 
  Loader2, 
  BarChart3, 
  PieChart as PieIcon, 
  Calendar, 
  TrendingUp, 
  Activity,
  AlertCircle
} from 'lucide-react';

export default function AnalyticsPage() {
  const [period, setPeriod] = useState('weekly');

  // Fetch aggregated stats summary. Redis cached on the backend.
  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ['analytics-summary', period],
    queryFn: async () => {
      const res = await api.get(`/analytics/summary?period=${period}`);
      return res.data;
    },
  });

  if (isLoading) {
    return (
      <LayoutShell>
        <div className="py-40 flex flex-col items-center justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-4" />
          <p className="text-zinc-500 text-sm font-semibold">Aggregating portal analytics metrics...</p>
        </div>
      </LayoutShell>
    );
  }

  // Handle case where backend Redis server might be offline or failing
  if (isError || !data) {
    return (
      <LayoutShell>
        <div className="py-40 text-center flex flex-col items-center justify-center">
          <AlertCircle className="h-12 w-12 text-rose-500 mb-4" />
          <h3 className="text-lg font-bold text-zinc-200">Failed to load analytics</h3>
          <p className="text-sm text-zinc-500 mt-1 max-w-sm">
            Please verify your Redis server connection profile is running correctly.
          </p>
          <Button onClick={() => refetch()} variant="secondary" className="mt-4 text-xs font-bold">
            Retry Aggregation
          </Button>
        </div>
      </LayoutShell>
    );
  }

  // Destructure metrics returned from the backend aggregation
  const successVolume = data.totalVolume;
  const successRate = data.successRate;
  const totalSuccess = data.totalSuccess;
  const totalFailed = data.totalFailed;
  
  // Format success vs failure ratio pie data
  const pieData = [
    { name: 'Success', value: totalSuccess, color: '#10b981' },
    { name: 'Failure', value: totalFailed, color: '#f43f5e' },
  ].filter(item => item.value > 0);

  // Format daily volume charts
  const barData = data.dailyVolumeChart.map((d: any) => ({
    name: new Date(d.date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }),
    volume: d.volume,
    success: d.successCount,
    failed: d.failedCount,
  }));

  return (
    <LayoutShell>
      {/* Title & Selector Header */}
      <div className="mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Analytics Telemetry</h2>
          <p className="text-sm text-zinc-500">Monitor total clearing volume and simulation success rates.</p>
        </div>
        <div className="w-44">
          <Select
            options={[
              { value: 'weekly', label: 'Last 7 Days (Weekly)' },
              { value: 'monthly', label: 'Last 30 Days (Monthly)' },
            ]}
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
          />
        </div>
      </div>

      {/* Main Stats Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Aggregate Clearing Volume
            </span>
            <TrendingUp className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-zinc-100">
              ₹{successVolume.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Cleared deposits and debits</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Clearing Success Rate
            </span>
            <Activity className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-zinc-100">
              {successRate}%
            </div>
            <p className="text-xs text-zinc-500 mt-1">Simulated webhook validation rate</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <span className="text-xs font-bold text-zinc-500 uppercase tracking-widest">
              Total Transactions Logged
            </span>
            <Calendar className="h-4 w-4 text-zinc-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-zinc-100">
              {totalSuccess + totalFailed}
            </div>
            <p className="text-xs text-zinc-500 mt-1">
              {totalSuccess} Cleared / {totalFailed} Failed
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Breakdown Metrics Row */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Direct P2P Transfers
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-zinc-100">
              {data.totalTransfers || 0}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Peer-to-peer wallet direct sends</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
              Refund Claims Approved
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-zinc-100">
              {data.totalRefunds || 0}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Admin authorized refund credits</p>
          </CardContent>
        </Card>

        <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
          <CardHeader className="pb-2">
            <span className="text-xs font-bold text-indigo-400 tracking-wider">
              Standard Payments & Deposits
            </span>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-zinc-100">
              {data.totalPayments || 0}
            </div>
            <p className="text-xs text-zinc-500 mt-1">Deposits and mock gateway checkouts</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts Layout Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Daily Volume Bar Chart */}
        <div className="lg:col-span-2">
          <Card className="bg-zinc-950 border border-zinc-900 h-[400px] flex flex-col justify-between p-6">
            <CardHeader className="p-0 mb-4">
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-indigo-400" />
                <CardTitle className="text-base font-bold">Daily Clearing Volumes</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Aggregate successful transaction amounts per day (INR)
              </CardDescription>
            </CardHeader>
            <div className="flex-1 w-full min-h-0">
              {barData.length === 0 ? (
                <div className="h-full flex items-center justify-center text-zinc-500 text-xs">
                  No volume logs recorded for this period.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <XAxis 
                      dataKey="name" 
                      stroke="#71717a" 
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis 
                      stroke="#71717a" 
                      fontSize={11}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(val) => `₹${val}`}
                    />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#09090b', borderColor: '#18181b', borderRadius: '8px' }}
                      labelStyle={{ color: '#a1a1aa', fontWeight: 'bold', fontSize: '11px' }}
                      itemStyle={{ color: '#e4e4e7', fontSize: '12px' }}
                      formatter={(value) => [`₹${value}`, 'Volume']}
                    />
                    <Bar dataKey="volume" fill="#4f46e5" radius={[4, 4, 0, 0]} maxBarSize={36} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </Card>
        </div>

        {/* Success vs Failure Pie Chart */}
        <div className="lg:col-span-1">
          <Card className="bg-zinc-950 border border-zinc-900 h-[400px] flex flex-col justify-between p-6">
            <CardHeader className="p-0 mb-4">
              <div className="flex items-center gap-2">
                <PieIcon className="h-5 w-5 text-indigo-400" />
                <CardTitle className="text-base font-bold">Clearing Ratios</CardTitle>
              </div>
              <CardDescription className="text-xs">
                Proportion of successful vs failed payments
              </CardDescription>
            </CardHeader>
            <div className="flex-1 w-full min-h-0 flex items-center justify-center">
              {pieData.length === 0 ? (
                <div className="text-zinc-500 text-xs">
                  No clearing logs recorded for this period.
                </div>
              ) : (
                <div className="w-full h-full relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={85}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#09090b', borderColor: '#18181b', borderRadius: '8px' }}
                        itemStyle={{ color: '#e4e4e7', fontSize: '12px' }}
                      />
                      <Legend 
                        verticalAlign="bottom" 
                        height={36} 
                        iconType="circle"
                        formatter={(val) => <span className="text-zinc-400 text-xs font-bold">{val}</span>}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute top-[45%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none select-none">
                    <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest leading-none block mb-0.5">
                      Success
                    </span>
                    <span className="text-xl font-black text-emerald-400 leading-none">
                      {successRate}%
                    </span>
                  </div>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </LayoutShell>
  );
}
