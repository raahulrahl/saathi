import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { format, parseISO } from 'date-fns';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LanguageChipRow } from '@/components/language-chip';
import { RouteLine } from '@/components/route-line';
import { requireUserId } from '@/lib/auth-guard';
import { withUser } from '@/lib/db';
import {
  matches as matchesTbl,
  profileLanguages,
  profiles,
  tripTravellers,
  trips as tripsTbl,
} from '@/lib/db/schema';

export const metadata: Metadata = { title: 'Match' };

/**
 * `NEXT_PUBLIC_MATCH_FEATURES_ENABLED=true` unlocks the in-app chat,
 * mark-complete buttons, reviews, and photo upload. Until the real UI for
 * those ships, we render a single "match confirmed — full in-app experience
 * ships next sprint" notice instead of three half-built cards. The trip
 * details and who-you're-matched-with info are always shown either way —
 * those parts work, and they're what the user actually needs to meet up.
 *
 * Default: off. Flip to on for staging / once chat + reviews are built.
 */
const MATCH_FEATURES_ENABLED = process.env.NEXT_PUBLIC_MATCH_FEATURES_ENABLED === 'true';

export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const userId = await requireUserId(`/match/${id}`);

  const data = await withUser(userId, async (tx) => {
    // Match + trip + poster + requester. The poster/requester profiles
    // here include private contact fields (whatsapp_number, email, social
    // urls) — RLS lets us through because we're a match participant.
    const matchJoined = await tx
      .select({
        id: matchesTbl.id,
        status: matchesTbl.status,
        created_at: matchesTbl.createdAt,
        poster_marked_complete: matchesTbl.posterMarkedComplete,
        requester_marked_complete: matchesTbl.requesterMarkedComplete,
        trip_id: tripsTbl.id,
        trip_route: tripsTbl.route,
        trip_travel_date: tripsTbl.travelDate,
        trip_airline: tripsTbl.airline,
        trip_languages: tripsTbl.languages,
        trip_notes: tripsTbl.notes,
        poster_id: matchesTbl.posterId,
        requester_id: matchesTbl.requesterId,
      })
      .from(matchesTbl)
      .innerJoin(tripsTbl, eq(tripsTbl.id, matchesTbl.tripId))
      .where(eq(matchesTbl.id, id))
      .limit(1);

    const m = matchJoined[0] ?? null;
    if (!m) return { match: null };

    // Fetch both profiles in one IN-lookup; shape them on the JS side.
    const contactRows = await tx
      .select({
        id: profiles.id,
        display_name: profiles.displayName,
        photo_url: profiles.photoUrl,
        whatsapp_number: profiles.whatsappNumber,
        email: profiles.email,
        linkedin_url: profiles.linkedinUrl,
        twitter_url: profiles.twitterUrl,
        instagram_url: profiles.instagramUrl,
        facebook_url: profiles.facebookUrl,
      })
      .from(profiles)
      .where(inArray(profiles.id, [m.poster_id, m.requester_id]));

    const poster = contactRows.find((r) => r.id === m.poster_id) ?? null;
    const requester = contactRows.find((r) => r.id === m.requester_id) ?? null;

    // Travellers (visible to trip owner via 0013 "owner full access" policy
    // and to match participants via 0015 "match participants read").
    const travellers = await tx
      .select({
        id: tripTravellers.id,
        first_name: tripTravellers.firstName,
        age_band: tripTravellers.ageBand,
        medical_notes: tripTravellers.medicalNotes,
        sort_order: tripTravellers.sortOrder,
      })
      .from(tripTravellers)
      .where(eq(tripTravellers.tripId, m.trip_id))
      .orderBy(asc(tripTravellers.sortOrder));

    // The "other" person's primary language for the language chip row.
    const otherId = userId === m.poster_id ? m.requester_id : m.poster_id;
    const langRows = await tx
      .select({ language: profileLanguages.language })
      .from(profileLanguages)
      .where(and(eq(profileLanguages.profileId, otherId), eq(profileLanguages.isPrimary, true)))
      .limit(1);

    return {
      match: m,
      poster,
      requester,
      travellers,
      otherPrimaryLanguage: langRows[0]?.language ?? null,
    };
  });

  if (!data.match || !data.poster || !data.requester) notFound();

  const m = data.match;
  const poster = data.poster;
  const requester = data.requester;
  const travellerList = data.travellers;
  const otherPrimaryLanguage = data.otherPrimaryLanguage;

  const youArePoster = userId === poster.id;
  const other = youArePoster ? requester : poster;

  return (
    <div className="container max-w-4xl py-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground">
        Match
        <Badge variant="success">{m.status}</Badge>
      </div>
      <h1 className="mt-1 font-serif text-3xl">
        You're matched with {other.display_name ?? 'your Saathi'}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Matched on {format(parseISO(m.trip_travel_date), 'EEE, d LLL yyyy')} ·{' '}
        <Link href={`/profile/${other.id}`} className="underline">
          view profile
        </Link>
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5">
              <RouteLine route={m.trip_route} />
              <Separator />
              <div className="grid gap-2 text-sm">
                {m.trip_airline ? <div>Airline: {m.trip_airline}</div> : null}
                <div>Date: {format(parseISO(m.trip_travel_date), 'EEEE, d LLLL yyyy')}</div>
                <div className="mt-2">
                  <LanguageChipRow languages={m.trip_languages} primary={otherPrimaryLanguage} />
                </div>
                {m.trip_notes ? <p className="text-muted-foreground">{m.trip_notes}</p> : null}
              </div>
            </CardContent>
          </Card>

          {travellerList.length > 0 ? (
            <Card>
              <CardContent className="space-y-4 p-5">
                <h2 className="font-serif text-lg">
                  {travellerList.length === 1 ? 'About the traveller' : 'About the travellers'}
                </h2>
                <ul className="space-y-3">
                  {travellerList.map((e, i) => (
                    <li
                      key={e.id}
                      className={i > 0 ? 'border-t border-dashed border-oat pt-3' : ''}
                    >
                      {e.first_name ? (
                        <div className="text-sm">
                          Name: <b>{e.first_name}</b>
                        </div>
                      ) : null}
                      {e.age_band ? <div className="text-sm">Age band: {e.age_band}</div> : null}
                      {e.medical_notes ? (
                        <div className="text-sm text-muted-foreground">
                          Medical notes: {e.medical_notes}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {MATCH_FEATURES_ENABLED ? (
            <Card>
              <CardContent className="space-y-2 p-5">
                <h2 className="font-serif text-lg">Chat</h2>
                <p className="text-sm text-muted-foreground">Loading messages…</p>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-marigold-200/80 bg-marigold-50">
              <CardContent className="space-y-3 p-5">
                <h2 className="font-serif text-lg">We&rsquo;re still building this bit</h2>
                <p className="text-sm leading-relaxed text-warm-charcoal">
                  The in-app chat, mark-complete, review, and photo-upload flows are on the way —
                  they&rsquo;re not live yet. For now, message <b>{other.display_name ?? 'them'}</b>{' '}
                  directly using their linked accounts (you can see which platforms they&rsquo;ve
                  verified on their{' '}
                  <Link
                    href={`/profile/${other.id}`}
                    className="text-marigold-700 underline-offset-4 hover:underline"
                  >
                    profile
                  </Link>
                  ) and arrange the handover over WhatsApp or email.
                </p>
                <p className="text-sm leading-relaxed text-warm-charcoal">
                  Once the trip is done, we&rsquo;ll open up reviews here. In the meantime, the
                  match is confirmed — nothing else needs to happen on this page.
                </p>
              </CardContent>
            </Card>
          )}
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-serif text-lg">Contact</h2>
              <p className="text-sm">
                <b>{other.display_name ?? 'your Saathi'}</b>
              </p>
              <ul className="space-y-2 text-sm">
                {other.whatsapp_number ? (
                  <li>
                    <a
                      href={`https://wa.me/${other.whatsapp_number.replace(/\+/g, '')}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-matcha-800 underline underline-offset-4"
                    >
                      WhatsApp {other.whatsapp_number}
                    </a>
                  </li>
                ) : null}
                {other.email ? (
                  <li>
                    <a
                      href={`mailto:${other.email}`}
                      className="text-matcha-800 underline underline-offset-4"
                    >
                      {other.email}
                    </a>
                  </li>
                ) : null}
                {other.linkedin_url ? (
                  <li>
                    <a
                      href={other.linkedin_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-matcha-800 underline underline-offset-4"
                    >
                      LinkedIn
                    </a>
                  </li>
                ) : null}
                {other.twitter_url ? (
                  <li>
                    <a
                      href={other.twitter_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-matcha-800 underline underline-offset-4"
                    >
                      X / Twitter
                    </a>
                  </li>
                ) : null}
                {other.instagram_url ? (
                  <li>
                    <a
                      href={other.instagram_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-matcha-800 underline underline-offset-4"
                    >
                      Instagram
                    </a>
                  </li>
                ) : null}
                {other.facebook_url ? (
                  <li>
                    <a
                      href={other.facebook_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-matcha-800 underline underline-offset-4"
                    >
                      Facebook
                    </a>
                  </li>
                ) : null}
              </ul>
            </CardContent>
          </Card>

          {MATCH_FEATURES_ENABLED ? (
            <Card>
              <CardContent className="space-y-3 p-5">
                <h2 className="font-serif text-lg">After the trip</h2>
                <p className="text-sm text-muted-foreground">
                  Both parties mark the trip complete to unlock reviews. Auto-completion runs 48h
                  after travel date.
                </p>
                <div className="text-xs text-muted-foreground">
                  Your mark:{' '}
                  <b>
                    {(youArePoster ? m.poster_marked_complete : m.requester_marked_complete)
                      ? 'Complete'
                      : 'Not yet'}
                  </b>
                  {' · '}
                  Their mark:{' '}
                  <b>
                    {(youArePoster ? m.requester_marked_complete : m.poster_marked_complete)
                      ? 'Complete'
                      : 'Not yet'}
                  </b>
                </div>
              </CardContent>
            </Card>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
