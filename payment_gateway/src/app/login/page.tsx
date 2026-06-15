'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../components/providers';
import { Button, Input, Select, Card, CardHeader, CardTitle, CardDescription, CardContent } from '../../components/ui';
import { Loader2, Eye, EyeOff, RotateCcw } from 'lucide-react';
import api from '../../services/api';

export default function LoginPage() {
  const { login, register, isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Password hide/unhide and confirmation states
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  // Security CAPTCHA states
  const [captchaRequired, setCaptchaRequired] = useState(false);
  const [captchaShown, setCaptchaShown] = useState(false);
  const [captchaId, setCaptchaId] = useState('');
  const [captchaValue, setCaptchaValue] = useState('');
  const [captchaSvg, setCaptchaSvg] = useState('');
  const [captchaLoading, setCaptchaLoading] = useState(false);

  // If already logged in, redirect user straight to their dashboard
  useEffect(() => {
    if (isAuthenticated && !isLoading) {
      router.push('/dashboard');
    }
  }, [isAuthenticated, isLoading, router]);

  // Show CAPTCHA always for both login and registration
  const showCaptcha = true;

  // Fetch SVG CAPTCHA from backend
  const fetchCaptcha = async () => {
    setCaptchaLoading(true);
    try {
      setCaptchaValue('');
      const res = await api.get('/auth/captcha');
      setCaptchaId(res.data.captchaId);
      setCaptchaSvg(res.data.captchaSvg);
    } catch (err) {
      console.error('Failed to fetch CAPTCHA challenge:', err);
      setErrorMsg('Failed to load security CAPTCHA. Please try again.');
    } finally {
      setCaptchaLoading(false);
    }
  };

  // Clear value and load new captcha whenever captcha visibility changes
  useEffect(() => {
    setCaptchaValue('');
    if (showCaptcha) {
      fetchCaptcha();
    } else {
      setCaptchaId('');
      setCaptchaSvg('');
    }
  }, [isRegisterMode, captchaShown, captchaRequired]);

  // Check if email has failed logins and needs CAPTCHA
  const handleEmailBlur = async () => {
    if (isRegisterMode || !email) return;
    try {
      const res = await api.get(`/auth/captcha-required?email=${encodeURIComponent(email)}`);
      setCaptchaRequired(res.data.captchaRequired);
      setCaptchaShown(res.data.captchaShown);
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
    if (showCaptcha && (!captchaId || !captchaValue)) {
      setErrorMsg('Please complete the CAPTCHA verification check.');
      return;
    }

    setSubmitting(true);

    try {
      if (isRegisterMode) {
        if (!name) {
          throw new Error('Name is required for registration');
        }
        if (password !== confirmPassword) {
          throw new Error('Passwords do not match');
        }
        if (!validatePasswordClient(password)) {
          setSubmitting(false);
          return;
        }
        await register(name, email, password, confirmPassword, captchaId, captchaValue);
      } else {
        await login(email, password, captchaId, captchaValue);
      }
      router.push('/dashboard');
    } catch (err: any) {
      console.error(err);
      const rawMsg = err.response?.data?.message;
      const formattedMsg = Array.isArray(rawMsg) ? rawMsg.join('\n') : rawMsg;
      setErrorMsg(
        formattedMsg || 
        err.message || 
        'Authentication failed. Please check your credentials.'
      );

      // Re-trigger CAPTCHA requirement check on error
      if (!isRegisterMode) {
        await handleEmailBlur();
      }

      // Since CAPTCHA is one-time use, refresh it on error if visible
      if (showCaptcha) {
        fetchCaptcha();
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
      setConfirmPassword('Subham@1234');
      setName('System Administrator');
    } else {
      setEmail('user@regilly.com');
      setPassword('Subham@1234');
      setConfirmPassword('Subham@1234');
      setName('Subham Bose');
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
              <div role="alert" className="mb-4 rounded-lg bg-red-900/10 border border-red-500/20 p-3.5 text-xs font-medium text-red-400 text-center whitespace-pre-wrap">
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

              {isRegisterMode && (
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
              )}

              {isRegisterMode && (
                <p className="text-[10px] text-zinc-500 leading-tight">
                  Password must be at least 12 characters and contain uppercase, lowercase, numbers, and symbols. Common passwords and sequential keys are barred.
                </p>
              )}

              {/* Security CAPTCHA Challenge Component */}
              {showCaptcha && (
                <div className="my-2 p-4 rounded-xl border border-white/[0.08] bg-zinc-900/40 backdrop-blur-md flex flex-col gap-3 transition-all duration-300 hover:border-white/[0.12]">
                  <div className="flex flex-col gap-1">
                    <span id="captcha-label" className="text-xs text-zinc-400 font-semibold uppercase tracking-wider text-center">
                      Security Verification Challenge
                    </span>
                    <span id="captcha-desc" className="text-[10px] text-zinc-500 text-center">
                      Please enter the characters shown in the image below to verify you are a human.
                    </span>
                  </div>
                  
                  <div className="flex gap-3 items-center justify-center">
                    {captchaSvg ? (
                      <div 
                        dangerouslySetInnerHTML={{ __html: captchaSvg }} 
                        aria-label="Visual security verification code image"
                        role="img"
                        className="rounded-lg overflow-hidden border border-white/[0.08] bg-[#111827] flex items-center justify-center select-none shadow-inner h-[50px] w-[150px] transition-all duration-300 hover:border-indigo-500/30"
                      />
                    ) : (
                      <div 
                        aria-label="Loading security captcha"
                        role="status"
                        className="h-[50px] w-[150px] rounded-lg border border-zinc-800 bg-zinc-900/40 animate-pulse flex items-center justify-center text-xs text-zinc-600"
                      >
                        <Loader2 className="h-4 w-4 animate-spin text-zinc-500" />
                      </div>
                    )}
                    <button 
                      type="button" 
                      onClick={fetchCaptcha}
                      disabled={captchaLoading}
                      aria-label="Generate New CAPTCHA"
                      title="Generate New CAPTCHA"
                      className="h-[50px] w-[50px] flex items-center justify-center p-0 cursor-pointer border border-white/[0.08] bg-zinc-900/50 hover:bg-zinc-800/80 hover:border-indigo-500/40 text-zinc-400 hover:text-zinc-200 transition-all rounded-full outline-none focus:ring-2 focus:ring-indigo-500/50 group"
                    >
                      <RotateCcw className={`h-5 w-5 ${captchaLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'}`} />
                    </button>
                  </div>
                  <Input
                    placeholder="Enter verification text"
                    value={captchaValue}
                    aria-required="true"
                    aria-describedby="captcha-desc"
                    aria-labelledby="captcha-label"
                    onChange={(e) => {
                      setCaptchaValue(e.target.value);
                      setErrorMsg('');
                    }}
                    className="text-center font-mono tracking-widest text-base bg-zinc-900/60 uppercase border-white/[0.08] focus:border-indigo-500/50"
                    maxLength={5}
                    required
                  />
                </div>
              )}

              <Button type="submit" variant="primary" className="w-full mt-2 h-11 cursor-pointer" isLoading={submitting}>
                {isRegisterMode ? 'Register Account' : 'Authenticate Session'}
              </Button>
            </form>

            {/* Quick Demo Pre-fill triggers for ease of manual testing */}
            {!isRegisterMode && (
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
            )}

            {/* Switch between Signin and Register views */}
            <div className="mt-5 text-center">
              <button
                onClick={() => {
                  setIsRegisterMode(!isRegisterMode);
                  setErrorMsg('');
                  setConfirmPassword('');
                  setShowPassword(false);
                  setShowConfirmPassword(false);
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
