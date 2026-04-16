import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

/**
 * Top navigation bar rendered on every page via the root layout.
 * Server component so the signed-in check happens without a client-side
 * round-trip. Clerk's <UserButton> handles its own interactivity on the
 * client side.
 */
export async function SiteHeader() {
  const { userId } = await auth();
  const signedIn = !!userId;

  return (
    <header className="sticky top-0 z-40 w-full border-b border-oat bg-background/85 backdrop-blur">
      <div className="container flex h-16 items-center justify-between gap-4">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="text-2xl leading-none" aria-hidden>
            🌼
          </span>
          <span className="font-display text-2xl font-semibold tracking-tight">Saathi</span>
          <span className="clay-label hidden sm:inline">साथी</span>
        </Link>
        <nav className="hidden items-center gap-8 text-sm md:flex">
          <Link href="/about" className="font-medium text-warm-charcoal hover:text-foreground">
            About &amp; trust
          </Link>
          <Link href="/faq" className="font-medium text-warm-charcoal hover:text-foreground">
            FAQ
          </Link>
        </nav>
        <div className="flex items-center gap-2">
          {signedIn ? (
            <>
              {/* Dashboard is the single entry point for posting — the
                  "New offer" and "New request" buttons live there. A third
                  shortcut up here was clutter once dashboard covered it. */}
              <Button asChild size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: 'size-8',
                  },
                }}
              />
            </>
          ) : (
            <>
              <Button asChild variant="ghost" size="sm">
                <Link href="/auth/sign-in">Sign in</Link>
              </Button>
              {/* Signed-out visitors can't reach /dashboard, so the post
                  CTA stays here as a conversion path. Sends them through
                  sign-in and lands them on the request flow after. */}
              <Button asChild size="sm">
                <Link href="/auth/sign-in?redirect_url=/dashboard/new/request">Post a trip</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
