import Link from 'next/link';
import Image from 'next/image';
import { format, parseISO } from 'date-fns';
import { ArrowRight, Share2, Users } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RouteLine } from '@/components/route-line';
import { RespondButtons } from '@/app/dashboard/respond-buttons';
import { StatusPill } from './status-pill';
import type { IncomingRequest } from './incoming-request-card';

/**
 * One entry in the dashboard's "My trips" tab: a trip the current user
 * posted. Incoming match_requests for this trip appear INLINE beneath
 * the trip summary — there's no separate "Incoming" tab any more, so
 * every pending request is visible in the context of its parent trip.
 */
export interface MyTrip {
  id: string;
  kind: 'request' | 'offer';
  route: string[];
  travel_date: string;
  status: string;
  airline: string | null;
}

interface MyTripCardProps {
  trip: MyTrip;
  /** Pending match_requests targeting this trip. */
  incoming: IncomingRequest[];
}

export function MyTripCard({ trip, incoming }: MyTripCardProps) {
  const isRequest = trip.kind === 'request';
  const hasIncoming = incoming.length > 0;

  return (
    <Card className="overflow-hidden">
      {/* Summary row */}
      <CardContent className="flex flex-wrap items-start justify-between gap-3 p-5">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={isRequest ? 'slushie' : 'lemon'}>
              {isRequest ? 'Request' : 'Offer'}
            </Badge>
            <StatusPill status={trip.status} />
            {hasIncoming && (
              <span className="inline-flex items-center gap-1 rounded-full bg-marigold-200 px-2.5 py-0.5 text-[11px] font-semibold text-marigold-900">
                <Users className="size-3" />
                {incoming.length} hoping to join
              </span>
            )}
          </div>
          <RouteLine route={trip.route} />
          <div className="text-xs text-muted-foreground">
            {format(parseISO(trip.travel_date), 'EEE, d LLL yyyy')}
            {trip.airline ? ` · ${trip.airline}` : ''}
          </div>
        </div>
        <div className="flex shrink-0 gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={`/trip/${trip.id}`}>
              Open <ArrowRight className="ml-1 size-3.5" />
            </Link>
          </Button>
        </div>
      </CardContent>

      {/* Incoming requests — inline, one per line */}
      {hasIncoming && (
        <div className="border-t border-oat bg-marigold-50/60 p-5">
          <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-marigold-900">
            Waiting for your reply
          </p>
          <ul className="space-y-3">
            {incoming.map((r) => (
              <IncomingInline key={r.id} request={r} />
            ))}
          </ul>
        </div>
      )}

      {/* No incoming activity yet — gentle nudge to share. Applies to
          both offer and request trips; copy differs so it reads right
          for each ("the right family" vs "a traveller on the flight"). */}
      {!hasIncoming && trip.status === 'open' && (
        <div className="border-t border-dashed border-oat p-4">
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">
              {isRequest
                ? 'No offers yet. Share this request so someone flying the same route can find you.'
                : 'No requests yet. Share this offer so the right family finds you.'}
            </p>
            <Button asChild variant="ghost" size="sm" className="shrink-0">
              <Link href={`/trip/${trip.id}?new=true`}>
                <Share2 className="mr-1 size-3.5" /> Share
              </Link>
            </Button>
          </div>
        </div>
      )}
    </Card>
  );
}

// ── Inline incoming-request row ──────────────────────────────────────────

function IncomingInline({ request }: { request: IncomingRequest }) {
  const { requester } = request;
  const initials = (requester.display_name ?? '??').slice(0, 2).toUpperCase();

  return (
    <li className="rounded-xl border border-marigold-200 bg-card p-3">
      <div className="flex items-start gap-3">
        <Link href={`/profile/${requester.id}`} className="shrink-0">
          <Avatar className="size-9">
            {requester.photo_url ? (
              <AvatarImage asChild>
                <Image
                  src={requester.photo_url}
                  alt=""
                  width={36}
                  height={36}
                  className="size-9 object-cover"
                  unoptimized
                />
              </AvatarImage>
            ) : null}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-sm">
            <Link
              href={`/profile/${requester.id}`}
              className="font-medium underline-offset-2 hover:underline"
            >
              {requester.display_name ?? 'Someone'}
            </Link>{' '}
            <span className="text-muted-foreground">wants to travel with you</span>
          </p>
          {request.intro_message && (
            <blockquote className="mt-2 rounded-md bg-muted/40 p-2.5 text-xs italic text-warm-charcoal">
              &ldquo;{request.intro_message}&rdquo;
            </blockquote>
          )}
          <div className="mt-3">
            <RespondButtons matchRequestId={request.id} />
          </div>
        </div>
      </div>
    </li>
  );
}
