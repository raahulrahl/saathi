import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RouteLine } from '@/components/route-line';
import { StatusPill } from './status-pill';

/**
 * One entry in the dashboard's "My trips" tab: a trip the current user
 * posted (either a request or an offer). Shows kind badge, status,
 * route, date, airline, and an "Open" button to the public trip page.
 */
export interface MyTrip {
  id: string;
  kind: 'request' | 'offer';
  route: string[];
  travel_date: string;
  status: string;
  airline: string | null;
}

export function MyTripCard({ trip }: { trip: MyTrip }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant={trip.kind === 'request' ? 'secondary' : 'default'}>
              {trip.kind === 'request' ? 'Request' : 'Offer'}
            </Badge>
            <StatusPill status={trip.status} />
          </div>
          <RouteLine route={trip.route} />
          <div className="text-xs text-muted-foreground">
            {format(parseISO(trip.travel_date), 'EEE, d LLL yyyy')}
            {trip.airline ? ` · ${trip.airline}` : ''}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/trip/${trip.id}`}>Open</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
