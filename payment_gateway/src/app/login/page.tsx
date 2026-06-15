'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/providers';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui';
import { Loader2 } from 'lucide-react';
import Script from 'next/script';
import api from '../../services/api';

export default function LoginPage() {
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('user');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Security CAPTCHA states
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaToken, setCaptchaToken] = useState('');
  const turnstileWidgetId = useRef<string | null>(null);

  // If already logged in, redirect user straight to their dashboard
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show captcha if in registration mode (mandatory) or if login brute-force limit reached
  const showCaptcha = isRegisterMode || captchaRequired;

  // Clear token whenever captcha requirement state changes
  useEffect(() => {
    setCaptchaToken('');
    if (showCaptcha) {
      renderTurnstileWidget();
    }
  }, [isRegisterMode, captchaRequired]);

  // Render or re-render Turnstile widget dynamically
  const renderTurnstileWidget = () => {
    setTimeout(() => {
      const container = document.getElementById('turnstile-container');
      if (container && (window as any).turnstile) {
        try {
          // Clear container content to prevent multi-rendering
          container.innerHTML = '';
          const widgetEl = document.createElement('div');
          container.appendChild(widgetEl);

          const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || '1x00000000000000000000AA';
          
          (window as any).turnstile.render(widgetEl, {
            sitekey: siteKey,
            callback: (token: string) => {
              setCaptchaToken(token);
              setErrorMsg('');
            },
            'error-callback': () => {
              setErrorMsg('CAPTCHA widget failed to render. Please refresh the page.');
            },
          });
        } catch (e) {
          console.error('Turnstile render error:', e);
        }
      }
    }, 100);
  };

  // Check if email has failed logins and needs CAPTCHA
  const handleEmailBlur = async () => {
    if (isRegisterMode || !email) return;
    try {
      const res = await api.get(`/auth/captcha-required?email=${encodeURIComponent(email)}`);
      setCaptchaRequired(res.data.captchaRequired);
    } catch (err) {
      console.error('Failed to fetch CAPTCHA requirements:', err);
    }
  };

  // Client-side password validation helper
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

  // Handle Form Submission (Login vs Registration switcher)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg('');
    
    // Check CAPTCHA if required
    if (showCaptcha && !captchaToken) {
      setErrorMsg('Please complete the CAPTCHA verification check.');
      return;
    }

    setSubmitting(true);

    try {
      if (isRegisterMode) {
        if (!name) {
          throw new Error('Name is required for registration');
        }
        if (!validatePasswordClient(password)) {
          setSubmitting(false);
          return;
        }
        await register(name, email, password, captchaToken, role);
      } else {
        await login(email, password, captchaToken);
      }
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      setErrorMsg(
        err.response?.data?.message || 
        err.message || 
        'Authentication failed. Please check your credentials.'
      );

      // Re-trigger CAPTCHA requirement check on error
      if (!isRegisterMode) {
        await handleEmailBlur();
        // Reset widget token so user has to solve again on fail
        renderTurnstileWidget();
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Utility to prefill inputs with default seed values
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
      {/* Turnstile CDN Loader */}
      <Script 
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit" 
        strategy="afterInteractive" 
        onLoad={renderTurnstileWidget}
      />

      {/* Dynamic background visual gradients */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-96 h-96 rounded-full bg-indigo-600/5 blur-3xl" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-96 h-96 rounded-full bg-indigo-500/5 blur-3xl" />

      <div className="w-full max-w-md relative z-10">
        {/* Branding header for the Regilly Payment Portal */}
        <div className="flex flex-col items-center mb-8 text-center">
          <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center font-extrabold text-lg tracking-widest text-white shadow-lg mb-3">
            RG
          </div>
          <h1 className="text-xl font-bold text-zinc-100 uppercase tracking-widest">
            Regilly Payment Portal
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
                ? 'Register to initialize your portal wallet instantly.' 
                : 'Access your wallet, transactions, and gateways.'
              }
            </CardDescription>
          </CardHeader>
          <CardContent>
            {errorMsg && (
              <div className="mb-4 rounded-lg bg-red-900/10 border border-red-500/20 p-3.5 text-xs font-medium text-red-400 text-center whitespace-pre-wrap">
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
                onBlur={handleEmailBlur}
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

              {isRegisterMode && (
                <p className="text-[10px] text-zinc-500 leading-tight">
                  Password must be at least 12 characters and contain uppercase, lowercase, numbers, and symbols. Common passwords and sequential keys are barred.
                </p>
              )}

              {/* Dynamic Turnstile CAPTCHA Widget Placement */}
              {showCaptcha && (
                <div className="my-2 flex flex-col items-center">
                  <span className="text-xs text-zinc-500 mb-1.5 font-medium">Security Verification Challenge</span>
                  <div id="turnstile-container" className="min-h-[65px]" />
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full mt-2 h-11 cursor-pointer" isLoading={submitting}>
                {isRegisterMode ? 'Register Account' : 'Authenticate Session'}
              </Button>
            </form>

            {/* Quick Demo Pre-fill triggers for ease of manual testing */}
            <div className="mt-6 border-t border-zinc-900/50 pt-5 text-center">
              <span className="text-xs font-semibold text-zinc-600 uppercase tracking-widest block mb-3">
                Quick Demo Prefills
              </span>
              <div className="flex gap-2.5">
                <Button 
                  onClick={() => prefill('user')} 
                  variant="secondary" 
                  className="flex-1 text-xs py-1.5 font-bold hover:border-indigo-500/20 cursor-pointer"
                >
                  Prefill User
                </Button>
                <Button 
                  onClick={() => prefill('admin')} 
                  variant="secondary" 
                  className="flex-1 text-xs py-1.5 font-bold hover:border-indigo-500/20 cursor-pointer"
                >
                  Prefill Admin
                </Button>
              </div>
            </div>

            {/* Switch between Signin and Register views */}
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
