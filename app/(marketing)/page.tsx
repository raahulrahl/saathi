import Link from 'next/link';
import { Heart, Plane, ShieldCheck, Users } from 'lucide-react';
import { RouteSearch } from '@/components/route-search';
import { Card, CardContent } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero — cream canvas, huge Clay-scale display type, playful CTAs */}
      <section className="relative overflow-hidden">
        <div className="container flex flex-col items-center gap-10 py-16 md:py-28">
          <div className="flex max-w-4xl flex-col items-center gap-6 text-center">
            <span className="clay-label rounded-full border border-oat bg-white px-3 py-1">
              साथी · a companion on the flight home
            </span>
            <h1 className="max-w-4xl text-balance font-display text-5xl font-semibold leading-[1.02] tracking-[-0.04em] text-foreground md:text-7xl lg:text-[80px]">
              No parent should navigate an unfamiliar airport alone.
            </h1>
            <p className="max-w-xl text-balance text-xl text-warm-charcoal md:text-xl">
              Saathi pairs elderly travellers with solo travellers already on the same flight. A
              shared language, a familiar face at the gate, a small thank-you.
            </p>
          </div>

          <RouteSearch className="w-full max-w-4xl" />

          <p className="text-sm text-warm-silver">
            Browse freely. Sign in when you want to post a trip or send a request.
          </p>
        </div>
      </section>

      {/* How it works — white cards on cream */}
      <section className="container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <p className="clay-label">How it works</p>
          <h2 className="mt-3 font-display text-4xl font-semibold tracking-[-0.03em] md:text-[44px]">
            Three steps. No payment rails. No document uploads.
          </h2>
        </div>
        <div className="mt-12 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title} className="clay-hover hover:rotate-0">
              <CardContent className="space-y-4 p-6">
                <div
                  className={`flex size-10 items-center justify-center rounded-full font-display text-lg font-semibold ${step.accent}`}
                >
                  {i + 1}
                </div>
                <h3 className="font-display text-xl font-semibold tracking-tight">{step.title}</h3>
                <p className="text-base leading-relaxed text-warm-charcoal">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-warm-silver">
          Saathi is an{' '}
          <a
            href="https://github.com/raahulrahl/sathi"
            target="_blank"
            rel="noreferrer"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            open-source project
          </a>{' '}
          — the matching logic, the schema, the trust rules are all public. Read the code, open an
          issue, send a PR.
        </p>
      </section>

      {/* Language-first section — Matcha swatch background */}
      <section className="bg-matcha-800 py-20 text-white">
        <div className="container grid gap-10 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <p className="clay-label text-matcha-300">Language is the spine</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-5xl">
              Built around mother tongues, not paperwork.
            </h2>
            <p className="mt-5 text-lg leading-relaxed text-matcha-300">
              Passport uploads don&apos;t make anyone safer. A Bengali-speaking student at Schiphol
              does. Saathi ranks companions by the language they share with your parent, not by how
              shiny their profile looks.
            </p>
            <ul className="mt-6 space-y-3 text-base text-white/90">
              <li className="flex gap-3">
                <Heart className="mt-1 size-5 shrink-0 text-matcha-300" />
                <span>
                  A shared mother tongue is the first thing families look for. The card shows it
                  first, bolded.
                </span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-1 size-5 shrink-0 text-matcha-300" />
                <span>
                  Trust comes from a social graph: LinkedIn, X, WhatsApp — two or more, verified,
                  visible.
                </span>
              </li>
              <li className="flex gap-3">
                <Users className="mt-1 size-5 shrink-0 text-matcha-300" />
                <span>
                  Reviews unlock only after both parties confirm the trip happened. No drive-by
                  ratings.
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-3xl border border-matcha-300/40 bg-white/5 p-6 backdrop-blur md:p-8">
            <p className="clay-label text-matcha-300">An example</p>
            <p className="mt-3 font-display text-2xl leading-snug text-white md:text-3xl">
              &ldquo;Ma flies <span className="font-mono text-matcha-300">CCU → AMS via DOH</span>{' '}
              on 14 December. She speaks <b>Bengali</b> and a little English. We&rsquo;re offering a
              €20 thank-you for someone on the same flight who can help with the transfer at
              Doha.&rdquo;
            </p>
            <p className="mt-4 text-base text-matcha-300">
              Saathi surfaces the handful of Bengali-speaking students on that exact flight this
              week. You pick, chat, meet at the gate.
            </p>
          </div>
        </div>
      </section>

      {/* Flight-number section — Slushie cyan */}
      <section className="bg-slushie-500 py-20 text-foreground">
        <div className="container grid gap-10 md:grid-cols-[1.2fr_1fr] md:items-center">
          <div>
            <p className="clay-label text-slushie-800">Match on flight, not route</p>
            <h2 className="mt-3 font-display text-4xl font-semibold leading-[1.05] tracking-[-0.03em] md:text-5xl">
              Same plane. Not &ldquo;same-ish trip.&rdquo;
            </h2>
            <p className="mt-5 text-lg leading-relaxed">
              A student flying CCU → AMS on the 10th can&apos;t help a parent on the 14th, even if
              both are on the same route. Saathi filters strictly on flight number. Two people with{' '}
              <span className="font-mono font-semibold">QR540 · QR23</span> are on the same aircraft
              — that&apos;s the match we care about.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 rounded-3xl border-2 border-dashed border-foreground/20 bg-white p-6">
            <span className="rounded-full bg-foreground px-4 py-1.5 font-mono text-sm font-semibold text-white">
              ✈ QR540
            </span>
            <span className="rounded-full bg-foreground px-4 py-1.5 font-mono text-sm font-semibold text-white">
              ✈ QR23
            </span>
            <span className="rounded-full border border-oat bg-oat-light px-4 py-1.5 font-mono text-sm">
              ✈ LH757
            </span>
            <span className="rounded-full border border-oat bg-oat-light px-4 py-1.5 font-mono text-sm">
              ✈ KL870
            </span>
          </div>
        </div>
      </section>

      {/* CTA — warm cream with playful buttons */}
      <section className="container py-20 text-center">
        <div className="mx-auto max-w-2xl space-y-6">
          <Plane className="mx-auto size-10 -rotate-45 text-foreground" aria-hidden />
          <h2 className="font-display text-4xl font-semibold tracking-[-0.03em] md:text-5xl">
            Ready to find a Saathi?
          </h2>
          <p className="text-lg text-warm-charcoal">
            Search above or post your own trip. Signing up takes a minute — linking your second
            verification channel takes another two.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            <Link
              href="/post/request"
              className="clay-hover inline-flex h-12 items-center justify-center rounded-full bg-foreground px-6 text-sm font-medium text-background"
            >
              I&apos;m a family member
            </Link>
            <Link
              href="/post/offer"
              className="clay-hover inline-flex h-12 items-center justify-center rounded-full border border-oat bg-white px-6 text-sm font-medium text-foreground"
            >
              I&apos;m a solo traveller
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}

const STEPS = [
  {
    title: 'Describe the trip',
    body: 'Route, date, flight numbers, languages, age band, what help is needed. Multi-leg flights supported — layovers are often where parents struggle.',
    accent: 'bg-matcha-300 text-matcha-800',
  },
  {
    title: 'Match on flight + language',
    body: 'Saathi ranks everyone on the same flight by the language they share with your parent, then by trust signals and past reviews.',
    accent: 'bg-slushie-500 text-slushie-800',
  },
  {
    title: 'Chat and meet',
    body: 'Accept a request, unlock contacts, chat in-app, arrange a thank-you in your own currency. We never touch the money.',
    accent: 'bg-lemon-400 text-lemon-800',
  },
];
