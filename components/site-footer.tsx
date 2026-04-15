import Link from 'next/link';
import { Github, Mail, Twitter } from 'lucide-react';

/**
 * Site footer — one consistent slim row used on every page.
 *
 * Earlier iterations split this into a "cool" 4-column version for
 * marketing pages and a compact row for app pages. That drew feedback
 * about the footer feeling too heavy on signed-in flows, so the compact
 * layout won for everywhere — marketing pages look slightly less
 * branded but every page now feels consistent and the scroll cost is
 * bounded to ~60px.
 *
 * Components:
 *   - Wordmark + साथी subtitle on the left
 *   - Status pill with pulsing matcha dot (links to /status)
 *   - Inline link row (GitHub, Contact, Privacy, Terms)
 *   - Social icon triplet (GitHub, Twitter, Email)
 *   - Copyright on the right
 *
 * Server component — no interactivity beyond normal anchor/link clicks.
 */

const GITHUB_URL = 'https://github.com/raahulrahl/saathi';
const TWITTER_URL = 'https://twitter.com/getsaathi';
const CONTACT_EMAIL = 'hello@getsaathi.com';
const MAILTO = `mailto:${CONTACT_EMAIL}`;

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-oat bg-background px-4 py-5">
      <div className="container flex flex-wrap items-center justify-between gap-4 text-xs text-muted-foreground">
        {/* ── Left: wordmark + status pill ───────────────────────────── */}
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/"
            className="flex items-baseline gap-1.5 font-display text-base font-semibold text-foreground"
          >
            <span className="leading-none" aria-hidden>
              🌼
            </span>
            Saathi
            <span className="text-sm font-normal text-warm-silver">साथी</span>
          </Link>

          <Link
            href="/status"
            className="inline-flex items-center gap-1.5 rounded-full border border-matcha-300/60 bg-matcha-300/10 px-2 py-0.5 text-[11px] font-medium text-matcha-800 transition-colors hover:bg-matcha-300/30"
          >
            <span className="relative flex size-1.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-matcha-600 opacity-70" />
              <span className="relative inline-flex size-1.5 rounded-full bg-matcha-600" />
            </span>
            operational
          </Link>
        </div>

        {/* ── Middle: link row ───────────────────────────────────────── */}
        <nav className="flex flex-wrap items-center gap-x-4 gap-y-1">
          <FooterLink href="/about">About</FooterLink>
          <FooterLink href="/faq">FAQ</FooterLink>
          <FooterLink href={MAILTO}>Contact</FooterLink>
          <FooterLink href="/privacy">Privacy</FooterLink>
          <FooterLink href="/terms">Terms</FooterLink>
          <FooterLink href={GITHUB_URL} external>
            GitHub
          </FooterLink>
        </nav>

        {/* ── Right: socials + copyright ─────────────────────────────── */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <SocialIcon href={GITHUB_URL} label="GitHub" Icon={Github} external />
            <SocialIcon href={TWITTER_URL} label="Twitter / X" Icon={Twitter} external />
            <SocialIcon href={MAILTO} label="Email" Icon={Mail} />
          </div>
          <span className="text-warm-silver">© {new Date().getFullYear()} Saathi</span>
        </div>
      </div>
    </footer>
  );
}

// ── Atoms ───────────────────────────────────────────────────────────────

function FooterLink({
  href,
  children,
  external,
}: {
  href: string;
  children: React.ReactNode;
  external?: boolean;
}) {
  const className = 'transition-colors hover:text-foreground';
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" className={className}>
        {children}
      </a>
    );
  }
  return (
    <Link href={href as '/'} className={className}>
      {children}
    </Link>
  );
}

function SocialIcon({
  href,
  label,
  Icon,
  external,
}: {
  href: string;
  label: string;
  Icon: typeof Github;
  external?: boolean;
}) {
  const common = {
    'aria-label': label,
    title: label,
    className:
      'flex size-7 items-center justify-center rounded-full border border-oat bg-background text-muted-foreground transition-all hover:border-matcha-600 hover:text-matcha-800',
  };
  if (external) {
    return (
      <a href={href} target="_blank" rel="noreferrer" {...common}>
        <Icon className="size-3.5" />
      </a>
    );
  }
  return (
    <a href={href} {...common}>
      <Icon className="size-3.5" />
    </a>
  );
}
