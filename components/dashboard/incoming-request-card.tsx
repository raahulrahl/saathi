import Link from 'next/link';
import { format, parseISO } from 'date-fns';
import { Card, CardContent } from '@/components/ui/card';
import { RespondButtons } from '@/app/dashboard/respond-buttons';

/**
 * One entry in the dashboard's "Incoming" tab: a pending match_request
 * from someone else targeting a trip the current user posted. Renders
 * the requester's name, trip date + route, their intro message, and
 * accept/decline buttons.
 *
 * The shape matches what dashboard/page.tsx selects — inlined here as
 * the `IncomingRequest` type rather than importing from a shared types
 * file because this is the only consumer. If a second surface ever
 * needs the same shape, promote it.
 */
export interface IncomingRequest {
  id: string;
  intro_message: string | null;
  trip: {
    id: string;
    route: string[];
    travel_date: string;
    kind: 'request' | 'offer';
  };
  requester: {
    id: string;
    display_name: string | null;
    photo_url: string | null;
    primary_language: string;
  };
}

export function IncomingRequestCard({ request }: { request: IncomingRequest }) {
  const { trip, requester } = request;
  return (
    <Card>
      <CardContent className="space-y-3 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">
              <Link
                href={`/profile/${requester.id}`}
                className="underline-offset-2 hover:underline"
              >
                {requester.display_name ?? 'Someone'}
              </Link>{' '}
              wants to travel with you
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              {format(parseISO(trip.travel_date), 'EEE, d LLL yyyy')} · {trip.route.join(' → ')}
            </div>
          </div>
        </div>
        {request.intro_message ? (
          <blockquote className="rounded-md border bg-muted/40 p-3 text-sm italic">
            {request.intro_message}
          </blockquote>
        ) : null}
        <RespondButtons matchRequestId={request.id} />
      </CardContent>
    </Card>
  );
}
