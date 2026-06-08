import { Suspense } from 'react';
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AuthProvider } from '@/lib/auth-context';
import { AppFrame } from '@/components/shell/AppFrame';
import { NavigationLogger } from '@/components/NavigationLogger';

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Jharanai · Ops Console',
  description: 'Jharanai dairy CRM — Operations dashboard for Rushikulya Agro Pvt. Ltd.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className={inter.className}>
        <AuthProvider>
          {/* Logs every route change to the backend so navigations show
              up in apps/backend/logs/server.log. Wrapped in Suspense
              because useSearchParams() suspends in Next.js App Router. */}
          <Suspense fallback={null}>
            <NavigationLogger />
          </Suspense>
          <AppFrame>{children}</AppFrame>
        </AuthProvider>
      </body>
    </html>
  );
}
