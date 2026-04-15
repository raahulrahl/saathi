import type { Metadata } from 'next';
import Link from 'next/link';
import { Linkedin, MessageCircle, Twitter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

export const metadata: Metadata = {
  title: 'About & Trust',
  description:
    'Why Saathi exists, how two strangers become companions, and how we keep families safe.',
};

const CHANNELS = [
  {
    icon: Linkedin,
    name: 'LinkedIn',
    body: 'A real employer, a real network. Fake-able alone, but hard to fake alongside the others.',
  },
  {
    icon: Twitter,
    name: 'X (Twitter)',
    body: 'Account age and history are visible proxies for whether the person exists outside of this app.',
  },
  {
    icon: MessageCircle,
    name: 'WhatsApp',
    body: 'A one-time code on a working number. The lingua franca for families back home.',
  },
];

export default function AboutPage() {
  return (
    <article className="container max-w-3xl py-14">
      {/* ─── Chapter 1 — A specific scene ─────────────────────────────── */}
      <header>
        <p className="clay-label">Our story</p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl">It starts with a mother at a gate.</h1>
      </header>

      <section className="mt-8 space-y-4 text-base leading-relaxed text-warm-charcoal">
        <p>
          She&rsquo;s flown before — once, twice maybe — but it&rsquo;s been years. The announcement
          is in Dutch and English. Neither is hers. The signs are small. The kiosk wants a QR code
          she can&rsquo;t find. She&rsquo;s been travelling for fifteen hours and the next gate
          doesn&rsquo;t exist on her boarding pass.
        </p>
        <p>
          Somewhere in the terminal, a young woman heading back home to Amsterdam for the weekend is
          scrolling her phone. She could help. They speak the same language. They&rsquo;re on the
          same plane. They will never meet.
        </p>
      </section>

      {/* ─── Chapter 2 — The workaround ───────────────────────────────── */}
      <section className="mt-14 space-y-4">
        <h2 className="font-serif text-2xl md:text-3xl">
          The workaround already exists. It lives in WhatsApp.
        </h2>
        <p className="text-warm-charcoal">
          Every immigrant community runs one: a group chat, a Facebook post, a Reddit thread.
        </p>
        <blockquote className="border-l-4 border-marigold-400 bg-marigold-50 p-5 font-serif text-lg italic text-warm-charcoal">
          &ldquo;Anyone flying CCU → AMS via Doha on the 17th? My mother is travelling alone. She
          speaks Bengali and Hindi. Any company would help.&rdquo;
        </blockquote>
        <p className="text-warm-charcoal">
          Someone answers. They exchange numbers. The mother flies with a companion. It works every
          time it happens. The problem is that most of the time, <b>it doesn&rsquo;t happen</b>
          &nbsp;— because the WhatsApp group is small, and the right person isn&rsquo;t in it.
        </p>
      </section>

      {/* ─── Chapter 3 — What Saathi is ───────────────────────────────── */}
      <section className="mt-14 space-y-4">
        <h2 className="font-serif text-2xl md:text-3xl">Saathi is that post, made searchable.</h2>
        <p className="text-warm-charcoal">
          You fill in a short form — flight number, date, who&rsquo;s travelling, what kind of help
          would be welcome. It goes live. Somewhere, a traveller on the same flight sees it. We
          match on language first, flight number second, date third.
        </p>
        <p className="text-warm-charcoal">
          The match sends a short message. If accepted, contact details unlock — and then the two of
          them arrange everything else on their own, over WhatsApp, the way it&rsquo;s always
          worked.
        </p>
        <p className="text-warm-charcoal">
          Money, if any, moves between them directly — Revolut, UPI, cash at the gate. We
          don&rsquo;t touch it. That keeps us out of payments licensing, out of disputes, and lets
          us stay what we are: an introduction service.
        </p>
      </section>

      {/* ─── Chapter 4 — Trust ────────────────────────────────────────── */}
      <section className="mt-14 space-y-4">
        <h2 className="font-serif text-2xl md:text-3xl">Trust, without paperwork.</h2>
        <p className="text-warm-charcoal">
          We don&rsquo;t ask for passport scans. Verification is <b>social-graph based</b>: every
          user connects at least two of LinkedIn, X, or WhatsApp before they can post a trip or send
          a request.
        </p>
      </section>

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        {CHANNELS.map(({ icon: Icon, name, body }) => (
          <Card key={name} className="h-full">
            <CardContent className="flex h-full flex-col gap-2 p-5">
              <div className="flex items-center gap-2">
                <Icon className="size-5 text-matcha-600" aria-hidden />
                <h3 className="font-serif text-lg">{name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <ul className="mt-6 space-y-3 text-sm text-warm-charcoal">
        <li>
          <b className="text-foreground">No PII before accept.</b> Full names, contact info, and
          photos of your loved one stay hidden until a match request is accepted.
        </li>
        <li>
          <b className="text-foreground">Reviews tied to completed trips only.</b> Both parties mark
          the trip done before anyone can leave a review.
        </li>
        <li>
          <b className="text-foreground">Report &amp; block.</b> Every profile and every chat has a
          report button. Blocked users&rsquo; trips disappear from your view.
        </li>
        <li>
          <b className="text-foreground">Admin review.</b> Flagged text and reports land in a human
          queue. We suspend and re-verify by hand.
        </li>
      </ul>

      <div className="mt-8 rounded-2xl border border-dashed border-oat bg-oat-light/40 p-5 text-sm text-warm-charcoal">
        <b>A clear disclaimer:</b> Saathi is an introduction service. You are responsible for your
        own arrangement, payment, and travel. We do not screen beyond social verification.
      </div>

      {/* ─── Chapter 5 — What we are not ──────────────────────────────── */}
      <section className="mt-14 space-y-4">
        <h2 className="font-serif text-2xl md:text-3xl">What Saathi isn&rsquo;t.</h2>
        <p className="text-warm-charcoal">
          We&rsquo;re not <em>meet-and-assist-as-a-service</em>. Professional airport assistance
          exists — Schiphol charges €80–120 for it. It&rsquo;s competent but it&rsquo;s uniformed
          and it rarely speaks your mother tongue.
        </p>
        <p className="text-warm-charcoal">
          Saathi is cheaper, but more importantly it&rsquo;s cultural. Someone who speaks your
          mother&rsquo;s language, shares her food habits, and understands why the Doha transfer
          makes her anxious is worth more than any uniform.
        </p>
      </section>

      {/* ─── Chapter 6 — Who's behind this ────────────────────────────── */}
      <section className="mt-14 space-y-4">
        <h2 className="font-serif text-2xl md:text-3xl">Who&rsquo;s behind this.</h2>
        <p className="text-warm-charcoal">
          Saathi is open source, built in the open by{' '}
          <a
            href="https://github.com/raahulrahl"
            target="_blank"
            rel="noreferrer"
            className="text-marigold-700 underline underline-offset-4"
          >
            Raahul
          </a>{' '}
          and{' '}
          <a
            href="https://github.com/dikshaSahni"
            target="_blank"
            rel="noreferrer"
            className="text-marigold-700 underline underline-offset-4"
          >
            Diksha
          </a>
          . If you want to file an issue, send a PR, or just read the code, it&rsquo;s on{' '}
          <a
            href="https://github.com/raahulrahl/saathi"
            target="_blank"
            rel="noreferrer"
            className="text-marigold-700 underline underline-offset-4"
          >
            GitHub
          </a>
          .
        </p>
      </section>

      {/* ─── CTA row ──────────────────────────────────────────────────── */}
      <section className="mt-16 flex flex-col items-start gap-3 rounded-3xl border border-oat bg-gradient-to-br from-cream to-oat-light/30 p-8 shadow-clay sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="font-serif text-xl">Ready to make the introduction?</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Browse who&rsquo;s on your flight, or post a trip yourself.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline">
            <Link href="/browse">Browse flights</Link>
          </Button>
          <Button asChild variant="lemon">
            <Link href="/dashboard/new/offer">Offer to help</Link>
          </Button>
          <Button asChild variant="slushie">
            <Link href="/dashboard/new/request">Post a request</Link>
          </Button>
        </div>
      </section>
    </article>
  );
}
