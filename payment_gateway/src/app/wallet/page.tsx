'use client';

import React, { useState } from 'react';
import { useAuth } from '../../components/providers';
import LayoutShell from '../../components/layout-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input, Badge } from '../../components/ui';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../../services/api';
import { 
  Wallet, 
  ArrowDownLeft, 
  ArrowUpRight, 
  Loader2, 
  PlusCircle, 
  ArrowRight,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  FileText,
  X,
  Check
} from 'lucide-react';

// Wallet management control page.
// Allows candidates to credit their wallet balances, transfer money to other candidate profiles, 
// configure their security transaction PINs, and review payment requests.
export default function WalletPage() {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  // Tab navigation state
  const [activeTab, setActiveTab] = useState<'deposit' | 'send' | 'request'>('deposit');
  const [rechargeAmount, setRechargeAmount] = useState('500');
  const [errorMsg, setErrorMsg] = useState('');
  
  // Deposit checkout state machine
  const [checkoutStep, setCheckoutStep] = useState<'idle' | 'initiated' | 'verifying' | 'success' | 'failed'>('idle');
  const [activeOrder, setActiveOrder] = useState<{
    orderId: string;
    signature: string;
    amount: number;
    referenceId: string;
  } | null>(null);

  // Send Money state machine flow: 'email' (verify payee) -> 'pin-setup' (if missing PIN) -> 'transfer' -> 'success' | 'failed'
  const [sendStep, setSendStep] = useState<'email' | 'pin-setup' | 'transfer' | 'success' | 'failed'>('email');
  const [sendEmail, setSendEmail] = useState('');
  const [sendAmount, setSendAmount] = useState('');
  const [sendPin, setSendPin] = useState('');
  const [setupPin, setSetupPin] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [sendError, setSendError] = useState('');
  const [sendSuccessMsg, setSendSuccessMsg] = useState('');
  const [sendLoading, setSendLoading] = useState(false);
  const [simulateFailure, setSimulateFailure] = useState(false);
  const [simulateProcessing, setSimulateProcessing] = useState(false);

  // Request Money form state variables
  const [reqEmail, setReqEmail] = useState('');
  const [reqAmount, setReqAmount] = useState('');
  const [reqLoading, setReqLoading] = useState(false);
  const [reqSuccess, setReqSuccess] = useState(false);
  const [reqError, setReqError] = useState('');

  // Payment Requests Approval modal state
  const [activeRequestToPay, setActiveRequestToPay] = useState<any | null>(null);
  const [payPin, setPayPin] = useState('');
  const [payLoading, setPayLoading] = useState(false);
  const [payError, setPayError] = useState('');

  // 1. Fetch current wallet balance
  const { data: balanceData, isLoading: balanceLoading } = useQuery({
    queryKey: ['wallet-balance'],
    queryFn: async () => {
      const res = await api.get('/wallet/balance');
      return res.data;
    },
  });

  // 2. Fetch user's daily spend summary (checks against daily spend limits)
  const { data: dailyLimitData } = useQuery({
    queryKey: ['daily-limit'],
    queryFn: async () => {
      const res = await api.get('/wallet/daily-limit');
      return res.data;
    },
  });

  // 3. Fetch transaction history log for this user
  const { data: historyData, isLoading: historyLoading } = useQuery({
    queryKey: ['wallet-history'],
    queryFn: async () => {
      const res = await api.get('/wallet/history');
      return res.data;
    },
  });

  // 4. Fetch incoming payment requests that this user needs to review
  const { data: receivedRequests = [], refetch: refetchReceived } = useQuery({
    queryKey: ['received-requests'],
    queryFn: async () => {
      const res = await api.get('/payments/requests/received');
      return res.data;
    },
  });

  // 5. Fetch payment requests sent by this user to other profiles
  const { data: sentRequests = [], refetch: refetchSent } = useQuery({
    queryKey: ['sent-requests'],
    queryFn: async () => {
      const res = await api.get('/payments/requests/sent');
      return res.data;
    },
  });

  // Initiate checkout session (deposit flow)
  const initiateMutation = useMutation({
    mutationFn: async (amount: number) => {
      const requestId = crypto.randomUUID(); // Idempotency key
      const res = await api.post('/payments/initiate', {
        amount,
        type: 'CREDIT',
        requestId,
      });
      return res.data;
    },
    onSuccess: (data) => {
      setActiveOrder({
        orderId: data.orderId,
        signature: data.signature,
        amount: data.amount,
        referenceId: data.referenceId,
      });
      setCheckoutStep('initiated');
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'Failed to initiate payment');
    },
  });

  // Verify payment session signature checks
  const verifyMutation = useMutation({
    mutationFn: async (order: { orderId: string; signature: string }) => {
      const res = await api.post('/payments/verify', {
        orderId: order.orderId,
        signature: order.signature,
      });
      return res.data;
    },
    onSuccess: () => {
      setCheckoutStep('verifying');
      // Simulated gateway delay
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
        queryClient.invalidateQueries({ queryKey: ['wallet-history'] });
        setCheckoutStep('success');
      }, 2500);
    },
    onError: (err: any) => {
      setErrorMsg(err.response?.data?.message || err.message || 'Verification failed');
      setCheckoutStep('failed');
    },
  });

  // Verify recipient email exists before showing PIN input
  const handleVerifyRecipient = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError('');
    setSendLoading(true);
    try {
      const res = await api.get('/users/check-email', { params: { email: sendEmail } });
      setRecipientName(res.data.name);
      
      // Determine if logged-in user already set a security PIN
      const pinRes = await api.get('/users/has-pin');
      if (pinRes.data.hasPin) {
        setSendStep('transfer');
      } else {
        setSendStep('pin-setup'); // Redirect to configure a new PIN
      }
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Candidate email verification failed');
    } finally {
      setSendLoading(false);
    }
  };

  // Configure a new 6-digit transaction PIN
  const handleSetTransactionPin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError('');
    setSendLoading(true);
    try {
      await api.post('/users/set-pin', { pin: setupPin });
      setSendStep('transfer');
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to set transaction PIN');
    } finally {
      setSendLoading(false);
    }
  };

  // Execute direct balance transfer to target email profile
  const handleSendMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    setSendError('');
    setSendLoading(true);
    try {
      const requestId = crypto.randomUUID(); // Idempotency token
      const amountNum = parseFloat(sendAmount);
      const res = await api.post('/wallet/send-money', {
        recipientEmail: sendEmail,
        amount: amountNum,
        pin: sendPin,
        requestId,
        simulateFailure,
        simulateProcessing
      });
      setSendSuccessMsg(res.data.message || 'Funds sent successfully');
      setSendStep('success');
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-history'] });
      queryClient.invalidateQueries({ queryKey: ['daily-limit'] });
    } catch (err: any) {
      setSendError(err.response?.data?.message || 'Failed to transfer funds');
      if (err.response?.data?.message?.includes('locked')) {
        setSendStep('failed');
      }
    } finally {
      setSendLoading(false);
    }
  };

  // Submit billing payment request
  const handleRequestMoney = async (e: React.FormEvent) => {
    e.preventDefault();
    setReqError('');
    setReqSuccess(false);
    setReqLoading(true);
    try {
      const amountNum = parseFloat(reqAmount);
      await api.post('/payments/requests', {
        recipientEmail: reqEmail,
        amount: amountNum
      });
      setReqSuccess(true);
      setReqEmail('');
      setReqAmount('');
      refetchSent();
    } catch (err: any) {
      setReqError(err.response?.data?.message || 'Failed to create payment request');
    } finally {
      setReqLoading(false);
    }
  };

  // Approve payment request (payer enters transaction PIN to authorize debit)
  const handleApproveRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRequestToPay) return;
    setPayError('');
    setPayLoading(true);
    try {
      await api.post(`/payments/requests/${activeRequestToPay.id}/approve`, {
        pin: payPin
      });
      setActiveRequestToPay(null);
      setPayPin('');
      queryClient.invalidateQueries({ queryKey: ['wallet-balance'] });
      queryClient.invalidateQueries({ queryKey: ['wallet-history'] });
      refetchReceived();
    } catch (err: any) {
      setPayError(err.response?.data?.message || 'Failed to pay request');
    } finally {
      setPayLoading(false);
    }
  };

  // Decline payment request
  const handleRejectRequest = async (reqId: string) => {
    if (!confirm('Are you sure you want to reject this payment request?')) return;
    try {
      await api.post(`/payments/requests/${reqId}/reject`);
      refetchReceived();
    } catch (err: any) {
      alert(err.response?.data?.message || 'Failed to reject request');
    }
  };

  const resetSendStep = () => {
    setSendStep('email');
    setSendEmail('');
    setSendAmount('');
    setSendPin('');
    setSetupPin('');
    setRecipientName('');
    setSendError('');
    setSimulateFailure(false);
    setSimulateProcessing(false);
  };

  const handleInitiateRecharge = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    const amt = parseFloat(rechargeAmount);
    if (isNaN(amt) || amt <= 0) {
      setErrorMsg('Please enter a valid amount');
      return;
    }
    initiateMutation.mutate(amt);
  };

  const handleSimulatePayment = () => {
    if (!activeOrder) return;
    verifyMutation.mutate({
      orderId: activeOrder.orderId,
      signature: activeOrder.signature,
    });
  };

  const resetCheckout = () => {
    setCheckoutStep('idle');
    setActiveOrder(null);
    setErrorMsg('');
  };

  const balance = balanceData?.balance !== undefined ? balanceData.balance : 0.0;
  const history = historyData || [];

  return (
    <LayoutShell>
      {/* Title section */}
      <div className="mb-8">
        <h2 className="text-2xl font-bold tracking-tight text-zinc-100">Wallet Administration</h2>
        <p className="text-sm text-zinc-500">Manage deposits, peer-to-peer transfers, and audit transactional records.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="flex flex-col gap-8 lg:col-span-1">
          {/* Wallet Balance Display Card */}
          <Card className="relative overflow-hidden bg-gradient-to-br from-indigo-950/20 via-zinc-950 to-zinc-950 border border-zinc-900 shadow-lg">
            <div className="absolute top-0 right-0 w-32 h-32 rounded-full bg-indigo-600/10 blur-2xl animate-pulse" />
            <CardHeader>
              <div className="flex items-center gap-2">
                <Wallet className="h-5 w-5 text-indigo-400" />
                <span className="text-xs font-bold text-indigo-400 uppercase tracking-wider">
                  Current Wallet Balance
                </span>
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-4xl font-black text-zinc-50 tracking-tight">
                ₹{balanceLoading ? '...' : balance.toLocaleString('en-IN', { minimumFractionDigits: 2 })}
              </div>
              <p className="text-xs text-zinc-500 mt-2">
                INR currency. Lock secured with row-level pessimistic controls.
              </p>
            </CardContent>
          </Card>

          {/* Interactive deposit/send/request module switcher */}
          <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
            <div className="flex border-b border-zinc-900 mb-5">
              <button 
                onClick={() => { setActiveTab('deposit'); resetSendStep(); setReqError(''); setReqSuccess(false); }} 
                className={`flex-1 pb-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'deposit' 
                    ? 'border-indigo-500 text-indigo-400' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-400'
                }`}
              >
                Deposit
              </button>
              <button 
                onClick={() => { setActiveTab('send'); resetSendStep(); }} 
                className={`flex-1 pb-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'send' 
                    ? 'border-indigo-500 text-indigo-400' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-400'
                }`}
              >
                Send Money
              </button>
              <button 
                onClick={() => { setActiveTab('request'); setReqError(''); setReqSuccess(false); }} 
                className={`flex-1 pb-3 text-[10px] font-bold uppercase tracking-wider border-b-2 transition-all cursor-pointer ${
                  activeTab === 'request' 
                    ? 'border-indigo-500 text-indigo-400' 
                    : 'border-transparent text-zinc-500 hover:text-zinc-400'
                }`}
              >
                Request
              </button>
            </div>

            <CardContent className="pt-0">
              {/* TAB 1: DEPOSIT PORTAL UI */}
              {activeTab === 'deposit' && (
                <div>
                  {checkoutStep === 'idle' && (
                    <form onSubmit={handleInitiateRecharge} className="flex flex-col gap-4">
                      {errorMsg && (
                        <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-3 text-xs font-semibold text-red-400 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                          <span>{errorMsg}</span>
                        </div>
                      )}
                      <Input
                        label="Recharge Amount (INR)"
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="Enter amount to load"
                        value={rechargeAmount}
                        onChange={(e) => setRechargeAmount(e.target.value)}
                        required
                      />
                      <Button type="submit" variant="primary" className="w-full font-bold text-xs cursor-pointer" isLoading={initiateMutation.isPending}>
                        <PlusCircle className="mr-2 h-4 w-4" />
                        Initiate Checkout
                      </Button>
                    </form>
                  )}

                  {checkoutStep === 'initiated' && activeOrder && (
                    <div className="flex flex-col gap-5 border border-indigo-500/20 rounded-xl bg-indigo-950/5 p-4">
                      <div className="flex flex-col text-center">
                        <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest leading-none mb-1">
                          Mock Gateway Screen
                        </span>
                        <span className="text-[11px] font-semibold text-zinc-500 font-mono">
                          Order ID: {activeOrder.orderId}
                        </span>
                      </div>

                      <div className="border-t border-b border-zinc-900 py-3 flex justify-between items-center">
                        <span className="text-xs font-bold text-zinc-400 uppercase">Payment Amount</span>
                        <span className="text-lg font-black text-zinc-200">
                          ₹{activeOrder.amount.toFixed(2)}
                        </span>
                      </div>

                      <p className="text-[10px] text-zinc-500 text-center">
                        Simulates 80% checkout success rate with random failure simulator.
                      </p>

                      <div className="flex gap-2">
                        <Button onClick={resetCheckout} variant="secondary" className="flex-1 text-xs py-1.5 font-bold cursor-pointer">
                          Cancel
                        </Button>
                        <Button onClick={handleSimulatePayment} variant="primary" className="flex-1 text-xs py-1.5 font-bold cursor-pointer" isLoading={verifyMutation.isPending}>
                          Pay Now
                          <ArrowRight className="ml-2 h-4.5 w-4.5" />
                        </Button>
                      </div>
                    </div>
                  )}

                  {checkoutStep === 'verifying' && (
                    <div className="py-8 text-center flex flex-col items-center justify-center">
                      <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-4" />
                      <h4 className="text-sm font-bold text-zinc-200">Verifying signature...</h4>
                      <p className="text-xs text-zinc-500 mt-1.5 max-w-xs">
                        Mock gateway is executing verification signature checks and scheduling webhook transaction callback.
                      </p>
                    </div>
                  )}

                  {checkoutStep === 'success' && activeOrder && (
                    <div className="py-6 text-center flex flex-col items-center justify-center border border-emerald-500/10 rounded-xl bg-emerald-500/5">
                      <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                      <h4 className="text-sm font-bold text-emerald-400">Payment Completed!</h4>
                      <p className="text-xs text-zinc-400 mt-1 px-4">
                        Mock gateway webhook cleared successfully. ₹{activeOrder.amount.toFixed(2)} credited to your wallet.
                      </p>
                      <Button onClick={resetCheckout} variant="success" className="mt-4 text-xs font-bold px-6 cursor-pointer">
                        Close Portal
                      </Button>
                    </div>
                  )}

                  {checkoutStep === 'failed' && (
                    <div className="py-6 text-center flex flex-col items-center justify-center border border-red-500/10 rounded-xl bg-red-500/5">
                      <XCircle className="h-12 w-12 text-red-500 mb-3" />
                      <h4 className="text-sm font-bold text-red-400">Payment Failed</h4>
                      <p className="text-xs text-zinc-400 mt-1 px-4">
                        Signature verify failed or transaction simulation crashed.
                      </p>
                      <Button onClick={resetCheckout} variant="danger" className="mt-4 text-xs font-bold px-6 cursor-pointer">
                        Try Again
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 2: SEND MONEY FLOW */}
              {activeTab === 'send' && (
                <div>
                  {/* Spend Limits Progress Widget */}
                  {dailyLimitData && (
                    <div className="mb-5 p-3 rounded-lg bg-zinc-900/40 border border-zinc-900">
                      <div className="flex justify-between text-[11px] font-bold text-zinc-400 mb-1">
                        <span>Daily Limit: ₹{dailyLimitData.limit.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                        <span>Spent: ₹{dailyLimitData.spent.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                      <div className="w-full h-1.5 bg-zinc-850 rounded-full overflow-hidden">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            (dailyLimitData.spent / dailyLimitData.limit) >= 0.8 ? 'bg-red-500' : 'bg-indigo-500'
                          }`}
                          style={{ width: `${Math.min(100, (dailyLimitData.spent / dailyLimitData.limit) * 100)}%` }}
                        />
                      </div>
                      <div className="mt-1 flex justify-between text-[10px] text-zinc-500">
                        <span>{Math.round((dailyLimitData.spent / dailyLimitData.limit) * 100)}% used</span>
                        <span className="font-semibold text-zinc-400">Remaining: ₹{dailyLimitData.remaining.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</span>
                      </div>
                    </div>
                  )}
                  {sendStep === 'email' && (
                    <form onSubmit={handleVerifyRecipient} className="flex flex-col gap-4">
                      {sendError && (
                        <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-3 text-xs font-semibold text-red-400 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                          <span>{sendError}</span>
                        </div>
                      )}
                       <Input
                        label="Recipient Email"
                        type="email"
                        placeholder="email@regilly.com"
                        value={sendEmail}
                        onChange={(e) => setSendEmail(e.target.value)}
                        required
                      />
                      <Button type="submit" variant="primary" className="w-full font-bold text-xs cursor-pointer" isLoading={sendLoading}>
                        Verify Candidate Email
                        <ArrowRight className="ml-2 h-4 w-4" />
                      </Button>
                    </form>
                  )}

                  {sendStep === 'pin-setup' && (
                    <form onSubmit={handleSetTransactionPin} className="flex flex-col gap-4">
                      <div className="rounded-lg bg-indigo-900/10 border border-indigo-500/20 p-3 text-xs text-indigo-400">
                        Candidate verified: <strong>{recipientName}</strong>. You do not have a Transaction PIN set. Please set a secure 6-digit transaction PIN.
                      </div>
                      {sendError && (
                        <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-3 text-xs font-semibold text-red-400">
                          {sendError}
                        </div>
                      )}
                      <Input
                        label="Configure 6-Digit PIN"
                        type="password"
                        maxLength={6}
                        placeholder="Enter 6 numbers"
                        value={setupPin}
                        onChange={(e) => setSetupPin(e.target.value.replace(/\D/g, ''))}
                        required
                      />
                      <Button type="submit" variant="primary" className="w-full font-bold text-xs cursor-pointer" isLoading={sendLoading}>
                        Configure & Set PIN
                      </Button>
                    </form>
                  )}

                  {sendStep === 'transfer' && (
                    <form onSubmit={handleSendMoney} className="flex flex-col gap-4">
                      <div className="rounded-lg bg-emerald-950/10 border border-emerald-500/20 p-3 text-xs text-emerald-400 flex items-center gap-2">
                        <Check className="h-4 w-4 text-emerald-400 shrink-0" />
                        <span>Verified Payee: <strong>{recipientName}</strong></span>
                      </div>
                      {sendError && (
                        <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-3 text-xs font-semibold text-red-400 flex items-start gap-2">
                          <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                          <span>{sendError}</span>
                        </div>
                      )}
                      <Input
                        label="Amount (INR)"
                        type="number"
                        min="1"
                        step="0.01"
                        placeholder="Enter amount to transfer"
                        value={sendAmount}
                        onChange={(e) => setSendAmount(e.target.value)}
                        required
                      />
                      <Input
                        label="6-Digit Transaction PIN"
                        type="password"
                        maxLength={6}
                        placeholder="••••••"
                        value={sendPin}
                        onChange={(e) => setSendPin(e.target.value.replace(/\D/g, ''))}
                        required
                      />

                      {/* Simulation controls */}
                      <div className="space-y-2.5 p-3 rounded-lg bg-zinc-900/30 border border-zinc-900/60 mt-1">
                        <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider block">
                          Simulation Mode Controls
                        </span>
                        
                        <div className="flex items-center justify-between">
                           <label className="text-xs text-zinc-300 font-medium">Simulate Failed Payment</label>
                           <button
                             type="button"
                             onClick={() => {
                               setSimulateFailure(!simulateFailure);
                               if (!simulateFailure) setSimulateProcessing(false);
                             }}
                             className={`w-9 h-5 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                               simulateFailure ? 'bg-red-600' : 'bg-zinc-800'
                             }`}
                           >
                             <span 
                               className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${
                                 simulateFailure ? 'translate-x-4' : 'translate-x-0'
                               }`} 
                             />
                           </button>
                        </div>

                        <div className="flex items-center justify-between">
                           <label className="text-xs text-zinc-300 font-medium">Simulate Processing State</label>
                           <button
                             type="button"
                             onClick={() => {
                               setSimulateProcessing(!simulateProcessing);
                               if (!simulateProcessing) setSimulateFailure(false);
                             }}
                             className={`w-9 h-5 rounded-full transition-colors relative focus:outline-none cursor-pointer ${
                               simulateProcessing ? 'bg-amber-600' : 'bg-zinc-800'
                             }`}
                           >
                             <span 
                               className={`absolute top-0.5 left-0.5 bg-white w-4 h-4 rounded-full transition-transform ${
                                 simulateProcessing ? 'translate-x-4' : 'translate-x-0'
                               }`} 
                             />
                           </button>
                        </div>
                      </div>

                      <div className="flex gap-2 mt-2">
                        <Button type="button" onClick={resetSendStep} variant="secondary" className="flex-1 text-xs py-1.5 font-bold cursor-pointer">
                          Back
                        </Button>
                        <Button type="submit" variant="primary" className="flex-1 text-xs py-1.5 font-bold cursor-pointer" isLoading={sendLoading}>
                          <Send className="mr-2 h-3.5 w-3.5" />
                          Transfer
                        </Button>
                      </div>
                    </form>
                  )}

                  {sendStep === 'success' && (
                    <div className="py-6 text-center flex flex-col items-center justify-center border border-emerald-500/10 rounded-xl bg-emerald-500/5">
                      <CheckCircle2 className="h-12 w-12 text-emerald-500 mb-3" />
                      <h4 className="text-sm font-bold text-emerald-400">Transfer Completed</h4>
                      <p className="text-xs text-zinc-400 mt-1 px-4">
                        {sendSuccessMsg}
                      </p>
                      <Button onClick={resetSendStep} variant="success" className="mt-4 text-xs font-bold px-6 cursor-pointer">
                        Done
                      </Button>
                    </div>
                  )}

                  {sendStep === 'failed' && (
                    <div className="py-6 text-center flex flex-col items-center justify-center border border-red-500/10 rounded-xl bg-red-500/5">
                      <XCircle className="h-12 w-12 text-red-500 mb-3" />
                      <h4 className="text-sm font-bold text-red-400">Transfer Failed</h4>
                      <p className="text-xs text-zinc-400 mt-1 px-4">
                        {sendError || 'Too many incorrect attempts. Account has been locked for 15 minutes.'}
                      </p>
                      <Button onClick={resetSendStep} variant="danger" className="mt-4 text-xs font-bold px-6 cursor-pointer">
                        Back to Start
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {/* TAB 3: REQUEST BILLING UI */}
              {activeTab === 'request' && (
                <form onSubmit={handleRequestMoney} className="flex flex-col gap-4">
                  {reqError && (
                    <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-3 text-xs font-semibold text-red-400 flex items-start gap-2">
                      <AlertCircle className="h-4 w-4 shrink-0 text-red-400" />
                      <span>{reqError}</span>
                    </div>
                  )}
                  {reqSuccess && (
                    <div className="rounded-lg bg-emerald-950/10 border border-emerald-500/20 p-3 text-xs font-semibold text-emerald-400 flex items-start gap-2">
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                      <span>Payment request submitted successfully.</span>
                    </div>
                  )}
                  <Input
                    label="Request From (Email)"
                    type="email"
                    placeholder="payer@regilly.com"
                    value={reqEmail}
                    onChange={(e) => setReqEmail(e.target.value)}
                    required
                  />
                  <Input
                    label="Requested Amount (INR)"
                    type="number"
                    min="1"
                    step="0.01"
                    placeholder="Enter amount requested"
                    value={reqAmount}
                    onChange={(e) => setReqAmount(e.target.value)}
                    required
                  />
                  <Button type="submit" variant="primary" className="w-full font-bold text-xs cursor-pointer" isLoading={reqLoading}>
                    <FileText className="mr-2 h-4 w-4" />
                    Request Payment
                  </Button>
                </form>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Pending payment requests & history ledgers */}
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Section A: Pending billing requests from other users */}
          {receivedRequests.length > 0 && (
            <Card className="bg-zinc-950 border border-zinc-900 shadow-md">
              <CardHeader className="pb-3 border-b border-zinc-900/50">
                <CardTitle className="text-base font-bold text-amber-400">Action Required: Pending Payment Requests</CardTitle>
                <CardDescription className="text-xs">Select pay or reject on requests from other candidates.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y divide-zinc-900">
                  {receivedRequests.map((req: any) => (
                    <div key={req.id} className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-6 py-4.5 gap-4">
                      <div className="flex flex-col">
                        <span className="text-sm font-bold text-zinc-200">
                          Request from {req.payee.name}
                        </span>
                        <span className="text-xs text-zinc-500 font-mono">
                          {req.payee.email} • {new Date(req.createdAt).toLocaleDateString('en-IN', {
                            day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                          })}
                        </span>
                      </div>
                      <div className="flex items-center gap-4.5 self-end sm:self-auto">
                        <span className="text-base font-black text-zinc-200">
                          ₹{Number(req.amount).toFixed(2)}
                        </span>
                        <div className="flex gap-2">
                          <Button 
                            onClick={() => handleRejectRequest(req.id)} 
                            variant="ghost" 
                            className="text-xs py-1 px-3 border border-zinc-800 text-zinc-400 hover:text-red-400 cursor-pointer"
                          >
                            Reject
                          </Button>
                          <Button 
                            onClick={() => { setActiveRequestToPay(req); setPayPin(''); setPayError(''); }} 
                            variant="success" 
                            className="text-xs py-1 px-4 font-bold cursor-pointer"
                          >
                            Pay Now
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section B: Status logs of requests sent out */}
          {sentRequests.length > 0 && (
            <Card className="bg-zinc-950 border border-zinc-900 shadow-sm">
              <CardHeader className="pb-3 border-b border-zinc-900/50">
                <CardTitle className="text-sm font-bold">Sent Payment Requests Log</CardTitle>
                <CardDescription className="text-xs">Audit status of requests sent to other candidates.</CardDescription>
              </CardHeader>
              <CardContent className="p-0 max-h-48 overflow-y-auto">
                <div className="divide-y divide-zinc-900">
                  {sentRequests.map((req: any) => {
                    const statusVariant = 
                      req.status === 'APPROVED' ? 'success' :
                      req.status === 'REJECTED' ? 'danger' :
                      req.status === 'EXPIRED' ? 'neutral' : 'warning';
                    
                    return (
                      <div key={req.id} className="flex justify-between items-center px-6 py-3">
                        <div className="flex flex-col">
                          <span className="text-xs font-bold text-zinc-300">
                            Requested from: {req.payer?.name || 'Candidate'}
                          </span>
                          <span className="text-[10px] text-zinc-500">
                            {req.payer?.email} • {new Date(req.createdAt).toLocaleDateString('en-IN')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-bold text-zinc-200">
                            ₹{Number(req.amount).toFixed(2)}
                          </span>
                          <Badge variant={statusVariant}>
                            {req.status}
                          </Badge>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Section C: Complete wallet balance mutations logs */}
          <Card className="bg-zinc-950 border border-zinc-900 flex flex-col justify-between">
            <div>
              <CardHeader className="border-b border-zinc-900/50 pb-4">
                <CardTitle className="text-lg font-bold">Wallet Ledger Logs</CardTitle>
                <CardDescription className="text-xs">Authorized credit, debit, and peer transfer ledger logs.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                {historyLoading ? (
                  <div className="py-24 flex justify-center items-center">
                    <Loader2 className="h-8 w-8 animate-spin text-zinc-700" />
                  </div>
                ) : history.length === 0 ? (
                  <div className="py-24 text-center text-zinc-500 text-sm">
                    No ledger logs found. Initiate deposit or transfers to inspect history.
                  </div>
                ) : (
                  <div className="divide-y divide-zinc-900">
                    {history.map((item: any, idx: number) => {
                      const isCredit = item.type === 'CREDIT' || item.type === 'TRANSFER_IN';
                      const isSuccess = item.status === 'SUCCESS';
                      const isRefunded = item.status === 'REFUNDED';
                      
                      return (
                        <div key={idx} className="flex items-center justify-between px-6 py-4.5 hover:bg-zinc-900/10 transition-colors">
                          <div className="flex items-center gap-3.5">
                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
                              isCredit ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                            }`}>
                              {isCredit ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                            </div>
                            <div className="flex flex-col">
                              <span className="text-sm font-bold text-zinc-200">
                                {item.type === 'CREDIT' && 'Wallet Credit'}
                                {item.type === 'DEBIT' && 'Wallet Debit'}
                                {item.type === 'TRANSFER_IN' && 'Transfer Received'}
                                {item.type === 'TRANSFER_OUT' && 'Transfer Sent'}
                                {item.type === 'REFUND' && 'Refund'}
                              </span>
                              <span className="text-xs text-zinc-500 font-mono">
                                {item.referenceId} • {new Date(item.createdAt).toLocaleDateString('en-IN', {
                                  day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit'
                                })}
                                {item.balanceAfter !== undefined && item.balanceAfter !== null && (
                                  <span className="block text-[10px] text-indigo-400 font-sans mt-0.5">
                                    Balance After: ₹{Number(item.balanceAfter).toFixed(2)}
                                  </span>
                                )}
                              </span>
                            </div>
                          </div>

                          <div className="flex items-center gap-4">
                            <span className={`text-sm font-black ${
                              isCredit ? 'text-emerald-400' : 'text-zinc-200'
                            }`}>
                              {isCredit ? '+' : '-'}₹{item.amount.toFixed(2)}
                            </span>
                            <Badge variant={isSuccess ? 'success' : isRefunded ? 'info' : 'warning'}>
                              {item.status}
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
                All balance mutations audit verified under serializable postgres locks.
              </span>
            </CardHeader>
          </Card>
        </div>
      </div>

      {/* OVERLAY SECURITY MODAL: Confirm Transaction PIN to pay incoming requests */}
      {activeRequestToPay && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-sm rounded-xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-bold text-zinc-100 uppercase tracking-wider">Confirm Transaction PIN</h4>
              <button 
                onClick={() => { setActiveRequestToPay(null); setPayPin(''); setPayError(''); }} 
                className="text-zinc-500 hover:text-zinc-300 cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>
            
            <form onSubmit={handleApproveRequest} className="flex flex-col gap-4">
              <div className="text-center bg-zinc-900/40 border border-zinc-800 rounded-lg p-3">
                <p className="text-xs text-zinc-400">Paying Request to: <strong>{activeRequestToPay.payee.name}</strong></p>
                <p className="text-lg font-black text-zinc-100 mt-1">₹{Number(activeRequestToPay.amount).toFixed(2)}</p>
              </div>

              {payError && (
                <div className="rounded-lg bg-red-900/10 border border-red-500/20 p-2.5 text-xs text-red-400">
                  {payError}
                </div>
              )}

              <Input
                label="6-Digit Transaction PIN"
                type="password"
                maxLength={6}
                placeholder="••••••"
                value={payPin}
                onChange={(e) => setPayPin(e.target.value.replace(/\D/g, ''))}
                required
                autoFocus
              />

              <div className="flex gap-2 mt-1">
                <Button 
                  type="button" 
                  onClick={() => { setActiveRequestToPay(null); setPayPin(''); setPayError(''); }} 
                  variant="secondary" 
                  className="flex-1 text-xs py-1.5 font-bold cursor-pointer"
                >
                  Cancel
                </Button>
                <Button 
                  type="submit" 
                  variant="success" 
                  className="flex-1 text-xs py-1.5 font-bold cursor-pointer" 
                  isLoading={payLoading}
                >
                  Pay Request
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </LayoutShell>
  );
}
