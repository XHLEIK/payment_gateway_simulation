'use client';

import React, { useState } from 'react';
import { useAuth } from '../../components/providers';
import LayoutShell from '../../components/layout-shell';
import { 
  Card, 
  CardHeader, 
  CardTitle, 
  CardDescription, 
  CardContent, 
  Button, 
  Input, 
  Select, 
  Table, 
  TableHeader, 
  TableBody, 
  TableHead, 
  TableRow, 
  TableCell, 
  Badge 
} from '../../components/ui';
import { useQuery } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  SlidersHorizontal, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  X,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Download
} from 'lucide-react';

// History Ledger Viewer Page.
// Displays searchable, filterable logs of user payments, deposits, and transfers.
// Lets users submit dispute resolution claims or request P2P rollback/reversal.
export default function TransactionsPage() {
  const { user } = useAuth();
  
  // Filtering, Pagination & Sorting states
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('createdAt');
  const [sortOrder, setSortOrder] = useState<'ASC' | 'DESC'>('DESC');
  const [showFilters, setShowFilters] = useState(false);

  // Reversal Request modal state variables
  const [activeTxnForReversal, setActiveTxnForReversal] = useState<any | null>(null);
  const [reversalReason, setReversalReason] = useState('');
  const [reversalLoading, setReversalLoading] = useState(false);
  const [reversalError, setReversalError] = useState('');
  const [reversalSuccess, setReversalSuccess] = useState(false);

  // Dispute Filing modal state variables
  const [activeTxnForDispute, setActiveTxnForDispute] = useState<any | null>(null);
  const [disputeReason, setDisputeReason] = useState('');
  const [disputeEvidence, setDisputeEvidence] = useState('');
  const [disputeLoading, setDisputeLoading] = useState(false);
  const [disputeError, setDisputeError] = useState('');
  const [disputeSuccess, setDisputeSuccess] = useState(false);

  // Submit P2P rollback request to backend (Admins must approve this later)
  const handleRequestReversal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTxnForReversal) return;
    setReversalError('');
    setReversalSuccess(false);
    setReversalLoading(true);
    try {
      await api.post(`/transactions/${activeTxnForReversal.id}/request-reversal`, {
        reason: reversalReason
      });
      setReversalSuccess(true);
      setReversalReason('');
      refetch();
    } catch (err: any) {
      setReversalError(err.response?.data?.message || 'Failed to submit reversal request');
    } finally {
      setReversalLoading(false);
    }
  };

  // Submit dispute resolution complaint
  const handleFileDispute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeTxnForDispute) return;
    setDisputeError('');
    setDisputeSuccess(false);
    setDisputeLoading(true);
    try {
      await api.post('/disputes', {
        transactionId: activeTxnForDispute.id,
        reason: disputeReason,
        evidence: disputeEvidence || undefined
      });
      setDisputeSuccess(true);
      setDisputeReason('');
      setDisputeEvidence('');
      refetch();
    } catch (err: any) {
      setDisputeError(err.response?.data?.message || 'Failed to file dispute');
    } finally {
      setDisputeLoading(false);
    }
  };

  // 1. Fetch transactions list using filtering hooks.
  // Refetches automatically whenever sorting, page, or filters change.
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['transactions', page, status, type, from, to, minAmount, maxAmount, search, sortBy, sortOrder],
    queryFn: async () => {
      const res = await api.get('/transactions', {
        params: {
          page,
          limit,
          status: status || undefined,
          type: type || undefined,
          from: from || undefined,
          to: to || undefined,
          minAmount: minAmount || undefined,
          maxAmount: maxAmount || undefined,
          search: search || undefined,
          sortBy,
          sortOrder,
        },
      });
      return res.data;
    },
  });

  const handleResetFilters = () => {
    setStatus('');
    setType('');
    setFrom('');
    setTo('');
    setMinAmount('');
    setMaxAmount('');
    setSearch('');
    setSortBy('createdAt');
    setSortOrder('DESC');
    setPage(1);
  };

  // Click on a table head to toggle sorting direction or swap columns
  const handleSort = (field: string) => {
    if (sortBy === field) {
      setSortOrder(sortOrder === 'ASC' ? 'DESC' : 'ASC');
    } else {
      setSortBy(field);
      setSortOrder('DESC');
    }
    setPage(1); // Jump back to page 1 to review sorted entries
  };

  // 2. Fetch binary report stream and download as CSV file directly in browser
  const handleExportCsv = async () => {
    try {
      const res = await api.get('/reports/download', {
        params: {
          status: status || undefined,
          type: type || undefined,
          from: from || undefined,
          to: to || undefined,
          minAmount: minAmount || undefined,
          maxAmount: maxAmount || undefined,
          search: search || undefined,
          format: 'csv',
        },
        responseType: 'blob',
      });
      
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
      // APPSC formatted export filename
      downloadLink.setAttribute('download', `appsc-transactions-report-${Date.now()}.csv`);
      document.body.appendChild(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    } catch (err) {
      console.error('Failed to download transactions CSV:', err);
    }
  };

  const txs = data?.items || [];
  const totalPages = data?.totalPages || 1;
  const totalItems = data?.total || 0;

  return (
    <LayoutShell>
      {/* Title block */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Transaction History</h2>
          <p className="text-sm text-zinc-500">Filter, audit, and export system ledger records.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowFilters(!showFilters)} 
            variant="secondary" 
            className="text-xs font-bold gap-1.5 cursor-pointer"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {showFilters ? 'Hide Filters' : 'Filters'}
          </Button>
          <Button 
            onClick={handleExportCsv} 
            variant="primary" 
            className="text-xs font-bold gap-1.5 shadow-sm cursor-pointer"
            disabled={txs.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter panel input cards */}
      {showFilters && (
        <Card className="mb-6 border border-zinc-900 bg-zinc-950/40">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-bold uppercase tracking-wider text-zinc-400">
              Filter Ledgers
            </CardTitle>
            <button 
              onClick={() => setShowFilters(false)} 
              className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
            >
              <X className="h-4.5 w-4.5" />
            </button>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-4 gap-4">
            <Select
              label="Txn Status"
              options={[
                { value: '', label: 'All Statuses' },
                { value: 'INITIATED', label: 'INITIATED' },
                { value: 'PROCESSING', label: 'PROCESSING' },
                { value: 'SUCCESS', label: 'SUCCESS' },
                { value: 'FAILED', label: 'FAILED' },
                { value: 'REFUNDED', label: 'REFUNDED' },
              ]}
              value={status}
              onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            />
            <Select
              label="Txn Type"
              options={[
                { value: '', label: 'All Types' },
                { value: 'CREDIT', label: 'CREDIT (Loads)' },
                { value: 'DEBIT', label: 'DEBIT (Spends)' },
                { value: 'TRANSFER', label: 'TRANSFER (Out)' },
                { value: 'TRANSFER_CREDIT', label: 'TRANSFER (In)' },
              ]}
              value={type}
              onChange={(e) => { setType(e.target.value); setPage(1); }}
            />
            <Input
              label="Date From"
              type="date"
              value={from}
              onChange={(e) => { setFrom(e.target.value); setPage(1); }}
            />
            <Input
              label="Date To"
              type="date"
              value={to}
              onChange={(e) => { setTo(e.target.value); setPage(1); }}
            />
            <Input
              label="Min Amount (INR)"
              type="number"
              placeholder="e.g. 100"
              value={minAmount}
              onChange={(e) => { setMinAmount(e.target.value); setPage(1); }}
            />
            <Input
              label="Max Amount (INR)"
              type="number"
              placeholder="e.g. 5000"
              value={maxAmount}
              onChange={(e) => { setMaxAmount(e.target.value); setPage(1); }}
            />
            
            <div className="sm:col-span-2 flex items-end gap-2.5">
              <div className="flex-1">
                <Input
                  label="Search Keywords"
                  placeholder="Ref ID, Order ID, name..."
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Button onClick={handleResetFilters} variant="secondary" className="text-xs h-[38px] font-bold cursor-pointer">
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Ledger data grid */}
      <Card className="border border-zinc-900 bg-zinc-950">
        <CardContent className="p-0">
          {isLoading ? (
            <div className="py-24 flex justify-center items-center">
              <Loader2 className="h-10 w-10 animate-spin text-indigo-500" />
            </div>
          ) : txs.length === 0 ? (
            <div className="py-24 text-center text-zinc-500 text-sm">
              No transactions match current filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('createdAt')}>
                      Date {sortBy === 'createdAt' && (sortOrder === 'ASC' ? ' ▲' : ' ▼')}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('referenceId')}>
                      Reference ID {sortBy === 'referenceId' && (sortOrder === 'ASC' ? ' ▲' : ' ▼')}
                    </TableHead>
                    {user?.role === 'admin' && <TableHead>User Profile</TableHead>}
                    <TableHead>Gateway Details</TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('type')}>
                      Type {sortBy === 'type' && (sortOrder === 'ASC' ? ' ▲' : ' ▼')}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-zinc-200" onClick={() => handleSort('amount')}>
                      Amount {sortBy === 'amount' && (sortOrder === 'ASC' ? ' ▲' : ' ▼')}
                    </TableHead>
                    <TableHead className="cursor-pointer select-none hover:text-zinc-200 text-right" onClick={() => handleSort('status')}>
                      Status {sortBy === 'status' && (sortOrder === 'ASC' ? ' ▲' : ' ▼')}
                    </TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.map((tx: any) => {
                    const isCredit = tx.type === 'CREDIT' || tx.type === 'TRANSFER_CREDIT';
                    const isSuccess = tx.status === 'SUCCESS';
                    const isFailed = tx.status === 'FAILED';
                    const isRefunded = tx.status === 'REFUNDED';
                    
                    return (
                      <TableRow key={tx.id}>
                        <TableCell className="text-xs text-zinc-500 font-medium">
                          {new Date(tx.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', year: 'numeric',
                            hour: '2-digit', minute: '2-digit'
                          })}
                        </TableCell>
                        <TableCell className="font-mono text-xs font-bold text-zinc-200 tracking-wider">
                          {tx.referenceId}
                        </TableCell>
                        {user?.role === 'admin' && (
                          <TableCell className="text-xs">
                            <div className="flex flex-col">
                              <span className="font-bold text-zinc-300">{tx.user?.name}</span>
                              <span className="text-zinc-500 text-[10px]">{tx.user?.email}</span>
                            </div>
                          </TableCell>
                        )}
                        <TableCell className="text-[10px] font-mono text-zinc-500">
                          {tx.gatewayOrderId ? (
                            <div>
                              <div>Order: {tx.gatewayOrderId}</div>
                              {tx.gatewayPaymentId && <div>Pay: {tx.gatewayPaymentId}</div>}
                            </div>
                          ) : 'Internal/Admin Transfer'}
                        </TableCell>
                        <TableCell>
                          <span className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                            isCredit ? 'text-emerald-400' : 'text-zinc-400'
                          }`}>
                            {isCredit ? <ArrowDownLeft className="h-3 w-3" /> : <ArrowUpRight className="h-3 w-3" />}
                            {tx.type === 'TRANSFER_CREDIT' ? 'TRANSFER CREDIT' : tx.type}
                          </span>
                        </TableCell>
                        <TableCell className="font-black text-sm text-zinc-100">
                          ₹{tx.amount.toFixed(2)}
                        </TableCell>
                        <TableCell className="text-right">
                          <Badge variant={
                            isSuccess ? 'success' : isFailed ? 'danger' : isRefunded ? 'info' : 'warning'
                          }>
                            {tx.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1.5">
                            {/* P2P Rollback action button trigger: Only visible on successful outbox transfers */}
                            {tx.type === 'TRANSFER' && tx.status === 'SUCCESS' && tx.referenceId.startsWith('TXN-SND-') && (
                              <Button
                                onClick={() => {
                                  setActiveTxnForReversal(tx);
                                  setReversalReason('');
                                  setReversalError('');
                                  setReversalSuccess(false);
                                }}
                                variant="secondary"
                                className="text-[10px] px-2.5 py-1 h-7 font-bold shrink-0 text-amber-500 hover:text-amber-400 border border-zinc-800 hover:bg-zinc-900 cursor-pointer"
                              >
                                Rollback
                              </Button>
                            )}
                            {/* Dispute trigger button: open dispute forms on any completed transaction */}
                            {tx.status !== 'FAILED' && (
                              <Button
                                onClick={() => {
                                  setActiveTxnForDispute(tx);
                                  setDisputeReason('');
                                  setDisputeEvidence('');
                                  setDisputeError('');
                                  setDisputeSuccess(false);
                                }}
                                variant="ghost"
                                className="text-[10px] px-2.5 py-1 h-7 font-bold border border-zinc-800 text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900 shrink-0 cursor-pointer"
                              >
                                Dispute
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {/* Footer controls with pagination triggers */}
        {!isLoading && txs.length > 0 && (
          <CardHeader className="border-t border-zinc-900/50 py-4 flex flex-row items-center justify-between">
            <span className="text-xs text-zinc-500 font-medium">
              Showing {txs.length} of {totalItems} transactions
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="p-1.5 rounded-lg cursor-pointer"
                onClick={() => setPage(Math.max(1, page - 1))}
                disabled={page === 1}
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-bold text-zinc-300">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="secondary"
                className="p-1.5 rounded-lg cursor-pointer"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
        )}
      </Card>

      {/* MODAL: P2P TRANSFER ROLLBACK REQUEST FORM */}
      {activeTxnForReversal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Request P2P Rollback</h4>
              <button 
                onClick={() => setActiveTxnForReversal(null)} 
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            
            {reversalSuccess ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
                  <Check className="h-6 w-6" />
                </div>
                <h5 className="text-sm font-bold text-emerald-400 mb-1">Reversal Requested!</h5>
                <p className="text-xs text-zinc-400 px-2 leading-relaxed">
                  Your rollback claim for transfer {activeTxnForReversal.referenceId} has been filed. Admin approval is required.
                </p>
                <Button onClick={() => setActiveTxnForReversal(null)} variant="success" className="w-full mt-4 font-bold text-xs cursor-pointer">
                  Done
                </Button>
              </div>
            ) : (
              <form onSubmit={handleRequestReversal} className="flex flex-col gap-4">
                <div className="text-center bg-zinc-900/40 border border-zinc-900 rounded-lg p-3">
                  <p className="text-xs text-zinc-400 font-medium">Reversing Transfer: <strong>{activeTxnForReversal.referenceId}</strong></p>
                  <p className="text-lg font-black text-zinc-100 mt-1">₹{activeTxnForReversal.amount.toFixed(2)}</p>
                </div>

                {reversalError && (
                  <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-2.5 text-xs text-red-400">
                    {reversalError}
                  </div>
                )}

                <Input
                  label="Reason for Rollback"
                  placeholder="e.g., Mistaken amount, incorrect payee..."
                  value={reversalReason}
                  onChange={(e) => setReversalReason(e.target.value)}
                  required
                  autoFocus
                />

                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    onClick={() => setActiveTxnForReversal(null)} 
                    variant="secondary" 
                    className="flex-1 text-xs py-1.5 font-bold cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    variant="primary" 
                    className="flex-1 text-xs py-1.5 font-bold cursor-pointer" 
                    isLoading={reversalLoading}
                  >
                    Submit Request
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* MODAL: DISPUTE FILING ENTRY */}
      {activeTxnForDispute && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">File Transaction Dispute</h4>
              <button 
                onClick={() => setActiveTxnForDispute(null)} 
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            
            {disputeSuccess ? (
              <div className="text-center py-4">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-emerald-500/10 text-emerald-400 mb-3">
                  <Check className="h-6 w-6" />
                </div>
                <h5 className="text-sm font-bold text-emerald-400 mb-1">Dispute Filed</h5>
                <p className="text-xs text-zinc-400 px-2 leading-relaxed">
                  Your dispute on transaction {activeTxnForDispute.referenceId} has been successfully filed. Support admins will review it.
                </p>
                <Button onClick={() => setActiveTxnForDispute(null)} variant="success" className="w-full mt-4 font-bold text-xs cursor-pointer">
                  Close
                </Button>
              </div>
            ) : (
              <form onSubmit={handleFileDispute} className="flex flex-col gap-4">
                <div className="text-center bg-zinc-900/40 border border-zinc-900 rounded-lg p-3">
                  <p className="text-xs text-zinc-400 font-medium">Disputing Transaction: <strong>{activeTxnForDispute.referenceId}</strong></p>
                  <p className="text-lg font-black text-zinc-100 mt-1">₹{activeTxnForDispute.amount.toFixed(2)}</p>
                </div>

                {disputeError && (
                  <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-2.5 text-xs text-red-400">
                    {disputeError}
                  </div>
                )}

                <Input
                  label="Dispute Reason"
                  placeholder="Describe why you are disputing this charge..."
                  value={disputeReason}
                  onChange={(e) => setDisputeReason(e.target.value)}
                  required
                  autoFocus
                />

                <Input
                  label="Supporting Evidence (Optional)"
                  placeholder="e.g. screenshot URLs, transaction codes..."
                  value={disputeEvidence}
                  onChange={(e) => setDisputeEvidence(e.target.value)}
                />

                <div className="flex gap-2">
                  <Button 
                    type="button" 
                    onClick={() => setActiveTxnForDispute(null)} 
                    variant="secondary" 
                    className="flex-1 text-xs py-1.5 font-bold cursor-pointer"
                  >
                    Cancel
                  </Button>
                  <Button 
                    type="submit" 
                    variant="primary" 
                    className="flex-1 text-xs py-1.5 font-bold cursor-pointer" 
                    isLoading={disputeLoading}
                  >
                    File Dispute
                  </Button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
