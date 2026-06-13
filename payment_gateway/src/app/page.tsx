'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../components/providers';
import { Loader2 } from 'lucide-react';

// Root index page component.
// Serves as a traffic director: checks if the user session has a valid JWT,
// sending them to /dashboard or redirecting them to /login.
export default function IndexPage() {
  const { isAuthenticated, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    // Wait until auth loading state finishes (avoids layout flashes/redirect loops)
    if (!isLoading) {
      if (isAuthenticated) {
        router.push('/dashboard');
      } else {
        router.push('/login');
      }
    }
  }, [isAuthenticated, isLoading, router]);

  // Temporary splash screen during redirect check
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-zinc-950">
      <Loader2 className="h-10 w-10 animate-spin text-indigo-500 mb-2" />
      <p className="text-zinc-500 text-sm font-semibold">Redirecting to Portal...</p>
    </div>
  );
}
