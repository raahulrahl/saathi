import Link from 'next/link';
import { Heart, Plane, ShieldCheck, Users } from 'lucide-react';
import { RouteSearch } from '@/components/route-search';
import { Card, CardContent } from '@/components/ui/card';

export default function LandingPage() {
  return (
    <div className="flex flex-col">
      {/* Hero */}
      <section className="relative overflow-hidden bg-gradient-to-br from-saffron-50 via-background to-background">
        <div className="container flex flex-col items-center gap-10 py-16 md:py-24">
          <div className="flex max-w-3xl flex-col items-center gap-5 text-center">
            <span className="rounded-full border bg-card px-3 py-1 text-xs uppercase tracking-[0.15em] text-muted-foreground">
              साथी · a companion on the flight home
            </span>
            <h1 className="font-serif text-4xl leading-tight text-foreground sm:text-5xl md:text-6xl">
              No parent should have to navigate an unfamiliar airport alone.
            </h1>
            <p className="max-w-xl text-balance text-lg text-muted-foreground">
              Saathi pairs elderly travellers with solo travellers already on the same flight. A
              small thank-you, a shared language, a familiar face at the gate.
            </p>
          </div>

          <RouteSearch className="w-full max-w-4xl" />

          <p className="text-xs text-muted-foreground">
            Browse freely. Sign in when you want to post a trip or send a request.
          </p>
        </div>
      </section>

      {/* How it works */}
      <section className="container py-16">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-serif text-3xl">How it works</h2>
          <p className="mt-2 text-muted-foreground">
            Three steps. No payment rails. No document uploads.
          </p>
        </div>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {STEPS.map((step, i) => (
            <Card key={step.title}>
              <CardContent className="space-y-3 p-6">
                <div className="flex size-10 items-center justify-center rounded-full bg-saffron-100 font-serif text-saffron-700">
                  {i + 1}
                </div>
                <h3 className="font-serif text-xl">{step.title}</h3>
                <p className="text-sm text-muted-foreground">{step.body}</p>
              </CardContent>
            </Card>
          ))}
        </div>
        <p className="mx-auto mt-10 max-w-2xl text-center text-sm text-muted-foreground">
          Saathi is an{' '}
          <a
            href="https://github.com/raahulrahl/sathi"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            open-source project
          </a>{' '}
          — the matching logic, the schema, the trust rules are all public. Read the code, open an
          issue, send a PR.
        </p>
      </section>

      {/* Why Saathi */}
      <section className="bg-muted/40 py-16">
        <div className="container grid gap-10 md:grid-cols-[1fr_1.2fr] md:items-center">
          <div>
            <h2 className="font-serif text-3xl">Built around language, not paperwork.</h2>
            <p className="mt-4 text-muted-foreground">
              Passport uploads don't make anyone safer. A Bengali-speaking student at Schiphol does.
              Saathi ranks companions by the language they share with your parent, not by how shiny
              their profile looks.
            </p>
            <ul className="mt-6 space-y-3 text-sm">
              <li className="flex gap-3">
                <Heart className="mt-0.5 size-5 shrink-0 text-saffron-600" />
                <span>
                  A shared mother tongue is the first thing families look for. The card shows it
                  first, bolded.
                </span>
              </li>
              <li className="flex gap-3">
                <ShieldCheck className="mt-0.5 size-5 shrink-0 text-saffron-600" />
                <span>
                  Trust comes from a social graph: LinkedIn, X, WhatsApp — two or more, verified,
                  visible.
                </span>
              </li>
              <li className="flex gap-3">
                <Users className="mt-0.5 size-5 shrink-0 text-saffron-600" />
                <span>
                  Reviews unlock only after both parties confirm the trip happened. No drive-by
                  ratings.
                </span>
              </li>
            </ul>
          </div>
          <div className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="text-xs uppercase tracking-[0.15em] text-muted-foreground">
              An example
            </div>
            <p className="mt-3 font-serif text-lg leading-relaxed">
              &ldquo;Ma flies <b>CCU → AMS via DOH</b> on 14 December. She speaks <b>Bengali</b> and
              a little English. We&rsquo;re offering a €20 thank-you for someone on the same flight
              who can help with the transfer at Doha.&rdquo;
            </p>
            <p className="mt-4 text-sm text-muted-foreground">
              Saathi surfaces the handful of Bengali-speaking students on that exact route this
              week. You pick, chat, and meet at the gate.
            </p>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="container py-16 text-center">
        <div className="mx-auto max-w-2xl space-y-4">
          <Plane className="mx-auto size-10 text-saffron-600" aria-hidden />
          <h2 className="font-serif text-3xl">Ready to find a Saathi?</h2>
          <p className="text-muted-foreground">
            Search above or post your own trip. Signing up takes a minute — linking your second
            verification channel takes another two.
          </p>
          <div className="flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/post/request"
              className="inline-flex h-11 items-center rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              I'm a family member
            </Link>
            <Link
              href="/post/offer"
              className="inline-flex h-11 items-center rounded-md border bg-background px-5 text-sm font-medium hover:bg-accent"
            >
              I'm a solo traveller
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
    body: 'Route, date, languages, age band, what help is needed. Multi-leg flights supported — layovers are often where parents struggle.',
  },
  {
    title: 'Match by language',
    body: 'Saathi ranks every solo traveller on that route by the language they share with your parent, then by date proximity and trust signals.',
  },
  {
    title: 'Chat and meet',
    body: 'Accept a request, unlock contacts, chat in-app, arrange a thank-you in your own currency. We never touch the money.',
  },
];
