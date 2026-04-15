import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { RouteLine } from '@/components/route-line';
import { StatusPill } from './status-pill';

/**
 * One entry in the dashboard's "Matches" tab: an accepted pairing
 * between a family and a companion on a specific trip. Links to the
 * match thread page (`/match/[id]`) where chat, completion marking,
 * and reviews live once those features ship.
 */
export interface DashboardMatch {
  id: string;
  status: string;
  trip: {
    route: string[];
    travel_date: string;
  };
}

export function MatchCard({ match }: { match: DashboardMatch }) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-3 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <StatusPill status={match.status} />
          </div>
          <RouteLine route={match.trip.route} />
          <div className="text-xs text-muted-foreground">
            {format(parseISO(match.trip.travel_date), 'EEE, d LLL yyyy')}
          </div>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link href={`/match/${match.id}`}>Open thread</Link>
        </Button>
      </CardContent>
    </Card>
  );
}
