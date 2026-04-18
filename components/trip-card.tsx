import Link from 'next/link';
import Image from 'next/image';
import { Calendar, MapPin, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { LanguageChipRow } from '@/components/language-chip';
import { RouteLine } from '@/components/route-line';
import { cn } from '@/lib/utils';
import type { Scored } from '@/lib/matching';

export interface TripCardData {
  id: string;
  kind: 'request' | 'offer';
  display_name: string | null;
  photo_url: string | null;
  languages: string[];
  primary_language: string | null;
  route: string[];
  travel_date: string;
  /** Age bands for every traveller on a request trip, in sort order. */
  traveller_age_bands?: string[];
  /** Total traveller count (0 for offers). */
  traveller_count?: number;
  help_categories?: string[];
  thank_you_eur?: number | null;
  airline?: string | null;
  flight_numbers?: string[] | null;
}

interface TripCardProps {
  data: TripCardData;
  viewerLanguages?: string[];
  scored?: Pick<
    Scored,
    'band' | 'dayDelta' | 'routeMatch' | 'flightMatch' | 'matchedFlightNumbers'
  >;
  className?: string;
}

export function TripCard({ data, viewerLanguages = [], scored, className }: TripCardProps) {
  const isRequest = data.kind === 'request';
  const noLang = scored?.band === 'none';

  return (
    <Link
      href={`/trip/${data.id}`}
      className={cn(
        'block rounded-lg outline-none ring-offset-background transition-shadow focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        noLang && 'opacity-70',
        className,
      )}
    >
      <Card className="h-full overflow-hidden transition-shadow hover:shadow-md">
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <Avatar className="size-12 shrink-0">
                {data.photo_url ? (
                  <AvatarImage asChild>
                    <Image
                      src={data.photo_url}
                      alt=""
                      width={48}
                      height={48}
                      className="size-12 object-cover"
                      unoptimized
                    />
                  </AvatarImage>
                ) : null}
                <AvatarFallback>
                  {(data.display_name ?? '??').slice(0, 2).toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <div className="space-y-0.5">
                <div className="font-semibold leading-tight">
                  {data.display_name ?? 'Anonymous'}
                </div>
                <div className="text-xs text-muted-foreground">
                  {isRequest ? 'Family member' : 'Companion'}
                  {isRequest && data.traveller_count && data.traveller_count > 0
                    ? ` · ${data.traveller_count === 1 ? '1 traveller' : `${data.traveller_count} travellers`}` +
                      (data.traveller_age_bands && data.traveller_age_bands.length > 0
                        ? ` (${data.traveller_age_bands.join(', ')})`
                        : '')
                    : null}
                </div>
              </div>
            </div>
            <Badge variant={isRequest ? 'slushie' : 'lemon'} className="shrink-0">
              {isRequest ? 'Looking for help' : 'Offering help'}
            </Badge>
          </div>

          <RouteLine route={data.route} />

          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-4" aria-hidden />
              {format(parseISO(data.travel_date), 'EEE, d LLL yyyy')}
              {scored && scored.dayDelta > 0 ? (
                <span className="ml-1 text-xs text-muted-foreground">
                  (±{scored.dayDelta} {scored.dayDelta === 1 ? 'day' : 'days'})
                </span>
              ) : null}
            </span>
            {data.airline ? (
              <span className="inline-flex items-center gap-1.5">
                <MapPin className="size-4" aria-hidden />
                {data.airline}
              </span>
            ) : null}
          </div>

          {data.flight_numbers && data.flight_numbers.length > 0 ? (
            <div className="flex flex-wrap gap-1.5">
              {data.flight_numbers.map((fn) => {
                const isMatch = !!scored?.matchedFlightNumbers?.some(
                  (m) =>
                    m.toLowerCase().replace(/\s+/g, '') === fn.toLowerCase().replace(/\s+/g, ''),
                );
                return (
                  <Badge
                    key={fn}
                    variant={isMatch ? 'default' : 'outline'}
                    className={cn(
                      'gap-1 font-mono',
                      isMatch && 'bg-saffron-600 text-saffron-50 hover:bg-saffron-700',
                    )}
                  >
                    ✈ {fn}
                    {isMatch ? (
                      <span className="text-[10px] uppercase tracking-wide">same flight</span>
                    ) : null}
                  </Badge>
                );
              })}
            </div>
          ) : null}

          <LanguageChipRow
            languages={data.languages}
            primary={data.primary_language ?? null}
            viewerLanguages={viewerLanguages}
          />

          {noLang ? (
            <p className="text-xs italic text-muted-foreground">
              No shared language with your search — you may still be able to help.
            </p>
          ) : null}

          {data.help_categories && data.help_categories.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {data.help_categories.map((c) => (
                <Badge key={c} variant="muted" className="font-normal">
                  {c}
                </Badge>
              ))}
            </div>
          ) : null}
        </CardContent>

        <CardFooter className="flex items-center justify-between border-t bg-muted/40 px-5 py-3">
          <span className="text-xs text-warm-silver">
            {data.airline ? data.airline : 'No airline listed'}
          </span>
          {isRequest && data.thank_you_eur ? (
            <div className="text-sm font-medium">
              <Users className="mr-1 inline-block size-4 align-[-2px]" />
              Thank-you: €{data.thank_you_eur}
            </div>
          ) : null}
        </CardFooter>
      </Card>
    </Link>
  );
}
