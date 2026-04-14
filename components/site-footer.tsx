import Link from 'next/link';

export function SiteFooter() {
  return (
    <footer className="mt-20 px-4 pb-10">
      <div className="container rounded-[40px] border border-oat bg-card p-10 shadow-clay">
        <div className="grid gap-10 text-sm md:grid-cols-4">
          <div className="md:col-span-1">
            <div className="font-display text-2xl font-semibold tracking-tight">Saathi</div>
            <p className="clay-label mt-1">साथी</p>
            <p className="mt-4 max-w-xs text-warm-charcoal">
              A matchmaking platform for elderly travellers and the solo travellers already flying
              their route. Saathi makes the introduction — nothing more.
            </p>
          </div>
          <nav className="space-y-3">
            <div className="clay-label">Product</div>
            <ul className="space-y-2">
              <li>
                <Link href="/search" className="text-warm-charcoal hover:text-foreground">
                  Browse trips
                </Link>
              </li>
              <li>
                <Link href="/post/request" className="text-warm-charcoal hover:text-foreground">
                  Post a request
                </Link>
              </li>
              <li>
                <Link href="/post/offer" className="text-warm-charcoal hover:text-foreground">
                  Offer to help
                </Link>
              </li>
            </ul>
          </nav>
          <nav className="space-y-3">
            <div className="clay-label">Company</div>
            <ul className="space-y-2">
              <li>
                <Link href="/about" className="text-warm-charcoal hover:text-foreground">
                  About &amp; trust
                </Link>
              </li>
              <li>
                <Link href="/faq" className="text-warm-charcoal hover:text-foreground">
                  FAQ
                </Link>
              </li>
              <li>
                <a
                  href="https://github.com/raahulrahl/sathi"
                  target="_blank"
                  rel="noreferrer"
                  className="text-warm-charcoal hover:text-foreground"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </nav>
          <nav className="space-y-3">
            <div className="clay-label">Legal</div>
            <ul className="space-y-2">
              <li>
                <Link href="/terms" className="text-warm-charcoal hover:text-foreground">
                  Terms
                </Link>
              </li>
              <li>
                <Link href="/privacy" className="text-warm-charcoal hover:text-foreground">
                  Privacy
                </Link>
              </li>
            </ul>
          </nav>
        </div>
        <div className="mt-10 flex flex-wrap items-center justify-between gap-3 border-t border-dashed border-oat pt-6 text-xs text-warm-silver">
          <p>
            Saathi is an introduction service. You are responsible for your own arrangement,
            payment, and travel.
          </p>
          <p>© {new Date().getFullYear()} Saathi · Open source on GitHub</p>
        </div>
      </div>
    </footer>
  );
}
