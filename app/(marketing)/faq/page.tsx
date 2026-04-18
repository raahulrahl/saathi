import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'FAQ',
  description:
    'How Saathi works: matching, trust, day-of-travel logistics, thank-you payments, and privacy.',
};

/**
 * FAQ is organised into topic sections instead of one flat list so users
 * can scan to the bit they care about. Every answer is one short
 * paragraph — if an answer needs more than three sentences, it probably
 * belongs on /about or in a dedicated help article.
 */

interface QA {
  q: string;
  a: React.ReactNode;
}

interface Section {
  title: string;
  entries: QA[];
}

const SECTIONS: Section[] = [
  {
    title: 'The basics',
    entries: [
      {
        q: 'What is Saathi, in one sentence?',
        a: 'A free introduction service that matches families sending a loved one on a flight with travellers already on that flight who can keep them company through security, transfers, and arrival.',
      },
      {
        q: 'Who is Saathi for?',
        a: 'Anyone sending a relative or friend on an international flight they might find overwhelming — an older parent, a pregnant sibling, a first-time flyer, someone who doesn\u2019t speak the airport\u2019s language — and anyone already flying who would gladly help someone on their plane.',
      },
      {
        q: 'Is it free to sign up?',
        a: 'Yes. No subscription, no per-trip fee. Saathi makes no money from the match itself — we may add optional paid features in the future but the core introduction is and will stay free.',
      },
      {
        q: 'Which routes are supported?',
        a: 'Any route with two or more IATA airport codes. Launch focus is India ↔ Netherlands and India ↔ Germany, with common layovers at Doha, Dubai, Istanbul, Frankfurt.',
      },
    ],
  },

  {
    title: 'How matching works',
    entries: [
      {
        q: 'How does Saathi pair me with someone?',
        a: "You post either a request (I need a companion for this flight) or an offer (I'm on this flight and willing to help). Matches happen on three criteria, in order: shared language, exact flight number, and close date. Flight number is the strongest signal — same route on different planes isn't really a match.",
      },
      {
        q: 'Can I pick who helps my loved one?',
        a: 'Yes. When someone sends you a request, you see their verified profile, languages, and short intro message. You accept whoever feels right. Declining costs nothing.',
      },
      {
        q: 'What if nobody responds to my request?',
        a: (
          <>
            Share your request page with your community — a WhatsApp group, a Facebook post, a
            neighbourhood chat. Every request page has a share button and a custom preview image
            that includes your route and date. You can also{' '}
            <Link href="/browse" className="underline underline-offset-4">
              browse existing offers
            </Link>{' '}
            on your route and send a request to travellers who are already flying.
          </>
        ),
      },
      {
        q: "I don't know the flight number yet — can I still post?",
        a: 'Yes, but the match quality drops. Without a flight number we can only show people on the same route within a few days of your date, not people on the same plane. Add the flight number as soon as the ticket is booked — it only takes a second to edit.',
      },
      {
        q: 'Can my loved one travel with multiple companions (e.g. different legs)?',
        a: 'Not in v1 — one match per trip. If the trip has layovers, we encourage matching with someone doing the whole journey, or breaking it into separate trips on Saathi (one per leg).',
      },
    ],
  },

  {
    title: 'Trust & safety',
    entries: [
      {
        q: 'How do you verify users?',
        a: 'Social-graph based, not passport scans. Every user connects at least two of LinkedIn, X, or WhatsApp before they can post or send a request. Fakeable alone, hard to fake together. Verified channels appear as badges on each profile.',
      },
      {
        q: 'What does the other person see before I accept?',
        a: 'Only your display name, role (family or companion), languages, verified channels, and primary language. Full names, photos of your loved one, medical notes, and any contact info stay hidden until you accept a match request.',
      },
      {
        q: "I don't feel comfortable with a match — what do I do?",
        a: 'Decline. You never owe a reason. If you want to go further, every profile and every chat has a report button; reported accounts land in a human review queue and can be suspended.',
      },
      {
        q: "Is my loved one's information safe?",
        a: "Yes. Names, photos, and medical notes stay on our servers encrypted at rest and are only shown to a companion after you've explicitly accepted their request. Other users, anonymous visitors, and search engines never see any of it.",
      },
      {
        q: 'Does Saathi guarantee the companion will show up?',
        a: (
          <>
            No — we can&rsquo;t. Saathi is an introduction service, not an airport concierge. If a
            companion no-shows, cancel the match and their profile badges drop. See our{' '}
            <Link href="/about" className="underline underline-offset-4">
              about page
            </Link>{' '}
            for why we keep the thank-you small and settled in person rather than pre-paid.
          </>
        ),
      },
    ],
  },

  {
    title: 'Posting & responding',
    entries: [
      {
        q: 'Can I post for multiple loved ones travelling together?',
        a: 'Yes. On the request form, add as many people as are travelling — a couple, siblings, a parent and an in-law. Each gets their own name, age band, and medical notes. The companion sees all of them after accepting.',
      },
      {
        q: 'Can I post more than one trip?',
        a: 'Yes, as many as you like. Each trip is separate. Your dashboard lists all of them.',
      },
      {
        q: "What if my loved one doesn't have a smartphone?",
        a: "That's the normal case, not an exception. Saathi is designed around you — the family member — doing the posting and matching. The companion and you coordinate directly on WhatsApp, and you brief your loved one in person.",
      },
      {
        q: 'Can I also offer to help someone while travelling myself?',
        a: 'Yes. Post an offer for any leg you\'re already flying. You\'ll see requests on that route show up as "Hoping to join" on your dashboard.',
      },
      {
        q: 'I accidentally posted the wrong route or date — can I edit?',
        a: 'You can cancel the trip from your dashboard and repost. In-place editing is on the roadmap but not shipped yet.',
      },
    ],
  },

  {
    title: 'Day of travel',
    entries: [
      {
        q: 'How do we find each other at the airport?',
        a: 'Once a request is accepted, contact details unlock. Exchange WhatsApp messages the day before — a short intro with a photo makes the meet-up easier. Most pairs agree a meeting spot at check-in, typically 2–3 hours before departure.',
      },
      {
        q: 'What if the flight is delayed or cancelled?',
        a: "Coordinate directly — you already have each other's contact. If the flight is cancelled entirely, the match carries over to the rebooked flight if both of you are on it; otherwise it gets cancelled and you can post a new trip.",
      },
      {
        q: "I can't do the trip anymore — how do I cancel?",
        a: "Cancel the match from your dashboard. If you're a family member, post a new request. If you're a companion, your profile takes a small hit for late cancellation but it isn't a permanent mark — we weight it lightly and it fades after a couple of completed trips.",
      },
      {
        q: 'What do I actually do as a companion?',
        a: "Usually: help with check-in, immigration forms, finding the right gate after a connection, and keeping an eye out during the journey. It's companionship, not medical care. Specific help categories the family needs are listed on the trip page.",
      },
    ],
  },

  {
    title: 'Thank-you & payments',
    entries: [
      {
        q: 'Does Saathi take a cut of the thank-you?',
        a: 'No. Money moves directly between the family and the companion in whatever currency and app they prefer — Revolut, UPI, cash at the gate. Saathi never sees it.',
      },
      {
        q: "What's a reasonable thank-you amount?",
        a: "We suggest €15–25 for most routes — a small gesture, not a fee. It\'s optional, and often covered by buying the companion a coffee or paying for their airport parking. Families set the amount on the request form; companions can take it or leave it.",
      },
      {
        q: 'Should I pay before or after the flight?',
        a: "After. Keeping payment off-platform and post-flight aligns the companion's incentives with actually showing up and being helpful, without Saathi having to play escrow.",
      },
      {
        q: 'How is this different from airport meet-and-assist services?',
        a: "Airport paid services cost €80–120, are uniformed, and rarely speak your loved one's language. Saathi is cheaper and picks someone who actually shares a mother tongue and cultural context.",
      },
    ],
  },

  {
    title: 'Account & privacy',
    entries: [
      {
        q: 'Can the same person be both a family member and a companion?',
        a: "Not in v1 — one role per account. It will eventually happen (a student who also flies her own grandmother over), and we'll handle that in v2.",
      },
      {
        q: 'What data does Saathi collect?',
        a: "Only what you enter: name, role, languages, linked social accounts, trips, and match messages. We don't track your location, don't sell data, and don't run third-party ads. Analytics are first-party (Vercel, PostHog for feature flags) and gated behind cookie consent.",
      },
      {
        q: 'How do I delete my account?',
        a: (
          <>
            Email{' '}
            <a href="mailto:hello@getsaathi.com" className="underline underline-offset-4">
              hello@getsaathi.com
            </a>{' '}
            and we&rsquo;ll delete your account, trips, matches, and messages within 7 days.
            Self-service delete from inside the app is on the roadmap.
          </>
        ),
      },
      {
        q: 'Is Saathi open source?',
        a: (
          <>
            Yes. The code lives at{' '}
            <a
              href="https://github.com/raahulrahl/saathi"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              github.com/raahulrahl/saathi
            </a>
            . Issues and PRs welcome.
          </>
        ),
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <article className="container max-w-2xl py-14">
      <header>
        <p className="clay-label">FAQ</p>
        <h1 className="mt-2 font-serif text-4xl md:text-5xl">Frequently asked.</h1>
        <p className="mt-4 text-base text-muted-foreground">
          Short, honest answers to the questions families and travellers actually ask. Can&rsquo;t
          find yours?{' '}
          <a
            href="mailto:hello@getsaathi.com"
            className="text-marigold-700 underline underline-offset-4"
          >
            Email us.
          </a>
        </p>
      </header>

      <div className="mt-12 space-y-12">
        {SECTIONS.map((section) => (
          <section key={section.title} className="space-y-6">
            <h2 className="clay-label">{section.title}</h2>
            <dl className="space-y-6 border-t border-dashed border-oat pt-6">
              {section.entries.map(({ q, a }, i) => (
                <div key={q} className={i > 0 ? 'border-t border-dashed border-oat pt-6' : ''}>
                  <dt className="font-serif text-lg text-foreground">{q}</dt>
                  <dd className="mt-2 text-sm leading-relaxed text-warm-charcoal">{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>

      {/* Still stuck CTA */}
      <div className="mt-16 rounded-3xl border border-oat bg-gradient-to-br from-cream to-oat-light/30 p-8 shadow-clay">
        <p className="font-serif text-xl">Still have a question?</p>
        <p className="mt-2 text-sm text-muted-foreground">
          We usually reply within a day. No bots, no tickets.{' '}
          <a
            href="mailto:hello@getsaathi.com"
            className="text-marigold-700 underline underline-offset-4"
          >
            hello@getsaathi.com
          </a>
        </p>
      </div>
    </article>
  );
}
