import type { Metadata } from 'next';
import { Linkedin, MessageCircle, Twitter } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

export const metadata: Metadata = {
  title: 'About & Trust',
  description: 'What Saathi is, why it exists, and how we keep families safe.',
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
    body: 'A one-time code on a working number. The lingua franca for Indian parents.',
  },
];

export default function AboutPage() {
  return (
    <article className="container max-w-3xl py-14">
      {/* About */}
      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">About Saathi</p>
        <h1 className="mt-2 font-serif text-4xl">A companion on the flight home.</h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Every year, hundreds of thousands of first-generation immigrant families want to bring a
          parent over from India, China, the Philippines, Nigeria. The blocker is rarely the visa or
          the ticket. It&apos;s the flight itself.
        </p>
      </header>

      <section className="mt-8 space-y-4">
        <p>
          Most parents don&apos;t speak English, have never seen a self-service kiosk, can&apos;t
          read the boarding signage, and panic at connecting flights. Today the workaround lives in
          WhatsApp groups and Facebook posts:{' '}
          <em>&ldquo;Anyone flying CCU → AMS via DOH on the 14th? My mother needs help.&rdquo;</em>
        </p>
        <p>That&apos;s the entire product. Make that post a structured search.</p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-serif text-2xl">What we are</h2>
        <p className="text-muted-foreground">
          Saathi makes the introduction between two people who would have met on WhatsApp anyway.
          Money moves between them directly — Revolut, UPI, cash at the gate, whatever they prefer.
          We don&apos;t touch it. That keeps us out of payments licensing, out of disputes, and lets
          us ship.
        </p>
      </section>

      <section className="mt-10 space-y-3">
        <h2 className="font-serif text-2xl">What we are not</h2>
        <p className="text-muted-foreground">
          Saathi isn&apos;t meet-and-assist-as-a-service. Professional airport assistance exists —
          Schiphol charges €80–120 for it. Saathi is cheaper, but more importantly it&apos;s
          cultural: someone who speaks your mother&apos;s language is worth more than a uniformed
          assistant who doesn&apos;t.
        </p>
      </section>

      {/* Trust & safety */}
      <hr className="my-14 border-dashed" />

      <header>
        <p className="text-xs uppercase tracking-[0.2em] text-muted-foreground">
          Trust &amp; safety
        </p>
        <h2 className="mt-2 font-serif text-4xl">Verification, not paperwork.</h2>
        <p className="mt-4 text-lg text-muted-foreground">
          Saathi doesn&apos;t do passport uploads. Verification is <b>social-graph based</b>: every
          user must connect at least two of LinkedIn, X, and WhatsApp before they can post a trip or
          send a request.
        </p>
      </header>

      <div className="mt-8 grid gap-4 md:grid-cols-2">
        {CHANNELS.map(({ icon: Icon, name, body }) => (
          <Card key={name}>
            <CardContent className="space-y-2 p-5">
              <div className="flex items-center gap-2">
                <Icon className="text-saffron-600 size-5" aria-hidden />
                <h3 className="font-serif text-lg">{name}</h3>
              </div>
              <p className="text-sm text-muted-foreground">{body}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <h3 className="mt-12 font-serif text-xl">Other non-negotiables</h3>
      <ul className="mt-4 space-y-3 text-muted-foreground">
        <li>
          <b>No PII before accept.</b> Full names, contact info, and parent photos are hidden until
          a match request is accepted.
        </li>
        <li>
          <b>Reviews tied to completed trips only.</b> Both parties must mark the trip completed —
          there&apos;s no way to leave a review otherwise.
        </li>
        <li>
          <b>Report &amp; block.</b> Every profile and every chat has a report button; blocked
          users&apos; trips don&apos;t appear in your search.
        </li>
        <li>
          <b>Admin review.</b> Flagged text and reports land in a human queue — we suspend and
          re-verify by hand.
        </li>
      </ul>

      <div className="mt-10 rounded-lg border bg-muted/40 p-5 text-sm text-muted-foreground">
        <b>A clear disclaimer:</b> Saathi is an introduction service. You are responsible for your
        own arrangement, payment, and travel. We do not screen beyond social verification.
      </div>

      <section className="mt-16 space-y-3">
        <h2 className="font-serif text-2xl">Who&apos;s behind this</h2>
        <p className="text-muted-foreground">
          Saathi is an open-source effort, currently maintained by{' '}
          <a
            href="https://github.com/raahulrahl"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Raahul
          </a>{' '}
          and{' '}
          <a
            href="https://github.com/dikshaSahni"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            Diksha
          </a>
          . Issues, ideas, and PRs are welcome on{' '}
          <a
            href="https://github.com/raahulrahl/sathi"
            className="underline"
            target="_blank"
            rel="noreferrer"
          >
            GitHub
          </a>
          .
        </p>
      </section>
    </article>
  );
}
