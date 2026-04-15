import type { Metadata } from 'next';
import { Geist, Space_Mono } from 'next/font/google';
import { ClerkProvider } from '@clerk/nextjs';
import { Analytics } from '@vercel/analytics/next';
import { SpeedInsights } from '@vercel/speed-insights/next';
import { SiteHeader } from '@/components/site-header';
import { SiteFooter } from '@/components/site-footer';
import { siteUrl } from '@/lib/site';
import './globals.css';

// Analytics + Speed Insights are no-ops outside Vercel and gate themselves
// on prod by default — safe to mount in the root layout. Analytics ships
// pageview events; SpeedInsights ships INP / LCP / CLS to the Vercel
// dashboard (replaces the stalled "how do we know if it's slow?" loop with
// real data, no extra runtime cost in dev).

// Header + footer stay on every page including /onboarding. An earlier
// revision hid them on focused flows, but the result read as "broken
// page" — the user correctly flagged the continuity break. The
// HideOnRoute helper in components/hide-on-route.tsx is kept for future
// focused flows (e.g. the real payment flow when we build it) but isn't
// wired in here by default.

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

export const metadata: Metadata = {
  title: {
    default: 'Saathi — a companion on the flight home',
    template: '%s · Saathi',
  },
  description:
    'Saathi pairs elderly travellers with solo travellers already flying the same route, so no parent has to navigate an unfamiliar airport alone.',
  applicationName: 'Saathi',
  metadataBase: new URL(siteUrl()),
  // Prevent search engines from de-duplicating www vs apex into the wrong
  // canonical when crawling. Pages can still set their own alternate.
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    siteName: 'Saathi',
    locale: 'en_GB',
    url: '/',
  },
  // Twitter renders large_image cards when the OG image is 1200×630, which
  // matches our default opengraph-image.tsx — no separate twitter-image
  // needed unless we want a different crop.
  twitter: {
    card: 'summary_large_image',
    creator: '@getsaathi',
  },
  // Authoritative crawler hint. Robots.ts handles the "what to skip"
  // half; this is the per-page "yes do index this" half.
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large' },
  },
  // Tells crawlers + browsers what the site is about even when JS is
  // off (RSS, etc. would slot in here later).
  category: 'travel',
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
      <html lang="en" className={`${display.variable} ${mono.variable}`}>
        <body className="flex min-h-screen flex-col bg-background font-sans text-foreground antialiased">
          <SiteHeader />
          <main className="flex-1">{children}</main>
          <SiteFooter />
          <Analytics />
          <SpeedInsights />
        </body>
      </html>
    </ClerkProvider>
  );
}
