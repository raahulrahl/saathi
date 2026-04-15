import Link from 'next/link';
import { auth } from '@clerk/nextjs/server';
import { FlightComposer } from '@/components/flight-composer';
import { PeekWidget } from '@/components/peek-widget';
import { createSupabaseServerClient } from '@/lib/supabase/server';

/**
 * Landing page — written for aunties, uncles, and the daughters and sons
 * posting for them. Not for SaaS buyers.
 *
 * Shape: hero + flight composer, one prose block that explains the whole
 * thing in two paragraphs, one example post that reads like a note, one
 * line showing who's around, one closing action. No eyebrow labels, no
 * feature cards, no side-by-side testimonial columns.
 */

export default async function LandingPage() {
  let viewerRole: 'family' | 'companion' | null = null;
  const { userId } = await auth();
  if (userId) {
    const supabase = await createSupabaseServerClient();
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', userId)
      .maybeSingle();
    if (profile?.role === 'family' || profile?.role === 'companion') {
      viewerRole = profile.role;
    }
  }

  return (
    <div className="flex flex-col">
      {/* ------------------------------------------------------------------
          HERO — badge, one-line headline, one-sentence subtext, composer.
          No floating doodles: they were contributing to the asymmetry and
          the SaaS feel.
         ------------------------------------------------------------------ */}
      <section>
        <div className="container flex flex-col items-center gap-10 py-16 md:py-20">
          <div className="flex max-w-3xl flex-col items-center gap-5 text-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-oat bg-white px-3 py-1 text-xs font-medium text-warm-charcoal">
              <span className="font-semibold text-marigold-700">साथी</span> · a little community for
              travel days
            </span>
            <h1 className="max-w-3xl text-balance font-display text-4xl font-semibold leading-[1.1] tracking-[-0.02em] text-foreground md:text-5xl lg:text-[56px]">
              Find someone kind on <span className="text-marigold-700">Ma&rsquo;s</span> flight.
            </h1>
            <p className="max-w-2xl text-balance text-lg leading-relaxed text-warm-charcoal">
              Saathi is a small community of travellers who look out for each other&rsquo;s parents
              through unfamiliar airports. Tell us the flight — we&rsquo;ll find someone who speaks
              her language.
            </p>
          </div>

          <FlightComposer
            variant="hero"
            defaultMode="seek"
            viewerRole={viewerRole}
            className="max-w-4xl"
          />
        </div>
      </section>

      {/* ------------------------------------------------------------------
          PEEK — answers the chicken-and-egg question: "Should I buy the
          ticket?" Both sides of the market need this. A family checking
          sees if any companions have already posted for that week; a
          companion checking sees if any families are already looking. The
          widget is visually quieter than the main composer (dashed border,
          no shadow) so people don't fill both — this is a peek, the other
          is a commit.
         ------------------------------------------------------------------ */}
      <section className="container max-w-4xl pb-12 pt-0">
        <div className="mx-auto max-w-2xl space-y-2 text-center">
          <h2 className="font-display text-2xl font-semibold leading-tight tracking-[-0.02em] md:text-3xl">
            Haven&rsquo;t booked the ticket yet?
          </h2>
          <p className="text-base leading-relaxed text-warm-charcoal">
            Before you buy a seat, peek at who&rsquo;s already flying that week. Only book the
            ticket if you can see a saathi on it.
          </p>
        </div>
        <PeekWidget className="mx-auto mt-6 max-w-3xl" />
      </section>

      {/* ------------------------------------------------------------------
          NOTICE CARD — a fixed-width bordered card that replaces the two
          paragraphs of prose. Previous copy was ~135 words; this is ~40.
          The example blockquote sits directly below and does the concrete
          work of showing what a real post looks like.
         ------------------------------------------------------------------ */}
      <section className="container max-w-2xl pb-6 pt-2">
        <div className="mx-auto max-w-xl rounded-2xl border border-oat bg-white p-6 md:p-8">
          <p className="text-base leading-relaxed text-warm-charcoal md:text-lg">
            A <b className="text-foreground">real match</b> is someone on the exact same plane as
            your parent — same flight number, not just the same route — who actually speaks her
            language. Thank-yous go between the two of you. We never touch the money.
          </p>
        </div>

        {/* One example post. Styled as a note, not a testimonial — no round
            initial avatar, no framed card, no "A note from Priya" eyebrow. */}
        <figure className="mx-auto mt-8 max-w-xl rounded-2xl border border-marigold-200/80 bg-marigold-50 p-6 md:p-7">
          <blockquote className="font-display text-lg leading-snug text-foreground md:text-xl">
            &ldquo;Ma flies <span className="font-mono">CCU → AMS via DOH</span> on 14 December. She
            speaks <b className="text-marigold-700">Bengali</b> and a little English. Offering €20
            for anyone on the same flight who can walk her through the transfer at Doha.&rdquo;
          </blockquote>
          <figcaption className="mt-4 text-sm text-warm-charcoal">— Priya, Amsterdam</figcaption>
        </figure>
      </section>

      {/* ------------------------------------------------------------------
          MARQUEE — ambient left-drift strip showing who's around. No arrows,
          no clicks, no auto-advance buttons. Hover pauses motion. Content is
          duplicated so the translateX(-50%) loop is seamless. Respects
          prefers-reduced-motion via the .clay-hover reset (animate-marquee
          also stops under that media query — see globals.css).
         ------------------------------------------------------------------ */}
      <section className="py-12">
        <div className="container mb-4 text-center">
          <p className="text-xs font-medium uppercase tracking-[0.12em] text-warm-silver">
            Around today
          </p>
        </div>

        <div
          className="relative overflow-hidden"
          style={{
            maskImage: 'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
            WebkitMaskImage:
              'linear-gradient(to right, transparent, black 8%, black 92%, transparent)',
          }}
        >
          <ul className="flex w-max animate-marquee gap-8 py-2 hover:[animation-play-state:paused] md:gap-10">
            {[...AROUND_TODAY, ...AROUND_TODAY].map((entry, i) => (
              <li
                key={i}
                className="flex shrink-0 items-center gap-2.5 text-sm leading-none text-warm-charcoal"
              >
                <span className={`size-2 shrink-0 rounded-full ${entry.dot}`} aria-hidden />
                <span className="font-medium text-foreground">{entry.name}</span>
                <span className="text-warm-silver">·</span>
                <span>{entry.language}</span>
                <span className="text-warm-silver">·</span>
                <span>{entry.location}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="container mt-4 text-center">
          <p className="text-xs text-warm-silver">
            Examples for now: real people appear here as they join.{' '}
            <Link href="/search" className="text-marigold-700 underline-offset-4 hover:underline">
              See everyone →
            </Link>
          </p>
        </div>
      </section>

      {/* ------------------------------------------------------------------
          CLOSING — one action, one line of reassurance. The hero composer
          already handles both modes; this is just for people who scrolled.
         ------------------------------------------------------------------ */}
      <section className="container pb-24 pt-4 text-center">
        <Link
          href="/post/request"
          className="clay-hover inline-flex h-12 items-center justify-center rounded-full bg-foreground px-8 text-sm font-semibold text-background"
        >
          Post a flight
        </Link>
        <p className="mt-3 text-sm text-warm-silver">Takes a minute. Free. Always will be.</p>
      </section>
    </div>
  );
}

/**
 * Placeholder "around today" roster for the ambient marquee. These are
 * illustrative — the small caption under the strip calls out that they're
 * examples. When real users start joining, this array gets replaced by a
 * live query (probably server-fetched and cached, not client-side, since
 * the marquee can be stale by minutes without consequence).
 */
const AROUND_TODAY: Array<{
  name: string;
  language: string;
  location: string;
  dot: string;
}> = [
  { name: 'Arjun', language: 'Bengali', location: 'Delft', dot: 'bg-matcha-600' },
  { name: 'Meera', language: 'Tamil', location: 'Berlin', dot: 'bg-ube-800' },
  { name: 'Yusuf', language: 'Urdu', location: 'Amsterdam', dot: 'bg-lemon-700' },
  { name: 'Priya', language: 'Bengali', location: 'for Ma · Dec 14', dot: 'bg-pomegranate-400' },
  { name: 'Ravi', language: 'Telugu', location: 'Singapore', dot: 'bg-slushie-500' },
  { name: 'Farah', language: 'Arabic', location: 'Dubai', dot: 'bg-matcha-600' },
  { name: 'Asha', language: 'Gujarati', location: 'Nairobi', dot: 'bg-lemon-700' },
  { name: 'Lin', language: 'Mandarin', location: 'Bangkok', dot: 'bg-ube-800' },
];
