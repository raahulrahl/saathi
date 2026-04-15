'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';
import { format } from 'date-fns';
import {
  ArrowRight,
  ChevronDown,
  MoonStar,
  Plus,
  Search,
  Send,
  Sun,
  Sunrise,
  Sunset,
  X,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidIata, searchAirports, type Airport } from '@/lib/iata';
import { cn } from '@/lib/utils';

/**
 * Flight Composer — the one input the product turns around.
 *
 * Two modes in one form:
 *   * Offer — I'm flying this. Submit navigates to /post/{request|offer}
 *             with the current fields prefilled.
 *   * Seek  — Find someone on this. Submit navigates to /search.
 *
 * Fields: route (with layovers), date, per-leg flight numbers. An
 * optional "More" disclosure reveals airline + time-of-day. A live
 * counter under the form shows how many matching trips already exist
 * and links straight to /search.
 *
 * Variants:
 *   * hero     — landing page, oversized, generous padding
 *   * compact  — search/post pages, single row where possible
 */

type Mode = 'offer' | 'seek';
type Variant = 'hero' | 'compact';
type TimeOfDay = 'morning' | 'afternoon' | 'evening' | 'redeye';

interface FlightComposerProps {
  variant?: Variant;
  defaultMode?: Mode;
  /** The current user's role, if signed in. Controls Offer submit target. */
  viewerRole?: 'family' | 'companion' | null;
  defaultRoute?: string[];
  defaultDate?: string;
  defaultFlightNumbers?: string[];
  defaultAirline?: string;
  defaultTimeOfDay?: TimeOfDay | null;
  className?: string;
}

const TIME_BANDS: Array<{
  id: TimeOfDay;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'morning', label: 'Morning', icon: Sunrise },
  { id: 'afternoon', label: 'Afternoon', icon: Sun },
  { id: 'evening', label: 'Evening', icon: Sunset },
  { id: 'redeye', label: 'Red-eye', icon: MoonStar },
];

function normaliseFlight(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

function defaultFutureDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return format(d, 'yyyy-MM-dd');
}

export function FlightComposer({
  variant = 'compact',
  defaultMode = 'seek',
  viewerRole = null,
  defaultRoute = ['', ''],
  defaultDate,
  defaultFlightNumbers = [],
  defaultAirline = '',
  defaultTimeOfDay = null,
  className,
}: FlightComposerProps) {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>(defaultMode);
  const [route, setRoute] = useState<string[]>(defaultRoute.length >= 2 ? defaultRoute : ['', '']);
  const [date, setDate] = useState(defaultDate ?? defaultFutureDate());
  const [flights, setFlights] = useState<string[]>(defaultFlightNumbers);
  const [flightDraft, setFlightDraft] = useState('');
  const [showMore, setShowMore] = useState(!!defaultAirline || !!defaultTimeOfDay);
  const [airline, setAirline] = useState(defaultAirline);
  const [timeOfDay, setTimeOfDay] = useState<TimeOfDay | null>(defaultTimeOfDay);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const isHero = variant === 'hero';

  const hasValidEndpoints =
    route.length >= 2 && isValidIata(route[0] ?? '') && isValidIata(route[route.length - 1] ?? '');

  function setRouteAt(i: number, value: string) {
    setRoute((prev) => {
      const next = [...prev];
      next[i] = value.toUpperCase().slice(0, 3);
      return next;
    });
  }

  function addLayover() {
    setRoute((prev) => [...prev.slice(0, -1), '', prev[prev.length - 1] ?? '']);
  }

  function removeLayover(i: number) {
    setRoute((prev) => (prev.length <= 2 ? prev : prev.filter((_, idx) => idx !== i)));
  }

  function addFlight(raw: string) {
    const fn = normaliseFlight(raw);
    if (!fn) return;
    setFlights((prev) => (prev.includes(fn) ? prev : [...prev, fn]));
    setFlightDraft('');
  }

  function onFlightKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === ',' || e.key === ' ') {
      e.preventDefault();
      addFlight(flightDraft);
    } else if (e.key === 'Backspace' && flightDraft === '' && flights.length > 0) {
      setFlights((prev) => prev.slice(0, -1));
    }
  }

  function buildParams(): URLSearchParams {
    const p = new URLSearchParams();
    const cleanRoute = route.map((r) => r.trim().toUpperCase()).filter(isValidIata);
    if (cleanRoute.length >= 2) {
      p.set('from', cleanRoute[0]!);
      p.set('to', cleanRoute[cleanRoute.length - 1]!);
      if (cleanRoute.length > 2) p.set('via', cleanRoute.slice(1, -1).join(','));
    }
    if (date) p.set('date', date);
    // Flush any pending draft into the list on submit.
    const pending = normaliseFlight(flightDraft);
    const allFlights = pending && !flights.includes(pending) ? [...flights, pending] : flights;
    if (allFlights.length) p.set('fn', allFlights.join(','));
    if (airline) p.set('airline', airline);
    if (timeOfDay) p.set('tod', timeOfDay);
    return p;
  }

  function submit(targetMode: Mode) {
    setError(null);
    if (!hasValidEndpoints) {
      setError('Enter valid 3-letter airport codes for the start and end.');
      return;
    }
    const endpoints = [route[0], route[route.length - 1]].map((r) => r?.toUpperCase() ?? '');
    if (endpoints[0] === endpoints[1]) {
      setError('Origin and destination cannot be the same.');
      return;
    }
    const params = buildParams();
    start(() => {
      if (targetMode === 'seek') {
        router.push(`/search?${params.toString()}`);
        return;
      }
      // Offer mode — post a new trip. Route to the right variant based on role.
      if (!viewerRole) {
        const next = `/post/request?${params.toString()}`;
        router.push(`/auth/sign-in?redirect_url=${encodeURIComponent(next)}`);
        return;
      }
      const target = viewerRole === 'family' ? '/post/request' : '/post/offer';
      router.push(`${target}?${params.toString()}`);
    });
  }

  return (
    <div className={cn('w-full', className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(mode);
        }}
        className={cn(
          'relative rounded-[32px] border border-oat bg-card shadow-clay',
          isHero ? 'p-6 md:p-8' : 'p-4 md:p-5',
        )}
      >
        {/* Route row — source pinned left, destination pinned right, dashed
            connectors and any layovers flex to fill the middle. "+ Add" sits
            between the last via (or source) and the destination so stops
            accumulate in travel order: src → stop1 → stop2 → +Add → dst. */}
        <div className="space-y-2">
          <Label className="text-sm font-medium text-warm-charcoal">Where is the flight?</Label>
          <div className="flex flex-wrap items-center gap-2 md:flex-nowrap md:gap-3">
            {/* Source — always first */}
            <RouteDot
              index={0}
              total={route.length}
              label="Starts"
              value={route[0] ?? ''}
              onChange={(v) => setRouteAt(0, v)}
              big={isHero}
            />

            {/* Middle — dashed lines, optional layovers, add-stop button */}
            {route.slice(1, -1).map((code, i) => {
              const actualIndex = i + 1;
              return (
                <Fragment key={actualIndex}>
                  <div
                    aria-hidden
                    className="h-px min-w-[16px] flex-1 border-t-2 border-dashed border-oat md:min-w-[24px]"
                  />
                  <RouteDot
                    index={actualIndex}
                    total={route.length}
                    label="Via"
                    value={code}
                    onChange={(v) => setRouteAt(actualIndex, v)}
                    onRemove={() => removeLayover(actualIndex)}
                    big={isHero}
                  />
                </Fragment>
              );
            })}
            <div
              aria-hidden
              className="h-px min-w-[16px] flex-1 border-t-2 border-dashed border-oat md:min-w-[24px]"
            />
            <button
              type="button"
              onClick={addLayover}
              className="clay-hover inline-flex shrink-0 items-center gap-1 rounded-full border border-dashed border-oat bg-transparent px-3 py-1.5 text-xs font-medium text-warm-charcoal hover:bg-oat-light"
            >
              <Plus className="size-3.5" /> Add
            </button>
            <div
              aria-hidden
              className="h-px min-w-[16px] flex-1 border-t-2 border-dashed border-oat md:min-w-[24px]"
            />

            {/* Destination — always last */}
            <RouteDot
              index={route.length - 1}
              total={route.length}
              label="Lands"
              value={route[route.length - 1] ?? ''}
              onChange={(v) => setRouteAt(route.length - 1, v)}
              big={isHero}
            />
          </div>
        </div>

        {/* Date + flights row */}
        <div
          className={cn(
            'mt-5 grid gap-4',
            isHero ? 'md:grid-cols-[240px_1fr]' : 'md:grid-cols-[220px_1fr]',
          )}
        >
          <div className="space-y-2">
            <Label htmlFor="fc-date" className="text-sm font-medium text-warm-charcoal">
              When is it?
            </Label>
            <Input
              id="fc-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="fc-flight" className="text-sm font-medium text-warm-charcoal">
              Which flights? <span className="text-warm-silver">(if you know them)</span>
            </Label>
            <div
              className={cn(
                'flex flex-wrap items-center gap-1.5 rounded-lg border border-oat bg-white px-2 py-1.5',
                'focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2',
              )}
            >
              {flights.map((fn) => (
                <Badge
                  key={fn}
                  variant="secondary"
                  className="gap-1 rounded-full py-1 pl-2.5 pr-1 font-mono"
                >
                  ✈ {fn}
                  <button
                    type="button"
                    onClick={() => setFlights((prev) => prev.filter((x) => x !== fn))}
                    aria-label={`Remove ${fn}`}
                    className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                  >
                    <X className="size-3" />
                  </button>
                </Badge>
              ))}
              <input
                id="fc-flight"
                value={flightDraft}
                onChange={(e) => setFlightDraft(e.target.value.toUpperCase())}
                onKeyDown={onFlightKeyDown}
                onBlur={() => addFlight(flightDraft)}
                placeholder={flights.length === 0 ? 'QR540, QR23' : ''}
                className="min-w-[8ch] flex-1 bg-transparent px-1 py-1 font-mono text-sm uppercase tracking-wide outline-none placeholder:font-sans placeholder:normal-case placeholder:tracking-normal placeholder:text-warm-silver"
                autoComplete="off"
                maxLength={10}
              />
            </div>
          </div>
        </div>

        {/* More disclosure */}
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowMore((s) => !s)}
            className="inline-flex items-center gap-1 text-sm font-medium text-warm-charcoal hover:text-foreground"
          >
            Add airline or time of day
            <ChevronDown
              className={cn('size-4 transition-transform', showMore ? 'rotate-180' : 'rotate-0')}
            />
          </button>
          {showMore ? (
            <div className="mt-3 grid gap-4 rounded-2xl border border-dashed border-oat p-4 md:grid-cols-[1fr_auto]">
              <div className="space-y-2">
                <Label htmlFor="fc-airline" className="text-sm font-medium text-warm-charcoal">
                  Airline
                </Label>
                <Input
                  id="fc-airline"
                  value={airline}
                  onChange={(e) => setAirline(e.target.value)}
                  placeholder="Qatar Airways, KLM, Emirates…"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm font-medium text-warm-charcoal">What time roughly?</Label>
                <div className="flex flex-wrap gap-1.5">
                  {TIME_BANDS.map(({ id, label, icon: Icon }) => {
                    const active = timeOfDay === id;
                    return (
                      <button
                        key={id}
                        type="button"
                        onClick={() => setTimeOfDay(active ? null : id)}
                        className={cn(
                          'clay-hover inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors',
                          active
                            ? 'border-foreground bg-foreground text-background'
                            : 'border-dashed border-oat bg-transparent text-warm-charcoal hover:bg-oat-light',
                        )}
                      >
                        <Icon className="size-3.5" /> {label}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        {error ? (
          <p className="mt-3 text-sm text-pomegranate-600" role="alert">
            {error}
          </p>
        ) : null}

        {/* Mode pill — two halves; each acts as submit in its mode */}
        <div className="mt-6">
          <ModeSubmit
            mode={mode}
            onSelect={(m) => {
              setMode(m);
              submit(m);
            }}
            pending={pending}
          />
        </div>
      </form>

      {/* Live counter */}
      <LiveCounter route={route} date={date} flights={flights} enabled={hasValidEndpoints} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Route dot — IATA input with autocomplete
// ---------------------------------------------------------------------------

interface RouteDotProps {
  index: number;
  total: number;
  label: string;
  value: string;
  onChange: (v: string) => void;
  onRemove?: () => void;
  big?: boolean;
}

function RouteDot({ index, total, label, value, onChange, onRemove, big = false }: RouteDotProps) {
  const [focused, setFocused] = useState(false);
  const suggestions: Airport[] = focused && value.length >= 1 ? searchAirports(value) : [];
  const isEndpoint = index === 0 || index === total - 1;
  const dotColor =
    index === 0 ? 'bg-matcha-600' : index === total - 1 ? 'bg-ube-800' : 'bg-lemon-500';

  return (
    <div className={cn('relative flex items-center gap-2')}>
      <div
        className={cn(
          'size-3 shrink-0 rounded-full border-2 border-white ring-1 ring-oat',
          dotColor,
        )}
        aria-hidden
      />
      <div className="space-y-0.5">
        <div className="clay-label text-[10px]">{label}</div>
        <div className="relative">
          <input
            value={value}
            onChange={(e) => onChange(e.target.value.toUpperCase().slice(0, 3))}
            placeholder={index === 0 ? 'CCU' : index === total - 1 ? 'AMS' : 'DOH'}
            maxLength={3}
            autoComplete="off"
            className={cn(
              'border-0 bg-transparent p-0 font-mono font-semibold tracking-wider text-foreground outline-none placeholder:text-warm-silver',
              // Responsive: even in hero mode, mobile gets the compact sizing
              // so three dots + add button fit on one row at 375px. Desktop
              // still gets the generous treatment.
              big ? 'w-12 text-lg md:w-14 md:text-2xl' : 'w-12 text-lg',
            )}
            onFocus={() => setFocused(true)}
            onBlur={() => setTimeout(() => setFocused(false), 150)}
          />
          {suggestions.length > 0 ? (
            <ul className="absolute left-0 top-full z-30 mt-1 w-60 overflow-hidden rounded-md border border-oat bg-popover shadow-clay">
              {suggestions.map((a) => (
                <li key={a.iata}>
                  <button
                    type="button"
                    onClick={() => onChange(a.iata)}
                    className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-oat-light"
                  >
                    <span className="font-mono font-semibold">{a.iata}</span>
                    <span className="text-warm-charcoal">
                      {a.city} · {a.country}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
      {!isEndpoint && onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          className="rounded-full p-1 text-warm-silver hover:bg-oat-light hover:text-foreground"
          aria-label={`Remove ${value || 'layover'}`}
        >
          <X className="size-3" />
        </button>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Mode pill — submit surface, two halves
// ---------------------------------------------------------------------------

interface ModeSubmitProps {
  mode: Mode;
  onSelect: (m: Mode) => void;
  pending: boolean;
}

function ModeSubmit({ mode, onSelect, pending }: ModeSubmitProps) {
  return (
    <div className="grid grid-cols-2 rounded-full border border-oat bg-oat-light p-1">
      <button
        type="button"
        onClick={() => onSelect('offer')}
        disabled={pending}
        className={cn(
          'clay-hover inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors',
          mode === 'offer'
            ? 'bg-foreground text-background shadow-clay'
            : 'bg-transparent text-warm-charcoal hover:text-foreground',
        )}
      >
        <Send className="size-4" />
        I&apos;m flying this
      </button>
      <button
        type="button"
        onClick={() => onSelect('seek')}
        disabled={pending}
        className={cn(
          'clay-hover inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-sm font-semibold transition-colors',
          mode === 'seek'
            ? 'bg-foreground text-background shadow-clay'
            : 'bg-transparent text-warm-charcoal hover:text-foreground',
        )}
      >
        <Search className="size-4" />
        Find someone on this
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Live counter — client-side Supabase count query
// ---------------------------------------------------------------------------

interface LiveCounterProps {
  route: string[];
  date: string;
  flights: string[];
  enabled: boolean;
}

function LiveCounter({ route, date, flights, enabled }: LiveCounterProps) {
  const [count, setCount] = useState<number | null>(null);
  const [status, setStatus] = useState<'idle' | 'loading' | 'error'>('idle');

  // A lazy, module-level singleton so we don't spin up a client per keystroke.
  const supabase = useMemo(() => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) return null;
    return createClient(url, key, { auth: { persistSession: false } });
  }, []);

  const from = route[0]?.toUpperCase() ?? '';
  const to = route[route.length - 1]?.toUpperCase() ?? '';

  const runCount = useCallback(async () => {
    if (!supabase || !enabled || !from || !to || !date) return;
    setStatus('loading');
    try {
      let q = supabase
        .from('public_trips')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open')
        .contains('route', [from])
        .contains('route', [to]);

      if (flights.length > 0) {
        q = q.overlaps('flight_numbers', flights);
      } else {
        // Match the server's date window for consistency.
        const centre = new Date(`${date}T00:00:00Z`).getTime();
        const ms = 86_400_000;
        const start = new Date(centre - ms).toISOString().slice(0, 10);
        const end = new Date(centre + ms).toISOString().slice(0, 10);
        q = q.gte('travel_date', start).lte('travel_date', end);
      }

      const { count, error } = await q;
      if (error) throw error;
      setCount(count ?? 0);
      setStatus('idle');
    } catch {
      setStatus('error');
    }
  }, [supabase, enabled, from, to, date, flights]);

  useEffect(() => {
    if (!enabled) {
      setCount(null);
      return;
    }
    const handle = setTimeout(runCount, 350);
    return () => clearTimeout(handle);
  }, [runCount, enabled]);

  if (!enabled || count === null) return null;

  const params = new URLSearchParams({ from, to, date });
  if (flights.length > 0) params.set('fn', flights.join(','));

  return (
    <div className="mt-4 flex items-center justify-center">
      <a
        href={`/search?${params.toString()}`}
        className="clay-hover inline-flex items-center gap-2 rounded-full bg-oat-light px-4 py-2 text-sm text-foreground"
      >
        <span
          className={cn(
            'inline-block size-2 rounded-full',
            count === 0 ? 'bg-warm-silver' : 'bg-matcha-600',
          )}
        />
        {status === 'loading' ? (
          'Looking…'
        ) : count === 0 ? (
          <>No one on this flight yet — you could be the first to post.</>
        ) : (
          <>
            <b>{count}</b> {count === 1 ? 'traveller' : 'travellers'} on this flight
            <ArrowRight className="size-3.5" />
          </>
        )}
      </a>
    </div>
  );
}
