'use client';

/**
 * Peek Widget — "before you book the ticket" companion to the main composer.
 *
 * The problem it solves: the main composer assumes you've already bought a
 * ticket (it asks for flight numbers). But a lot of the site's value is in
 * the chicken-and-egg prequel: Ma's daughter doesn't want to spend €800 on
 * QR540 if no one else is on QR540. She wants to know first.
 *
 * So this widget asks for only three things — from, to, date — queries the
 * public_trips view within a ±3 day window around the given date, and
 * shows the result split by kind:
 *   - offers  (companions saying "I'm flying this")
 *   - requests (families saying "I'm looking for someone on this")
 *
 * Both sides of the market want this view. A family sees "2 companions are
 * already offering help" and knows it's worth buying the ticket. A companion
 * sees "1 family is already looking for help" and has the same nudge.
 *
 * Deliberately lighter than the main composer: no mode toggle, no disclosure
 * panel, no live-as-you-type counter. One input, one button, one line of
 * result. It's a peek.
 */

import { useCallback, useMemo, useState } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import { ArrowRight, Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { isValidIata, searchAirports } from '@/lib/iata';
import { cn } from '@/lib/utils';

type Result =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'error' }
  | {
      state: 'done';
      offers: number;
      requests: number;
      from: string;
      to: string;
      date: string;
    };

function defaultPeekDate(): string {
  // 45 days out — a realistic "before you book" horizon for an international
  // ticket. Short enough that airline schedules are published and postings
  // exist, far enough that a family has time to actually buy the ticket if
  // the peek shows a match.
  const d = new Date();
  d.setDate(d.getDate() + 45);
  return format(d, 'yyyy-MM-dd');
}

export function PeekWidget({ className }: { className?: string }) {
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [date, setDate] = useState(defaultPeekDate());
  const [result, setResult] = useState<Result>({ state: 'idle' });

  const canSubmit =
    isValidIata(from.toUpperCase()) &&
    isValidIata(to.toUpperCase()) &&
    from.toUpperCase() !== to.toUpperCase() &&
    !!date;

  const peek = useCallback(async () => {
    if (!canSubmit) return;
    setResult({ state: 'loading' });
    const f = from.toUpperCase();
    const t = to.toUpperCase();
    try {
      // ±3 day window — same shape as the server-side matching, so the peek
      // is a faithful preview of what a search would return. The query runs
      // server-side via /api/public-trips/count (anon role, security_invoker
      // views) — identical RLS surface to the previous browser query.
      const qs = new URLSearchParams({ from: f, to: t, date, windowDays: '3' });
      const res = await fetch(`/api/public-trips/count?${qs.toString()}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { offers: number; requests: number };

      setResult({
        state: 'done',
        offers: data.offers,
        requests: data.requests,
        from: f,
        to: t,
        date,
      });
    } catch {
      setResult({ state: 'error' });
    }
  }, [canSubmit, from, to, date]);

  const searchHref = useMemo(() => {
    if (result.state !== 'done') return '/search';
    const params = new URLSearchParams({
      from: result.from,
      to: result.to,
      date: result.date,
    });
    return `/browse?${params.toString()}`;
  }, [result]);

  return (
    <div className={cn('w-full', className)}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          peek();
        }}
        className="rounded-2xl border border-dashed border-oat bg-white/60 p-5 md:p-6"
      >
        <div className="grid gap-3 md:grid-cols-[1fr_1fr_180px_auto]">
          <AirportField
            id="peek-from"
            label="From"
            value={from}
            onChange={setFrom}
            placeholder="CCU"
          />
          <AirportField id="peek-to" label="To" value={to} onChange={setTo} placeholder="AMS" />
          <div className="space-y-1.5">
            <Label htmlFor="peek-date" className="text-xs font-medium text-warm-charcoal">
              Around
            </Label>
            <Input
              id="peek-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
            />
          </div>
          <div className="flex items-end">
            <button
              type="submit"
              disabled={!canSubmit || result.state === 'loading'}
              className="clay-hover inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-foreground px-5 text-sm font-semibold text-background disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
            >
              <Search className="size-4" aria-hidden />
              Peek
            </button>
          </div>
        </div>
      </form>

      {/* Result strip — same footprint regardless of outcome, so the layout
          doesn't jump when results load. */}
      <div className="mt-3 min-h-[1.5rem] text-center text-sm leading-relaxed">
        {result.state === 'idle' ? (
          <span className="text-warm-silver">
            Pop in a date and a route — no flight number yet.
          </span>
        ) : result.state === 'loading' ? (
          <span className="text-warm-silver">Looking…</span>
        ) : result.state === 'error' ? (
          <span className="text-pomegranate-600">Couldn&rsquo;t check right now. Try again?</span>
        ) : result.offers === 0 && result.requests === 0 ? (
          <span className="text-warm-charcoal">
            No one on this route around that date yet.{' '}
            <Link
              href="/post/request"
              className="text-marigold-700 underline-offset-4 hover:underline"
            >
              Post first →
            </Link>
          </span>
        ) : (
          <span className="text-warm-charcoal">
            Around {formatShortDate(result.date)} on{' '}
            <span className="font-mono text-foreground">
              {result.from} → {result.to}
            </span>
            : <b className="text-marigold-700">{summaryText(result.offers, result.requests)}</b>.{' '}
            <Link
              href={searchHref}
              className="inline-flex items-center gap-1 text-marigold-700 underline-offset-4 hover:underline"
            >
              See them <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Inline airport field with IATA autocomplete. Mirrors the behaviour of
 * RouteDot in the main composer (same searchAirports() source) but with a
 * plainer visual — just the label + input + dropdown, no colored dot, no
 * dashed-line connectors. The peek widget was shipping a bare <Input> with
 * no suggestions, which made "was I supposed to memorise IATA codes?" a
 * real question. Now users can type "ams" or "amsterdam" and pick.
 *
 * onMouseDown (not onClick) writes the value before the field's onBlur
 * closes the list — with plain onClick the blur fires first and the click
 * lands on nothing.
 */
function AirportField({
  id,
  label,
  value,
  onChange,
  placeholder,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
}) {
  const [focused, setFocused] = useState(false);
  const suggestions = focused && value.length >= 1 ? searchAirports(value) : [];

  return (
    <div className="relative space-y-1.5">
      <Label htmlFor={id} className="text-xs font-medium text-warm-charcoal">
        {label}
      </Label>
      <Input
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase().slice(0, 3))}
        placeholder={placeholder}
        maxLength={3}
        autoComplete="off"
        className="font-mono uppercase tracking-wider"
        onFocus={() => setFocused(true)}
        onBlur={() => setTimeout(() => setFocused(false), 150)}
      />
      {suggestions.length > 0 ? (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-30 mt-1 max-h-64 min-w-[220px] overflow-auto rounded-lg border border-oat bg-popover py-1 shadow-lg"
        >
          {suggestions.map((a) => (
            <li key={a.iata}>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(a.iata);
                  setFocused(false);
                }}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-oat-light"
              >
                <span className="font-mono font-semibold">{a.iata}</span>
                <span className="truncate text-warm-charcoal">
                  {a.city} · {a.country}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function summaryText(offers: number, requests: number): string {
  const parts: string[] = [];
  if (offers > 0)
    parts.push(`${offers} ${offers === 1 ? 'companion' : 'companions'} offering help`);
  if (requests > 0) parts.push(`${requests} ${requests === 1 ? 'family' : 'families'} looking`);
  return parts.join(' · ');
}

function formatShortDate(iso: string): string {
  try {
    return format(new Date(`${iso}T00:00:00Z`), 'd MMM');
  } catch {
    return iso;
  }
}
