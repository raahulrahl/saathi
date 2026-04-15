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
          <Link href="/search" className="font-medium text-warm-charcoal hover:text-foreground">
            Browse
          </Link>
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
              <Button asChild variant="ghost" size="sm">
                <Link href="/dashboard">Dashboard</Link>
              </Button>
              <Button asChild size="sm">
                <Link href="/post/request">Post a trip</Link>
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
              <Button asChild size="sm">
                <Link href="/auth/sign-in?redirect_url=/post/request">Post a trip</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
