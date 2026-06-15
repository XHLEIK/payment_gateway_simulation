'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/providers';
import LayoutShell from '../../components/layout-shell';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, Button, Input } from '../../components/ui';
import { Eye, EyeOff, Loader2, KeyRound } from 'lucide-react';
import api from '../../services/api';

export default function ChangePasswordPage() {
  const { refreshMe } = useAuth();
  const router = useRouter();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');

  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmNewPassword, setShowConfirmNewPassword] = useState(false);

  const [errorMsg, setErrorMsg] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const validatePasswordClient = (pass: string): boolean => {
    if (pass.length < 12) {
      setErrorMsg('New password must be at least 12 characters long');
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

    if (!currentPassword) {
      setErrorMsg('Current password is required');
      return;
    }

    if (newPassword !== confirmNewPassword) {
      setErrorMsg('New passwords do not match');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMsg('New password cannot be the same as your current password');
      return;
    }

    if (!validatePasswordClient(newPassword)) {
      return;
    }

    setSubmitting(true);

    try {
      await api.post('/auth/change-password', {
        currentPassword,
        newPassword,
        confirmNewPassword,
      });

      setSuccessMsg('Password changed successfully! Other sessions have been signed out.');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      
      // Refresh current user info/session
      await refreshMe();
    } catch (err: any) {
      console.error(err);
      const rawMsg = err.response?.data?.message;
      const formattedMsg = Array.isArray(rawMsg) ? rawMsg.join('\n') : rawMsg;
      setErrorMsg(
        formattedMsg || 
        err.message || 
        'Failed to change password. Please verify your current password.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <LayoutShell>
      <div className="max-w-md mx-auto py-8 relative">
        {/* Gradients */}
        <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-64 h-64 rounded-full bg-indigo-600/5 blur-3xl pointer-events-none" />
        
        <div className="flex flex-col items-center mb-6 text-center relative z-10">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg mb-3">
            <KeyRound className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-100 uppercase tracking-widest">
            Security Control
          </h1>
          <p className="text-zinc-500 text-xs font-semibold uppercase tracking-wider mt-1">
            Update account credentials safely
          </p>
        </div>

        <Card className="border border-zinc-900 bg-zinc-950/80 shadow-2xl backdrop-blur-xl relative z-10">
          <CardHeader className="text-center">
            <CardTitle className="text-xl font-bold text-zinc-100">
              Change Password
            </CardTitle>
            <CardDescription className="text-zinc-500 text-xs">
              Ensure you choose a strong, unique password to protect your account.
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
                label="Current Password"
                type={showCurrentPassword ? 'text' : 'password'}
                placeholder="Enter current password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                    className="text-zinc-500 hover:text-zinc-300 focus:outline-none p-1 cursor-pointer transition-colors"
                  >
                    {showCurrentPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <Input
                label="New Password"
                type={showNewPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="text-zinc-500 hover:text-zinc-300 focus:outline-none p-1 cursor-pointer transition-colors"
                  >
                    {showNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <Input
                label="Confirm New Password"
                type={showConfirmNewPassword ? 'text' : 'password'}
                placeholder="••••••••"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                required
                rightElement={
                  <button
                    type="button"
                    onClick={() => setShowConfirmNewPassword(!showConfirmNewPassword)}
                    className="text-zinc-500 hover:text-zinc-300 focus:outline-none p-1 cursor-pointer transition-colors"
                  >
                    {showConfirmNewPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                }
              />

              <p className="text-[10px] text-zinc-500 leading-tight">
                Password must be at least 12 characters and contain uppercase, lowercase, numbers, and symbols.
              </p>

              <Button type="submit" variant="primary" className="w-full mt-2 h-11 cursor-pointer" isLoading={submitting}>
                Update Password
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </LayoutShell>
  );
}
