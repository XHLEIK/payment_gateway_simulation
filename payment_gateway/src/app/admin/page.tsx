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
  Clock
} from 'lucide-react';

// Administration Control Panel for portal admins.
// Lets admins modify candidate spend limits, approve/reject refunds, review disputes, 
// and manage/reconcile pending and processing money transfers.
export default function AdminPage() {
  const queryClient = useQueryClient();
  // Manage navigation across different admin views
  const [activeTab, setActiveTab] = useState<'users' | 'refunds' | 'disputes' | 'processing' | 'reversals'>('users');
  // Store ID of transaction currently undergoing approval/rejection (disables double-clicks)
  const [actioningId, setActioningId] = useState<string | null>(null);

  // 1. Fetch all registered users in the system (Admins can view and edit limits)
  const { data: users, isLoading: usersLoading } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const res = await api.get('/users');
      return res.data;
    },
    enabled: activeTab === 'users',
  });

  // 2. Fetch refund claims submitted by candidates
  const { data: refunds, isLoading: refundsLoading } = useQuery({
    queryKey: ['admin-refunds'],
    queryFn: async () => {
      const res = await api.get('/refunds');
      return res.data;
    },
    enabled: activeTab === 'refunds',
  });

  // 3. Fetch active disputes filed on completed payments
  const { data: disputes, isLoading: disputesLoading } = useQuery({
    queryKey: ['admin-disputes'],
    queryFn: async () => {
      const res = await api.get('/disputes');
      return res.data.items;
    },
    enabled: activeTab === 'disputes',
  });

  // 4. Fetch transactions stuck in the simulated PROCESSING queue (awaiting admin check)
  const { data: processingTransfers, isLoading: processingLoading } = useQuery({
    queryKey: ['admin-processing-transfers'],
    queryFn: async () => {
      const res = await api.get('/transactions/processing-transfers');
      return res.data;
    },
    enabled: activeTab === 'processing',
  });

  // 5. Fetch transactions where candidates requested a transfer rollback (reversal requests)
  const { data: reversals, isLoading: reversalsLoading } = useQuery({
    queryKey: ['admin-reversals'],
    queryFn: async () => {
      const res = await api.get('/transactions/pending-reversals');
      return res.data;
    },
    enabled: activeTab === 'reversals',
  });

  // --- MUTATION HOOKS (Trigger backend action and invalidate React Query cache to trigger refetch) ---

  // Approve a candidate's refund claim (credits wallet balance back)
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

  // Deny/reject a refund claim
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

  // Resolve or reject open payment disputes
  const updateDisputeStatusMutation = useMutation({
    mutationFn: async ({ id, status, adminNotes }: { id: string; status: string; adminNotes?: string }) => {
      setActioningId(id);
      const res = await api.patch(`/disputes/${id}/status`, { status, adminNotes });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-disputes'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      setActioningId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'Failed to update dispute');
      setActioningId(null);
    },
  });

  // Approve a direct transfer that was flagged in the PROCESSING queue
  const approveProcessingMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      const res = await api.post(`/wallet/approve-processing/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-processing-transfers'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setActioningId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'Failed to approve transfer');
      setActioningId(null);
    },
  });

  // Reject a direct transfer stuck in the PROCESSING queue
  const rejectProcessingMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      const res = await api.post(`/wallet/reject-processing/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-processing-transfers'] });
      setActioningId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'Failed to reject transfer');
      setActioningId(null);
    },
  });

  // Approve a pending P2P reversal request (takes funds from receiver, returns to sender)
  const approveReversalMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      const res = await api.post(`/transactions/${id}/approve-reversal`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reversals'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      setActioningId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'Approval failed');
      setActioningId(null);
    },
  });

  // Deny/reject a pending P2P reversal request
  const rejectReversalMutation = useMutation({
    mutationFn: async (id: string) => {
      setActioningId(id);
      const res = await api.post(`/transactions/${id}/reject-reversal`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-reversals'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      queryClient.invalidateQueries({ queryKey: ['recent-transactions'] });
      setActioningId(null);
    },
    onError: (err: any) => {
      alert(err.response?.data?.message || err.message || 'Rejection failed');
      setActioningId(null);
    },
  });

  // --- BUTTON CLICKS RESOLVERS ---

  const handleApproveReversal = (id: string) => {
    if (confirm('Are you sure you want to approve this transfer reversal? The amount will be debited from the receiver and credited back to the sender.')) {
      approveReversalMutation.mutate(id);
    }
  };

  const handleRejectReversal = (id: string) => {
    if (confirm('Are you sure you want to reject this reversal request?')) {
      rejectReversalMutation.mutate(id);
    }
  };

  // Modify daily transaction spending limit config
  const handleEditDailyLimit = async (userId: string, userName: string) => {
    const limitInput = prompt(`Configure Daily transaction limit for ${userName} (INR):`, "50000");
    if (limitInput === null) return;
    const limit = parseFloat(limitInput);
    if (isNaN(limit) || limit <= 0) {
      alert("Please enter a valid positive number.");
      return;
    }

    try {
      await api.post(`/wallet/daily-limit/${userId}`, { limit });
      alert(`Daily limit for ${userName} set to ₹${limit.toLocaleString('en-IN')}`);
      queryClient.invalidateQueries({ queryKey: ['admin-users'] });
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to update daily limit');
    }
  };

  // Resolve disputes (requires notes if resolved/denied)
  const handleUpdateDispute = (id: string, status: string) => {
    let notes: string | null = "";
    if (status === 'RESOLVED' || status === 'REJECTED') {
      notes = prompt(`Provide admin resolution notes for this dispute:`);
      if (notes === null) return;
    }
    updateDisputeStatusMutation.mutate({ id, status, adminNotes: notes || undefined });
  };

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
      {/* Page header */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Portal Administration Control</h2>
        <p className="text-sm text-zinc-500">
          Manage system users directories and review refund requests.
        </p>
      </div>

      {/* Tabs navigation panel */}
      <div className="flex border-b border-zinc-900 mb-8 gap-4 overflow-x-auto whitespace-nowrap scrollbar-none">
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

        <button
          onClick={() => setActiveTab('disputes')}
          className={`flex items-center gap-2 pb-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'disputes'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <AlertCircle className="h-4.5 w-4.5" />
          Disputes
        </button>

        <button
          onClick={() => setActiveTab('processing')}
          className={`flex items-center gap-2 pb-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'processing'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Clock className="h-4.5 w-4.5" />
          Processing Queue
        </button>

        <button
          onClick={() => setActiveTab('reversals')}
          className={`flex items-center gap-2 pb-3.5 text-sm font-bold border-b-2 transition-all cursor-pointer ${
            activeTab === 'reversals'
              ? 'border-indigo-500 text-indigo-400'
              : 'border-transparent text-zinc-400 hover:text-zinc-200'
          }`}
        >
          <Undo2 className="h-4.5 w-4.5" />
          Reversal Requests
        </button>
      </div>

      {/* Tab content view: Users directory list */}
      {activeTab === 'users' && (
        <Card className="border border-zinc-900 bg-zinc-950">
          <CardHeader className="border-b border-zinc-900/50 pb-4 flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base font-bold">Regilly Assignment Portal Users</CardTitle>
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
                    <TableHead>Access Role</TableHead>
                    <TableHead className="text-right">Daily Limit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u: any) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-bold text-zinc-200">{u.name}</TableCell>
                      <TableCell className="text-zinc-400">{u.email}</TableCell>
                      <TableCell className="text-xs text-zinc-500">
                        {new Date(u.createdAt).toLocaleDateString('en-IN', {
                          day: '2-digit', month: 'short', year: 'numeric'
                        })}
                      </TableCell>
                      <TableCell>
                        <Badge variant={u.role === 'admin' ? 'info' : 'neutral'}>
                          {u.role}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          onClick={() => handleEditDailyLimit(u.id, u.name)}
                          variant="ghost"
                          className="text-xs py-1 px-2 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                        >
                          Set Limit
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {/* Tab content view: Refund Requests list */}
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
                                className="p-1.5 rounded-lg cursor-pointer"
                                title="Approve Refund"
                                isLoading={isActioning}
                              >
                                <Check className="h-4 w-4" />
                              </Button>
                              <Button
                                onClick={() => handleReject(r.id)}
                                variant="danger"
                                className="p-1.5 rounded-lg cursor-pointer"
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

      {/* Tab content view: Transaction disputes */}
      {activeTab === 'disputes' && (
        <Card className="border border-zinc-900 bg-zinc-950">
          <CardHeader className="border-b border-zinc-900/50 pb-4">
            <CardTitle className="text-base font-bold">Transaction Disputes</CardTitle>
            <CardDescription className="text-xs">Audit disputes opened by users on payments</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {disputesLoading ? (
              <div className="py-24 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : !disputes || disputes.length === 0 ? (
              <div className="py-24 text-center text-zinc-500 text-sm">
                No disputes logged.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Filed Date</TableHead>
                    <TableHead>User Profile</TableHead>
                    <TableHead>Original Reference</TableHead>
                    <TableHead>Dispute Reason</TableHead>
                    <TableHead>Evidence</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Admin Notes</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disputes.map((d: any) => {
                    const isOpen = d.status === 'OPEN';
                    const isUnderReview = d.status === 'UNDER_REVIEW';
                    const isResolved = d.status === 'RESOLVED';
                    const isRejected = d.status === 'REJECTED';
                    const isActioning = actioningId === d.id;

                    return (
                      <TableRow key={d.id}>
                        <TableCell className="text-xs text-zinc-500">
                          {new Date(d.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric'
                          })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-300">{d.user?.name || 'N/A'}</span>
                            <span className="text-zinc-500 text-[10px]">{d.user?.email || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-zinc-400">
                          {d.transaction?.referenceId || 'N/A'}
                          <div className="text-[10px] text-zinc-500 font-sans mt-0.5">₹{Number(d.transaction?.amount || 0).toFixed(2)}</div>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-300 max-w-[150px] truncate" title={d.reason}>
                          {d.reason}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 max-w-[150px] truncate" title={d.evidence}>
                          {d.evidence || '-'}
                        </TableCell>
                        <TableCell>
                          <Badge variant={
                            isResolved ? 'success' : isRejected ? 'danger' : isUnderReview ? 'info' : 'warning'
                          }>
                            {d.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-xs text-zinc-400 max-w-[150px] truncate" title={d.adminNotes}>
                          {d.adminNotes || '-'}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {isOpen && (
                              <Button
                                onClick={() => handleUpdateDispute(d.id, 'UNDER_REVIEW')}
                                variant="ghost"
                                className="text-xs py-1 px-2 border border-zinc-800 text-zinc-400 hover:text-zinc-200 cursor-pointer"
                                disabled={isActioning}
                              >
                                Review
                              </Button>
                            )}
                            {(isOpen || isUnderReview) && (
                              <>
                                <Button
                                  onClick={() => handleUpdateDispute(d.id, 'RESOLVED')}
                                  variant="success"
                                  className="text-xs py-1 px-2 font-bold cursor-pointer"
                                  disabled={isActioning}
                                >
                                  Resolve
                                </Button>
                                <Button
                                  onClick={() => handleUpdateDispute(d.id, 'REJECTED')}
                                  variant="danger"
                                  className="text-xs py-1 px-2 font-bold cursor-pointer"
                                  disabled={isActioning}
                                >
                                  Reject
                                </Button>
                              </>
                            )}
                            {(isResolved || isRejected) && (
                              <span className="text-xs text-zinc-500 font-medium">
                                Closed by {d.resolvedBy?.name || 'Admin'}
                              </span>
                            )}
                          </div>
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

      {/* Tab content view: Processing queue */}
      {activeTab === 'processing' && (
        <Card className="border border-zinc-900 bg-zinc-950">
          <CardHeader className="border-b border-zinc-900/50 pb-4">
            <CardTitle className="text-base font-bold">Processing Transfers Queue</CardTitle>
            <CardDescription className="text-xs">Approve or reject simulated PROCESSING state transfers</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {processingLoading ? (
              <div className="py-24 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : !processingTransfers || processingTransfers.length === 0 ? (
              <div className="py-24 text-center text-zinc-500 text-sm">
                No processing transfers in queue.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Created Date</TableHead>
                    <TableHead>Sender Profile</TableHead>
                    <TableHead>Reference ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {processingTransfers.map((t: any) => {
                    const isActioning = actioningId === t.id;

                    return (
                      <TableRow key={t.id}>
                        <TableCell className="text-xs text-zinc-500">
                          {new Date(t.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-300">{t.user?.name || 'N/A'}</span>
                            <span className="text-zinc-500 text-[10px]">{t.user?.email || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-zinc-400">
                          {t.referenceId}
                        </TableCell>
                        <TableCell className="font-bold text-zinc-200">
                          ₹{t.amount.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Badge variant="warning">
                            {t.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                               onClick={() => {
                                 if (confirm(`Approve transfer of ₹${t.amount.toFixed(2)} for sender ${t.user?.name}?`)) {
                                   approveProcessingMutation.mutate(t.id);
                                 }
                               }}
                              variant="success"
                              className="text-xs py-1 px-3 font-bold cursor-pointer"
                              isLoading={isActioning}
                            >
                              Approve
                            </Button>
                            <Button
                               onClick={() => {
                                 if (confirm(`Reject and fail transfer of ₹${t.amount.toFixed(2)} for sender ${t.user?.name}?`)) {
                                   rejectProcessingMutation.mutate(t.id);
                                 }
                               }}
                              variant="danger"
                              className="text-xs py-1 px-3 font-bold cursor-pointer"
                              isLoading={isActioning}
                            >
                              Reject
                            </Button>
                          </div>
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

      {/* Tab content view: Reversal requests */}
      {activeTab === 'reversals' && (
        <Card className="border border-zinc-900 bg-zinc-950">
          <CardHeader className="border-b border-zinc-900/50 pb-4">
            <CardTitle className="text-base font-bold">P2P Transfer Reversal Requests</CardTitle>
            <CardDescription className="text-xs">Review and action rollback requests filed by senders on P2P transfers</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {reversalsLoading ? (
              <div className="py-24 flex justify-center items-center">
                <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
              </div>
            ) : !reversals || reversals.length === 0 ? (
              <div className="py-24 text-center text-zinc-500 text-sm">
                No pending reversal requests.
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Requested Date</TableHead>
                    <TableHead>Sender Profile</TableHead>
                    <TableHead>Reference ID</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Reason for Rollback</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {reversals.map((r: any) => {
                    const isActioning = actioningId === r.id;
                    return (
                      <TableRow key={r.id}>
                        <TableCell className="text-xs text-zinc-500">
                          {new Date(r.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell className="text-xs">
                          <div className="flex flex-col">
                            <span className="font-bold text-zinc-300">{r.user?.name || 'N/A'}</span>
                            <span className="text-zinc-500 text-[10px]">{r.user?.email || 'N/A'}</span>
                          </div>
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-zinc-400">
                          {r.referenceId}
                        </TableCell>
                        <TableCell className="font-bold text-zinc-200">
                          ₹{Number(r.amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="text-xs text-zinc-300 max-w-[200px] truncate" title={r.reversalReason}>
                          {r.reversalReason || 'No reason provided'}
                        </TableCell>
                        <TableCell>
                          <Badge variant="warning">
                            {r.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            <Button
                              onClick={() => handleApproveReversal(r.id)}
                              variant="success"
                              className="p-1.5 rounded-lg cursor-pointer"
                              title="Approve Reversal"
                              disabled={isActioning}
                              isLoading={isActioning}
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={() => handleRejectReversal(r.id)}
                              variant="danger"
                              className="p-1.5 rounded-lg cursor-pointer"
                              title="Reject Reversal"
                              disabled={isActioning}
                              isLoading={isActioning}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
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
