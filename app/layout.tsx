import type { Metadata } from 'next';
import { Geist, Geist_Mono, Space_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import './globals.css';

// Closest free analog to Roobert (the Clay typeface, not licensable for free use).
// When a Roobert license is secured, swap this block for next/font/local without
// touching anywhere else — CSS variables stay the same.
const display = Geist({ subsets: ['latin'], variable: '--font-sans', display: 'swap' });
const mono = Space_Mono({
  subsets: ['latin'],
  variable: '--font-mono',
  weight: ['400', '700'],
  display: 'swap',
});
// Loaded but unused right now — reserved for future code-like labels if we
// want a Geist Mono variant instead of Space Mono.
const _geistMono = Geist_Mono({
  subsets: ['latin'],
  variable: '--font-geist-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Saathi — a companion on the flight home',
    template: '%s · Saathi',
  },
  description:
    'Saathi pairs elderly travellers with solo travellers already flying the same route, so no parent has to navigate an unfamiliar airport alone.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'https://saathi.travel'),
  openGraph: {
    type: 'website',
    siteName: 'Saathi',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#000000',
          borderRadius: '12px',
          fontFamily: 'var(--font-sans), system-ui, sans-serif',
        },
      }}
    >
      <html lang="en" className={`${display.variable} ${mono.variable} ${_geistMono.variable}`}>
        <body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
        </body>
      </html>
    </ClerkProvider>
  );
}
