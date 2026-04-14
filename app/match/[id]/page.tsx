import { redirect, notFound } from 'next/navigation';
import Link from 'next/link';
import type { Metadata } from 'next';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LanguageChipRow } from '@/components/language-chip';
import { RouteLine } from '@/components/route-line';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const metadata: Metadata = { title: 'Match' };

/**
 * Match thread. Chat, reviews, and photo upload are stubs per Product Spec
 * §11 ("Stub chat, reviews, and photo upload — those come next sprint.").
 */
export default async function MatchPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createSupabaseServerClient();
  const { data: userResp } = await supabase.auth.getUser();
  if (!userResp.user) redirect(`/auth/sign-in?next=/match/${id}`);

  const { data: match } = await supabase
    .from('matches')
    .select(
      `id, status, created_at, poster_marked_complete, requester_marked_complete,
       trip:trips!inner(*),
       poster:profiles!matches_poster_id_fkey(id, display_name, full_name, photo_url, primary_language, languages),
       requester:profiles!matches_requester_id_fkey(id, display_name, full_name, photo_url, primary_language, languages)`,
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
      elderly_first_name: string | null;
      elderly_age_band: string | null;
      elderly_photo_url: string | null;
      elderly_medical_notes: string | null;
      airline: string | null;
      languages: string[];
      notes: string | null;
    };
    poster: {
      id: string;
      display_name: string | null;
      full_name: string | null;
      photo_url: string | null;
      primary_language: string;
      languages: string[];
    };
    requester: {
      id: string;
      display_name: string | null;
      full_name: string | null;
      photo_url: string | null;
      primary_language: string;
      languages: string[];
    };
  };

  const youArePoster = userResp.user.id === m.poster.id;
  const other = youArePoster ? m.requester : m.poster;

  return (
    <div className="container max-w-4xl py-10">
      <div className="flex items-center gap-2 text-xs uppercase tracking-[0.15em] text-muted-foreground">
        Match
        <Badge variant="success">{m.status}</Badge>
      </div>
      <h1 className="mt-1 font-serif text-3xl">
        You're matched with {other.full_name ?? other.display_name ?? 'your Sathi'}
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
                  <LanguageChipRow languages={m.trip.languages} primary={other.primary_language} />
                </div>
                {m.trip.notes ? <p className="text-muted-foreground">{m.trip.notes}</p> : null}
              </div>
            </CardContent>
          </Card>

          {m.trip.elderly_first_name || m.trip.elderly_age_band || m.trip.elderly_medical_notes ? (
            <Card>
              <CardContent className="space-y-2 p-5">
                <h2 className="font-serif text-lg">About the parent</h2>
                {m.trip.elderly_first_name ? (
                  <div className="text-sm">
                    Name: <b>{m.trip.elderly_first_name}</b>
                  </div>
                ) : null}
                {m.trip.elderly_age_band ? (
                  <div className="text-sm">Age band: {m.trip.elderly_age_band}</div>
                ) : null}
                {m.trip.elderly_medical_notes ? (
                  <div className="text-sm text-muted-foreground">
                    Medical notes: {m.trip.elderly_medical_notes}
                  </div>
                ) : null}
              </CardContent>
            </Card>
          ) : null}

          {/* STUB: chat. Next sprint — Supabase realtime on `messages`. */}
          <Card>
            <CardContent className="space-y-2 p-5">
              <h2 className="font-serif text-lg">Chat</h2>
              <p className="text-sm text-muted-foreground">
                Realtime chat ships in the next sprint. For now, use the contact details in the
                sidebar to set things up over WhatsApp or email.
              </p>
            </CardContent>
          </Card>
        </div>

        <aside className="space-y-4">
          <Card>
            <CardContent className="space-y-3 p-5">
              <h2 className="font-serif text-lg">Contact</h2>
              <p className="text-sm">
                <b>{other.full_name ?? other.display_name}</b>
              </p>
              <p className="text-sm text-muted-foreground">
                Contact channels are visible to both of you now that the match is active. Message
                through your linked accounts.
              </p>
            </CardContent>
          </Card>

          {/* STUB: completion flip + review */}
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
        </aside>
      </div>
    </div>
  );
}
