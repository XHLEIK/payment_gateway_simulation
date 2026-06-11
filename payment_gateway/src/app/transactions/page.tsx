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
  Search, 
  Download, 
  SlidersHorizontal, 
  ChevronLeft, 
  ChevronRight, 
  Loader2, 
  X,
  RefreshCw,
  ArrowDownLeft,
  ArrowUpRight
} from 'lucide-react';

export default function TransactionsPage() {
  const { user } = useAuth();
  
  // Filtering & Pagination State
  const [page, setPage] = useState(1);
  const [limit] = useState(10);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [search, setSearch] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // 1. Fetch transactions based on filter parameters
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['transactions', page, status, type, from, to, minAmount, maxAmount, search],
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
    setPage(1);
  };

  // 2. Export to CSV via Authorized Fetch Blob download
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
        },
        responseType: 'blob', // Parse response as binary CSV file
      });
      
      const blobUrl = window.URL.createObjectURL(new Blob([res.data]));
      const downloadLink = document.createElement('a');
      downloadLink.href = blobUrl;
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
      {/* Title & Actions bar */}
      <div className="mb-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Transaction History</h2>
          <p className="text-sm text-zinc-500">Filter, audit, and export system ledger records.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => setShowFilters(!showFilters)} 
            variant="secondary" 
            className="text-xs font-bold gap-1.5"
          >
            <SlidersHorizontal className="h-4 w-4" />
            {showFilters ? 'Hide Filters' : 'Filters'}
          </Button>
          <Button 
            onClick={handleExportCsv} 
            variant="primary" 
            className="text-xs font-bold gap-1.5 shadow-sm"
            disabled={txs.length === 0}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Filter Sidebar / Collapsible Header */}
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
              <Button onClick={handleResetFilters} variant="secondary" className="text-xs h-[38px] font-bold">
                Reset
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Main Table view */}
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
                    <TableHead>Date</TableHead>
                    <TableHead>Reference ID</TableHead>
                    {user?.role === 'admin' && <TableHead>User Profile</TableHead>}
                    <TableHead>Gateway Details</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {txs.map((tx: any) => {
                    const isCredit = tx.type === 'CREDIT';
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
                            {tx.type}
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>

        {/* Table footer / Pagination controls */}
        {!isLoading && txs.length > 0 && (
          <CardHeader className="border-t border-zinc-900/50 py-4 flex flex-row items-center justify-between">
            <span className="text-xs text-zinc-500 font-medium">
              Showing {txs.length} of {totalItems} transactions
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                className="p-1.5 rounded-lg"
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
                className="p-1.5 rounded-lg"
                onClick={() => setPage(Math.min(totalPages, page + 1))}
                disabled={page === totalPages}
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </CardHeader>
        )}
      </Card>
    </LayoutShell>
  );
}
