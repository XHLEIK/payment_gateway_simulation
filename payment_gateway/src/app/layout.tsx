import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from '../components/providers';

// Load Geist fonts from Google Fonts directly to avoid local asset files
const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// Metadata configuration for the page header (improves tab titles and SEO summaries)
export const metadata: Metadata = {
  title: 'Regilly Payment Gateway & Wallet Dashboard',
  description: 'Official Payment Gateway and Wallet Administration Dashboard for Regilly portals.',
};

// Root layout that wraps all Next.js subpages.
// Configures custom fonts, loads global CSS files, sets default dark-mode styling,
// and injects the global Auth & Query Clients Providers wrapper.
export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased dark`}
    >
      <body className="min-h-full flex flex-col bg-zinc-950 text-zinc-50 font-sans">
        {/* Providers wraps React Query Clients and local authentication hooks */}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
