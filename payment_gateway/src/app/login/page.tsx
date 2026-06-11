'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/providers';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui';
import { ShieldCheck, Loader2 } from 'lucide-react';

export default function LoginPage() {
  const { user, login, register, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Redirect if already authenticated
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSubmitting(true);

    try {
      if (isRegisterMode) {
        if (!name) {
          throw new Error('Name is required for registration');
        }
        await register(name, email, password, role);
      } else {
        await login(email, password);
      }
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.response?.data?.message || err.message || 'Authentication failed. Please check your credentials.');
    } finally {
      setSubmitting(false);
    }
  };

  const prefill = (type: 'user' | 'admin') => {
    if (type === 'admin') {
      setEmail('admin@regilly.com');
      setPassword('Subham@1234');
      setName('System Administrator');
      setRole('admin');
    } else {
      setEmail('user@regilly.com');
      setPassword('Subham@1234');
      setName('Subham Bose');
      setRole('user');
    }
  };

  if (isLoading) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-screen bg-zinc-950">
        <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-2" />
        <p className="text-zinc-500 text-sm font-semibold animate-pulse">Initializing Portal Session...</p>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-screen flex items-center justify-center bg-zinc-950 px-4 py-12 relative overflow-hidden">
      {/* Visual background lights */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-600/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Regilly Top branding */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-extrabold text-lg tracking-widest text-white shadow-lg mb-3">
            RA
          </div>
          <h1 className="text-xl font-bold text-zinc-100 uppercase tracking-widest">
            Regilly Assignment Portal
          </h1>
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mt-1">
            Payment Service Gateway & Wallet Dashboard
          </p>
        </div>

        <Card className="border border-zinc-900 bg-zinc-950/80 shadow-2xl backdrop-blur-xl">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl font-bold text-zinc-100">
              {isRegisterMode ? 'Create New Account' : 'Sign In To Portal'}
            </CardTitle>
            <CardDescription className="text-zinc-500 text-sm">
              {isRegisterMode 
                ? 'Register to initialize your Regilly wallet instantly.' 
                : 'Access your wallet, transactions, and gateways.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMsg && (
              <div className="mb-4 rounded-lg bg-red-900/10 border border-red-500/20 p-3.5 text-xs font-medium text-red-400 text-center">
                {errorMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {isRegisterMode && (
                <>
                  <Input
                    label="Full Name"
                    placeholder="Enter your name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                  <Select
                    label="Register As (Role)"
                    options={[
                      { value: 'user', label: 'Standard Portal User' },
                      { value: 'admin', label: 'System Administrator (Admin)' },
                    ]}
                    value={role}
                    onChange={(e) => setRole(e.target.value)}
                  />
                </>
              )}

              <Input
                label="Email Address"
                type="email"
                placeholder="name@regilly.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />

              <Button type="submit" variant="primary" className="w-full mt-2 h-11" isLoading={submitting}>
                {isRegisterMode ? 'Register Account' : 'Authenticate Session'}
              </Button>
            </form>

            {/* Quick Demo Pre-fills */}
            <div className="mt-6 border-t border-zinc-900/50 pt-5 text-center">
              <span className="text-xs font-semibold text-zinc-600 uppercase tracking-widest block mb-3">
                Quick Demo Prefills
              </span>
              <div className="flex gap-2.5">
                <Button 
                  onClick={() => prefill('user')} 
                  variant="secondary" 
                  className="flex-1 text-xs py-1.5 font-bold hover:border-indigo-500/20"
                >
                  Prefill User
                </Button>
                <Button 
                  onClick={() => prefill('admin')} 
                  variant="secondary" 
                  className="flex-1 text-xs py-1.5 font-bold hover:border-indigo-500/20"
                >
                  Prefill Admin
                </Button>
              </div>
            </div>

            {/* Switch Mode */}
            <div className="mt-5 text-center">
              <button
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setErrorMsg('');
                }}
                className="text-xs font-bold text-zinc-500 hover:text-indigo-400 cursor-pointer transition-colors"
              >
                {isRegisterMode 
                  ? 'Already have an account? Sign In' 
                  : 'First time using the portal? Create Account'
                }
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
