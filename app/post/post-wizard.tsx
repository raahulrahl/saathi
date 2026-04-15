'use client';

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { Check, Loader2, Plus, Send, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LanguageMultiSelect } from '@/components/language-multi-select';
import { HELP_CATEGORIES, LANGUAGES } from '@/lib/languages';
import { AIRPORTS, isValidIata } from '@/lib/iata';
import { createTripAction, type TripInput } from './actions';

export interface FlightLookupResult {
  flightNumber: string;
  airline: string;
  airlineIata: string;
  from: { iata: string; airport: string; timezone: string };
  to: { iata: string; airport: string; timezone: string };
  departure: string;
  arrival: string;
  duration: string;
}

interface PostWizardProps {
  kind: 'request' | 'offer';
  profileLanguages: string[];
  defaults?: Partial<TripInput> | undefined;
  /** Called whenever the route array changes — used to update the globe. */
  onRouteChange?: ((route: string[]) => void) | undefined;
  /** Called when a flight number resolves — parent uses it to render timeline. */
  onFlightLookup?: ((legIndex: number, detail: FlightLookupResult) => void) | undefined;
}

// IATA → city lookup for the journey chips
const CITY_BY_IATA = new Map(AIRPORTS.map((a) => [a.iata, a.city]));

export function PostWizard({
  kind,
  profileLanguages,
  defaults,
  onRouteChange,
  onFlightLookup,
}: PostWizardProps) {
  const [state, setState] = useState<TripInput>({
    kind,
    route: defaults?.route ?? [defaults?.route?.[0] ?? '', defaults?.route?.[1] ?? ''],
    travel_date: defaults?.travel_date ?? '',
    airline: defaults?.airline ?? '',
    flight_numbers: defaults?.flight_numbers ?? [],
    languages: defaults?.languages ?? profileLanguages,
    gender_preference: defaults?.gender_preference ?? 'any',
    help_categories: defaults?.help_categories ?? [],
    thank_you_eur: defaults?.thank_you_eur ?? (kind === 'request' ? 15 : null),
    notes: defaults?.notes ?? '',
    // For a request trip we seed ONE empty elder block so users see the
    // parent form immediately. They can add more via the "Add another"
    // button, or remove this one back down to zero.
    elders:
      defaults?.elders ??
      (kind === 'request' ? [{ first_name: '', age_band: null, medical_notes: '' }] : []),
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Per-leg lookup status
  type LookupStatus = 'idle' | 'loading' | 'found' | 'not-found';
  const [lookupStatus, setLookupStatus] = useState<Record<number, LookupStatus>>({});
  const [lookupError, setLookupError] = useState<Record<number, string>>({});
  const lookedUp = useRef<Map<number, string>>(new Map());

  /**
   * Look up a flight number and fill the route + airline fields.
   * All setState calls below use the functional form so they compose
   * safely with concurrent input-change updates (prevents state loss).
   */
  async function lookupFlight(legIndex: number) {
    const flightNumber = state.flight_numbers[legIndex]?.trim();
    if (!flightNumber || flightNumber.length < 3) return;
    if (lookedUp.current.get(legIndex) === flightNumber) return;

    const date = state.travel_date || new Date().toISOString().slice(0, 10);

    setLookupStatus((s) => ({ ...s, [legIndex]: 'loading' }));
    setLookupError((s) => {
      const { [legIndex]: _omit, ...rest } = s;
      return rest;
    });

    try {
      const res = await fetch('/api/flights/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flightNumber, date }),
      });
      const data = await res.json();

      if (!data.success || !data.flight) {
        setLookupStatus((s) => ({ ...s, [legIndex]: 'not-found' }));
        setLookupError((s) => ({
          ...s,
          [legIndex]: data.error ?? `Couldn't find ${flightNumber}.`,
        }));
        return;
      }

      lookedUp.current.set(legIndex, flightNumber);
      onFlightLookup?.(legIndex, data.flight as FlightLookupResult);

      setState((prev) => {
        const nextRoute = [...prev.route];
        if (!nextRoute[legIndex]) nextRoute[legIndex] = data.flight.from.iata;
        if (!nextRoute[legIndex + 1]) nextRoute[legIndex + 1] = data.flight.to.iata;
        return {
          ...prev,
          route: nextRoute,
          airline: prev.airline || data.flight.airline,
        };
      });
      setLookupStatus((s) => ({ ...s, [legIndex]: 'found' }));
    } catch (err) {
      console.error('[flight-lookup] network error:', err);
      setLookupStatus((s) => ({ ...s, [legIndex]: 'not-found' }));
      setLookupError((s) => ({ ...s, [legIndex]: 'Network error — please try again.' }));
    }
  }

  // Notify parent whenever the route changes — drives the globe.
  const routeKey = state.route.join(',');
  useEffect(() => {
    onRouteChange?.(state.route);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  function setRouteAt(i: number, v: string) {
    setState((s) => {
      const next = [...s.route];
      next[i] = v.toUpperCase().slice(0, 3);
      return { ...s, route: next };
    });
  }
  /** Insert an empty layover at the given route index (0-based). */
  function insertLayoverAt(index: number) {
    setState((s) => {
      const next = [...s.route];
      next.splice(index, 0, '');
      return { ...s, route: next };
    });
  }
  function removeLeg(i: number) {
    setState((s) => {
      if (s.route.length <= 2) return s;
      return { ...s, route: s.route.filter((_, idx) => idx !== i) };
    });
  }

  function toggleHelp(k: string) {
    setState((s) => ({
      ...s,
      help_categories: s.help_categories.includes(k)
        ? s.help_categories.filter((x) => x !== k)
        : [...s.help_categories, k],
    }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!state.route.every(isValidIata)) {
      setError('All airport codes must be valid IATA codes (e.g. CCU, AMS).');
      return;
    }
    if (state.languages.length === 0) {
      setError('Add at least one language.');
      return;
    }
    if (!state.travel_date) {
      setError('Pick a travel date.');
      return;
    }
    start(async () => {
      const result = await createTripAction(state);
      if (result && !result.ok) setError(result.error);
    });
  }

  const isRequest = kind === 'request';
  const legCount = state.route.length - 1;

  const routeRoleLabel = useMemo(
    () => (i: number, total: number) => {
      if (i === 0) return 'From';
      if (i === total - 1) return 'To';
      return 'Via';
    },
    [],
  );

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>We couldn&rsquo;t post this trip</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {/* ─── 1. Compact journey row ─────────────────────────────────────── */}
      <section className="space-y-2">
        <div>
          <h2 className="font-serif text-lg">Your flight path</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Tap the{' '}
            <span className="inline-flex size-4 items-center justify-center rounded-full border border-oat bg-background align-middle">
              <Plus className="size-2.5" />
            </span>{' '}
            between airports to add a layover.
          </p>
        </div>

        <div className="flex flex-wrap items-end justify-center gap-x-1 gap-y-6 rounded-xl border border-oat bg-cream/60 p-4 sm:justify-start">
          {state.route.map((code, i) => {
            const city = code.length === 3 ? CITY_BY_IATA.get(code) : null;
            const role = routeRoleLabel(i, state.route.length);
            const isLayover = role === 'Via';

            return (
              <Fragment key={i}>
                {/* Airport chip: role tag → IATA input → city name */}
                <div className="relative flex flex-col items-center gap-1">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {role}
                  </span>
                  <Input
                    value={code}
                    onChange={(e) => setRouteAt(i, e.target.value)}
                    className="h-11 w-20 rounded-lg border-oat-dark bg-background text-center font-mono text-lg font-bold uppercase tracking-wider focus-visible:ring-matcha-600"
                    maxLength={3}
                    placeholder="—"
                    required
                  />
                  <span className="min-h-[1rem] max-w-[6rem] truncate text-[11px] text-muted-foreground">
                    {city ?? '\u00A0'}
                  </span>
                  {isLayover && (
                    <button
                      type="button"
                      onClick={() => removeLeg(i)}
                      aria-label="Remove layover"
                      className="absolute -right-2 -top-1 rounded-full bg-background p-0.5 text-muted-foreground ring-1 ring-oat hover:text-destructive"
                    >
                      <X className="size-3" />
                    </button>
                  )}
                </div>

                {/* Connector: click "+" to insert a layover between these two airports */}
                {i < state.route.length - 1 && (
                  <div className="group relative flex items-center gap-0.5 pb-6">
                    <div className="h-px w-4 bg-oat-dark sm:w-6" />
                    <button
                      type="button"
                      onClick={() => insertLayoverAt(i + 1)}
                      aria-label="Add layover here"
                      title="Add layover here"
                      className="flex size-7 items-center justify-center rounded-full border border-oat bg-background text-muted-foreground transition-all hover:scale-110 hover:border-matcha-600 hover:bg-matcha-300/20 hover:text-matcha-800 hover:shadow-sm"
                    >
                      <Plus className="size-3.5" />
                    </button>
                    <div className="h-px w-4 bg-oat-dark sm:w-6" />
                  </div>
                )}
              </Fragment>
            );
          })}
        </div>
      </section>

      {/* ─── 2. Flight numbers — compact list ───────────────────────────── */}
      <section className="space-y-2">
        <div>
          <h2 className="font-serif text-lg">Flight numbers</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Type a flight number and we&rsquo;ll auto-fill the airports + airline.
          </p>
        </div>

        <div className="space-y-1.5">
          {state.route.slice(0, -1).map((from, i) => {
            const to = state.route[i + 1] ?? '';
            const status = lookupStatus[i] ?? 'idle';
            return (
              <div key={i} className="flex flex-wrap items-center gap-3">
                <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">
                  Leg {i + 1}
                  {from && to ? ` · ${from} → ${to}` : ''}
                </span>
                <div className="relative">
                  <Input
                    value={state.flight_numbers[i] ?? ''}
                    onChange={(e) => {
                      const value = e.target.value.toUpperCase().replace(/\s+/g, '');
                      setState((prev) => {
                        const next = [...prev.flight_numbers];
                        next[i] = value;
                        return { ...prev, flight_numbers: next };
                      });
                      setLookupStatus((s) => ({ ...s, [i]: 'idle' }));
                    }}
                    onBlur={() => void lookupFlight(i)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        e.stopPropagation();
                        void lookupFlight(i);
                      }
                    }}
                    placeholder={i === 0 ? 'QR540' : 'QR23'}
                    maxLength={10}
                    className="h-9 w-36 pr-8 font-mono uppercase tracking-wide"
                    autoComplete="off"
                  />
                  <div className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
                    {status === 'loading' && (
                      <Loader2 className="size-4 animate-spin text-muted-foreground" />
                    )}
                    {status === 'found' && <Check className="size-4 text-matcha-600" />}
                  </div>
                </div>
                {status === 'not-found' && (
                  <span className="text-xs text-muted-foreground">
                    {lookupError[i] ?? `Couldn't find it.`}
                  </span>
                )}
              </div>
            );
          })}
          {legCount === 0 && (
            <p className="text-xs italic text-muted-foreground">
              Add a destination to enter a flight number.
            </p>
          )}
        </div>
      </section>

      {/* ─── 3. Date + Airline ──────────────────────────────────────────── */}
      <section className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="travel_date" className="text-xs">
            Travel date
          </Label>
          <Input
            id="travel_date"
            type="date"
            value={state.travel_date}
            onChange={(e) => {
              const value = e.target.value;
              setState((prev) => ({ ...prev, travel_date: value }));
            }}
            required
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="airline" className="text-xs">
            Airline <span className="text-muted-foreground">(optional)</span>
          </Label>
          <Input
            id="airline"
            value={state.airline ?? ''}
            onChange={(e) => {
              const value = e.target.value;
              setState((prev) => ({ ...prev, airline: value }));
            }}
            placeholder="KLM, Qatar, Emirates…"
          />
        </div>
      </section>

      {/* ─── 4. Languages ───────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div>
          <h2 className="font-serif text-lg">
            {isRequest ? 'Languages they speak' : 'Languages you speak'}
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            We rank matches by language first. Be honest — only ones you can hold a conversation in.
          </p>
        </div>
        <LanguageMultiSelect
          options={LANGUAGES}
          selected={state.languages}
          onChange={(next) => setState((s) => ({ ...s, languages: next }))}
          placeholder={isRequest ? 'Pick their languages…' : 'Pick your languages…'}
        />
      </section>

      {/* ─── 5. Help categories ─────────────────────────────────────────── */}
      <section className="space-y-2">
        <div className="flex items-end justify-between gap-3">
          <div>
            <h2 className="font-serif text-lg">What could you help with?</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Tap any that apply. Hover for a hint.
            </p>
          </div>
          {state.help_categories.length > 0 && (
            <span className="shrink-0 text-xs text-muted-foreground">
              {state.help_categories.length}/{HELP_CATEGORIES.length}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {HELP_CATEGORIES.map((h) => {
            const checked = state.help_categories.includes(h.key);
            return (
              <button
                key={h.key}
                type="button"
                onClick={() => toggleHelp(h.key)}
                title={h.description}
                aria-pressed={checked}
                className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                  checked
                    ? 'border-matcha-600 bg-matcha-600 text-white shadow-sm hover:bg-matcha-800'
                    : 'border-oat bg-card text-foreground hover:border-matcha-600 hover:bg-matcha-300/10'
                }`}
              >
                {checked && <span>✓</span>}
                {h.label}
              </button>
            );
          })}
        </div>
      </section>

      {/* ─── 6. Loved-one details (request flow only) ───────────────────── */}
      {isRequest ? (
        <section className="space-y-3">
          <div>
            <h2 className="font-serif text-lg">
              {state.elders.length > 1 ? 'About your loved ones' : 'About your loved one'}
            </h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              This could be a parent, a spouse, a sibling — whoever you&rsquo;re sending. Only age
              bands are public. Names and medical notes stay private until the request is accepted.
              Add more if they&rsquo;re travelling together.
            </p>
          </div>

          <ul className="space-y-3">
            {state.elders.map((elder, i) => (
              <li
                key={i}
                className="relative space-y-3 rounded-2xl border border-oat bg-cream/40 p-4"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    Traveller {i + 1}
                  </span>
                  {state.elders.length > 1 && (
                    <button
                      type="button"
                      onClick={() =>
                        setState((prev) => ({
                          ...prev,
                          elders: prev.elders.filter((_, idx) => idx !== i),
                        }))
                      }
                      aria-label={`Remove traveller ${i + 1}`}
                      className="rounded-full p-1 text-muted-foreground hover:bg-oat hover:text-destructive"
                    >
                      <X className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label htmlFor={`elder-name-${i}`} className="text-xs">
                      First name
                    </Label>
                    <Input
                      id={`elder-name-${i}`}
                      value={elder.first_name ?? ''}
                      onChange={(e) => {
                        const value = e.target.value;
                        setState((prev) => {
                          const next = [...prev.elders];
                          next[i] = { ...next[i]!, first_name: value };
                          return { ...prev, elders: next };
                        });
                      }}
                      placeholder={i === 0 ? 'Shanta' : 'Arun'}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`elder-age-${i}`} className="text-xs">
                      Age band
                    </Label>
                    <select
                      id={`elder-age-${i}`}
                      value={elder.age_band ?? ''}
                      onChange={(e) => {
                        const raw = e.target.value;
                        const value = (raw || null) as '60-70' | '70-80' | '80+' | null;
                        setState((prev) => {
                          const next = [...prev.elders];
                          next[i] = { ...next[i]!, age_band: value };
                          return { ...prev, elders: next };
                        });
                      }}
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    >
                      <option value="">Pick a band</option>
                      <option value="60-70">60–70</option>
                      <option value="70-80">70–80</option>
                      <option value="80+">80+</option>
                    </select>
                  </div>
                </div>
                <div className="space-y-1">
                  <Label htmlFor={`elder-notes-${i}`} className="text-xs">
                    Medical notes (private)
                  </Label>
                  <Textarea
                    id={`elder-notes-${i}`}
                    rows={2}
                    value={elder.medical_notes ?? ''}
                    onChange={(e) => {
                      const value = e.target.value;
                      setState((prev) => {
                        const next = [...prev.elders];
                        next[i] = { ...next[i]!, medical_notes: value };
                        return { ...prev, elders: next };
                      });
                    }}
                    placeholder="Diabetic; meds at mealtimes. Walks slowly but doesn't need a wheelchair."
                  />
                </div>
              </li>
            ))}
          </ul>

          {state.elders.length < 4 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() =>
                setState((prev) => ({
                  ...prev,
                  elders: [...prev.elders, { first_name: '', age_band: null, medical_notes: '' }],
                }))
              }
              className="gap-1.5"
            >
              <Plus className="size-3.5" />
              Add another traveller
            </Button>
          )}
        </section>
      ) : null}

      {/* ─── 7. Notes ───────────────────────────────────────────────────── */}
      <section className="space-y-2">
        <div>
          <h2 className="font-serif text-lg">Anything else?</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            A short note about how you like to help.
          </p>
        </div>
        {isRequest ? (
          <div className="space-y-1">
            <Label htmlFor="thank_you_eur" className="text-xs">
              Thank-you amount (EUR)
            </Label>
            <Input
              id="thank_you_eur"
              type="number"
              min={0}
              max={500}
              value={state.thank_you_eur ?? ''}
              onChange={(e) => {
                const raw = e.target.value;
                setState((prev) => ({
                  ...prev,
                  thank_you_eur: raw === '' ? null : Number.parseInt(raw, 10),
                }));
              }}
              placeholder="15"
            />
            <p className="text-[11px] text-muted-foreground">
              Saathi never touches money. Settled directly between you.
            </p>
          </div>
        ) : null}
        <Textarea
          id="notes"
          rows={3}
          value={state.notes ?? ''}
          onChange={(e) => {
            const value = e.target.value;
            setState((prev) => ({ ...prev, notes: value }));
          }}
          placeholder={
            isRequest
              ? 'Ma has done this flight once; the Doha transfer is where she gets confused. Vegetarian.'
              : 'I arrive at CCU three hours early and can wait with someone at check-in if needed.'
          }
        />
      </section>

      {/* ─── Submit ─────────────────────────────────────────────────────── */}
      <div className="flex flex-col-reverse items-stretch gap-3 border-t border-oat pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted-foreground">
          {isRequest
            ? 'Posting makes your request visible to travellers on the same route.'
            : 'Posting makes your offer visible to families.'}
        </p>
        <Button
          size="lg"
          type="submit"
          variant={isRequest ? 'slushie' : 'lemon'}
          disabled={pending}
          className="gap-2 px-6"
        >
          {pending ? (
            'Posting…'
          ) : (
            <>
              <Send className="size-4" />
              {isRequest ? 'Post request' : 'Post offer'}
            </>
          )}
        </Button>
      </div>
    </form>
  );
}
