import { notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LanguageChipRow } from '@/components/language-chip';
import { RouteLine } from '@/components/route-line';
import { requireUserId } from '@/lib/auth-guard';
import { createSupabaseServerClient } from '@/lib/supabase/server';

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
  const supabase = await createSupabaseServerClient();
  const userId = await requireUserId(`/match/${id}`);

  const { data: match } = await supabase
    .from('matches')
    .select(
      `id, status, created_at, poster_marked_complete, requester_marked_complete,
       trip:trips!inner(*),
       poster:profiles!matches_poster_id_fkey(id, display_name, photo_url),
       requester:profiles!matches_requester_id_fkey(id, display_name, photo_url)`,
    )
    .eq('id', id)
    .maybeSingle();

  if (!match) notFound();

  const m = match as unknown as {
    id: string;
    status: string;
    poster_marked_complete: boolean;
    requester_marked_complete: boolean;
    trip: {
      id: string;
      route: string[];
      travel_date: string;
      airline: string | null;
      languages: string[];
      notes: string | null;
    };
    poster: {
      id: string;
      display_name: string | null;
      photo_url: string | null;
    };
    requester: {
      id: string;
      display_name: string | null;
      photo_url: string | null;
    };
  };

  const youArePoster = userId === m.poster.id;
  const other = youArePoster ? m.requester : m.poster;

  // Fetch elders for this trip. Visible once matched (RLS: trip owner and
  // the accepted requester are the only authenticated users who can read
  // these rows — enforced at the DB layer via the 0013 migration's policy
  // plus the match_requests status='accepted' join).
  const { data: elders } = await supabase
    .from('trip_elders')
    .select('id, first_name, age_band, medical_notes, sort_order')
    .eq('trip_id', m.trip.id)
    .order('sort_order', { ascending: true });
  const elderList = elders ?? [];

  // Fetch the other person's primary language separately — profile_languages
  // is normalised post-0011 and PostgREST embeds from `profiles` would need
  // a composite join we don't have. One extra round trip; trivial at this
  // scale and keeps the code obvious.
  const { data: otherPrimaryLang } = await supabase
    .from('profile_languages')
    .select('language')
    .eq('profile_id', other.id)
    .eq('is_primary', true)
    .maybeSingle();
  const otherPrimaryLanguage = otherPrimaryLang?.language ?? null;

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
        Matched on {format(parseISO(m.trip.travel_date), 'EEE, d LLL yyyy')} ·{' '}
        <Link href={`/profile/${other.id}`} className="underline">
          view profile
        </Link>
      </p>

      <div className="mt-8 grid gap-6 md:grid-cols-[2fr_1fr]">
        <div className="space-y-6">
          <Card>
            <CardContent className="space-y-4 p-5">
              <RouteLine route={m.trip.route} />
              <Separator />
              <div className="grid gap-2 text-sm">
                {m.trip.airline ? <div>Airline: {m.trip.airline}</div> : null}
                <div>Date: {format(parseISO(m.trip.travel_date), 'EEEE, d LLLL yyyy')}</div>
                <div className="mt-2">
                  <LanguageChipRow languages={m.trip.languages} primary={otherPrimaryLanguage} />
                </div>
                {m.trip.notes ? <p className="text-muted-foreground">{m.trip.notes}</p> : null}
              </div>
            </CardContent>
          </Card>

          {elderList.length > 0 ? (
            <Card>
              <CardContent className="space-y-4 p-5">
                <h2 className="font-serif text-lg">
                  {elderList.length === 1 ? 'About the traveller' : 'About the travellers'}
                </h2>
                <ul className="space-y-3">
                  {elderList.map((e, i) => (
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
            // STUB: real chat UI ships here once MATCH_FEATURES_ENABLED lands.
            // Keeping an empty-ish card under the flag for when that work begins.
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
              <p className="text-sm text-muted-foreground">
                Contact channels are visible to both of you now that the match is active. Message
                through your linked accounts.
              </p>
            </CardContent>
          </Card>

          {MATCH_FEATURES_ENABLED ? (
            // STUB: completion flip + review UI ships here.
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
