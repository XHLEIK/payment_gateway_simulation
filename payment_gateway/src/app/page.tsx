'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/providers';
import { Loader2 } from 'lucide-react';

export default function IndexPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-2" />
      <p className="text-zinc-500 text-sm font-semibold">Redirecting to Portal...</p>
    </div>
  );
}
