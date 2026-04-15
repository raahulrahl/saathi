import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { RouteLine } from '@/components/route-line';
import { StatusPill } from './status-pill';

/**
 * One entry in the dashboard's "Sent" tab: a match_request the current
 * user sent to someone else's trip. Shows the trip poster's name,
 * request status, route, and date.
 */
export interface SentRequest {
  id: string;
  status: string;
  trip: {
    id: string;
    route: string[];
    travel_date: string;
    poster: { id: string; display_name: string | null } | null;
  };
}

export function SentRequestCard({ request }: { request: SentRequest }) {
  const { trip } = request;
  return (
    <Card>
      <CardContent className="space-y-2 p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="font-medium">
            <Link href={`/trip/${trip.id}`} className="underline-offset-2 hover:underline">
              {trip.poster?.display_name ?? 'Trip'}
            </Link>
          </div>
          <StatusPill status={request.status} />
        </div>
        <RouteLine route={trip.route} />
        <div className="text-xs text-muted-foreground">
          {format(parseISO(trip.travel_date), 'EEE, d LLL yyyy')}
        </div>
      </CardContent>
    </Card>
  );
}
