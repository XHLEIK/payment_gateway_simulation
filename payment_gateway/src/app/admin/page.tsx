'use client';

import React, { useState } from 'react';
import LayoutShell from '../../components/layout-shell';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  Button, 
  Badge,
  Table,
  TableHeader,
  TableBody,
  TableHead,
  TableRow,
  TableCell
} from '../../components/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  Users, 
  Undo2, 
  Check, 
  X, 
  Loader2, 
  AlertCircle,
  Clock,
  UserCheck
} from 'lucide-react';

export default function AdminPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState<'users' | 'refunds'>('users');
  const [actioningId, setActioningId] = useState<string | null>(null);

  // 1. Fetch Users List
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
    enabled: activeTab === 'users',
  });

  // 2. Fetch Refunds List
  const { data: refunds, isLoading: refundsLoading, refetch: refetchRefunds } = useQuery({
    queryKey: ['admin-refunds'],
    queryFn: async () => {
      const res = await api.get('/refunds');
      return res.data;
    },
    enabled: activeTab === 'refunds',
  });

  // 3. Approve Refund Mutation
  const approveMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      const res = await api.post(`/refunds/approve/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setActioningId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'Approval failed');
      setActioningId(null);
    },
  });

  // 4. Reject Refund Mutation
  const rejectMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      const res = await api.post(`/refunds/reject/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-refunds'] });
      setActioningId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'Rejection failed');
      setActioningId(null);
    },
  });

  const handleApprove = (id: string) => {
    if (confirm('Are you sure you want to approve this refund? The transaction amount will be credited back/debited from the corresponding wallet balance.')) {
      approveMutation.mutate(id);
    }
  };

  const handleReject = (id: string) => {
    if (confirm('Are you sure you want to reject this refund request?')) {
      rejectMutation.mutate(id);
    }
  };

  return (
    <LayoutShell>
      {/* Title block */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Portal Administration Control</h2>
        <p className="text-sm text-zinc-500">
          Manage system users directories and review refund requests.
        </p>
      </div>

      {/* Tabs Selector */}
      <div className="flex border-b border-zinc-900 mb-8 gap-4">
        <button
          onClick={() => setActiveTab('users')}
          className={`flex items-center gap-2 pb-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'users'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Users className="h-4.5 w-4.5" />
          User Directory
        </button>
        
        <button
          onClick={() => setActiveTab('refunds')}
          className={`flex items-center gap-2 pb-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'refunds'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Undo2 className="h-4.5 w-4.5" />
          Refund Requests
        </button>
      </div>

      {/* TAB 1: User Directory */}
      {activeTab === 'users' && (
        <Card className="border border-zinc-900 bg-zinc-950">
          <CardHeader className="border-b border-zinc-900/50 pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Arunachal Pradesh Portal Users</CardTitle>
              <CardDescription className="text-xs">Directory of all accounts registered in this portal session</CardDescription>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            {usersLoading ? (
              <div className="py-24 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : !users || users.length === 0 ? (
              <div className="py-24 text-center text-zinc-500 text-sm">
                No portal users found.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User Name</TableHead>
                    <TableHead>Email Address</TableHead>
                    <TableHead>Registered Date</TableHead>
                    <TableHead className="text-right">Access Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u: any) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-bold text-zinc-200">{u.name}</TableCell>
                      <TableCell className="text-zinc-400">{u.email}</TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {new Date(u.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric',
                          hour: '2-digit', minute: '2-digit'
                        })}
                      </TableCell>
                      <TableCell className="text-right">
                        <Badge variant={u.role === 'admin' ? 'info' : 'neutral'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* TAB 2: Refund Request review */}
      {activeTab === 'refunds' && (
        <Card className="border border-zinc-900 bg-zinc-950">
          <CardHeader className="border-b border-zinc-900/50 pb-4">
            <CardTitle className="text-base font-bold">Active Refund Claims</CardTitle>
            <CardDescription className="text-xs">Review pending refund applications and approve credits</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {refundsLoading ? (
              <div className="py-24 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : !refunds || refunds.length === 0 ? (
              <div className="py-24 text-center text-zinc-500 text-sm">
                No refund requests logged.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Request Date</TableHead>
                    <TableHead>User Profile</TableHead>
                    <TableHead>Original Reference</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {refunds.map((r: any) => {
                    const isPending = r.status === 'PENDING';
                    const isApproved = r.status === 'APPROVED';
                    const isRejected = r.status === 'REJECTED';
                    const isActioning = actioningId === r.id;

                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-zinc-500">
                          {new Date(r.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-300">{r.transaction?.user?.name || 'N/A'}</span>
                            <span className="text-zinc-500 text-[10px]">{r.transaction?.user?.email || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-zinc-400">
                          {r.transaction?.referenceId || 'N/A'}
                        </TableCell>
                        <TableCell className="font-bold text-zinc-200">
                          ₹{r.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 max-w-[150px] truncate" title={r.reason}>
                          {r.reason}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            isApproved ? 'success' : isRejected ? 'danger' : 'warning'
                          }>
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isPending ? (
                            <div className="flex justify-end gap-1.5">
                              <Button
                                onClick={() => handleApprove(r.id)}
                                variant="success"
                                className="p-1.5 rounded-lg"
                                title="Approve Refund"
                                isLoading={isActioning}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                onClick={() => handleReject(r.id)}
                                variant="danger"
                                className="p-1.5 rounded-lg"
                                title="Reject Refund"
                                isLoading={isActioning}
                              >
                                <X className="h-4 w-4" />
                              </Button>
                            </div>
                          ) : (
                            <span className="text-xs text-zinc-500 font-medium">
                              Resolved by Admin
                            </span>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </LayoutShell>
  );
}
