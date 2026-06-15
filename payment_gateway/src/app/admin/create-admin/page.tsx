'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../components/providers';
import LayoutShell from '../../../components/layout-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input } from '../../../components/ui';
import { Eye, EyeOff, UserPlus, ShieldAlert } from 'lucide-react';
import api from '../../../services/api';

export default function CreateAdminPage() {
  const { user } = useAuth();
  const router = useRouter();

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validatePasswordClient = (pass: string): boolean => {
    if (pass.length < 12) {
      setErrorMsg('Password must be at least 12 characters long');
      return false;
    }
    const hasUppercase = /[A-Z]/.test(pass);
    const hasLowercase = /[a-z]/.test(pass);
    const hasNumber = /[0-9]/.test(pass);
    const hasSpecial = /[^A-Za-z0-9]/.test(pass);

    if (!hasUppercase || !hasLowercase || !hasNumber || !hasSpecial) {
      setErrorMsg('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character.');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    setSuccessMsg('');

    if (!name || !email || !password || !confirmPassword) {
      setErrorMsg('All fields are required');
      return;
    }

    if (password !== confirmPassword) {
      setErrorMsg('Passwords do not match');
      return;
    }

    if (!validatePasswordClient(password)) {
      return;
    }

    setSubmitting(true);

    try {
      await api.post('/auth/create-admin', {
        name,
        email,
        password,
        confirmPassword,
      });

      setSuccessMsg(`Administrator account for ${name} was successfully created.`);
      setName('');
      setEmail('');
      setPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      console.error(err);
      const rawMsg = err.response?.data?.message;
      const formattedMsg = Array.isArray(rawMsg) ? rawMsg.join('\n') : rawMsg;
      setErrorMsg(
        formattedMsg ||
        err.message ||
        'Failed to create admin account. Ensure email is unique.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  // double guard for UI rendering safety
  if (user?.role !== 'admin') {
    return (
      <LayoutShell>
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <ShieldAlert className="h-12 w-12 text-red-500 mb-4" />
          <h2 className="text-xl font-bold text-zinc-100">Unauthorized Access</h2>
          <p className="text-zinc-500 text-sm mt-1">
            Only administrators are authorized to access this section of the Arunachal Pradesh Portal.
          </p>
        </div>
      </LayoutShell>
    );
  }

  return (
    <LayoutShell>
      <div className="max-w-md mx-auto py-8 relative">
        {/* Gradients */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-indigo-600/5 blur-3xl pointer-events-none" />

        <div className="flex flex-col items-center mb-6 text-center relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg mb-3">
            <UserPlus className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 uppercase tracking-widest">
            Regilly Portal
          </h1>
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mt-1">
            Admin Management & Access Control
          </p>
        </div>

        <Card className="border border-zinc-900 bg-zinc-950/80 shadow-2xl backdrop-blur-xl relative z-10">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-bold text-zinc-100">
              Create Administrator
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Add a new administrator to manage the Regilly Payment Gateway.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMsg && (
              <div className="mb-4 rounded-lg bg-red-900/10 border border-red-500/20 p-3.5 text-xs font-medium text-red-400 text-center whitespace-pre-wrap">
                {errorMsg}
              </div>
            )}

            {successMsg && (
              <div className="mb-4 rounded-lg bg-emerald-900/10 border border-emerald-500/20 p-3.5 text-xs font-medium text-emerald-400 text-center whitespace-pre-wrap">
                {successMsg}
              </div>
            )}

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <Input
                label="Full Name"
                placeholder="Enter admin name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />

              <Input
                label="Email Address"
                type="email"
                placeholder="admin@regilly.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />

              <Input
                label="Password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-zinc-500 hover:text-zinc-300 focus:outline-none p-1 cursor-pointer transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <Input
                label="Confirm Password"
                type={showConfirmPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="text-zinc-500 hover:text-zinc-300 focus:outline-none p-1 cursor-pointer transition-colors"
                  >
                    {showConfirmPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <p className="text-[10px] text-zinc-500 leading-tight">
                Password must be at least 12 characters and contain uppercase, lowercase, numbers, and symbols.
              </p>

              <Button type="submit" variant="primary" className="w-full mt-2 h-11 cursor-pointer" isLoading={submitting}>
                Create Admin Account
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </LayoutShell>
  );
}
