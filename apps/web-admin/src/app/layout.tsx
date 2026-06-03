import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';
import { AdminShell } from '@/components/shell/AdminShell';

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
        <AdminShell>{children}</AdminShell>
      </body>
    </html>
  );
}
