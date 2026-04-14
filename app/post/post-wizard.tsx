'use client';

import { useState, useTransition } from 'react';
import { ArrowRight, Plus, X } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { HELP_CATEGORIES, LANGUAGES } from '@/lib/languages';
import { isValidIata } from '@/lib/iata';
import { createTripAction, type TripInput } from './actions';

interface PostWizardProps {
  kind: 'request' | 'offer';
  profileLanguages: string[];
  defaults?: Partial<TripInput>;
}

export function PostWizard({ kind, profileLanguages, defaults }: PostWizardProps) {
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
    elderly_first_name: defaults?.elderly_first_name ?? '',
    elderly_age_band: defaults?.elderly_age_band ?? null,
    elderly_medical_notes: defaults?.elderly_medical_notes ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function setRouteAt(i: number, v: string) {
    setState((s) => {
      const next = [...s.route];
      next[i] = v.toUpperCase().slice(0, 3);
      return { ...s, route: next };
    });
  }
  function addLayover() {
    setState((s) => ({
      ...s,
      route: [...s.route.slice(0, -1), '', s.route[s.route.length - 1] ?? ''],
    }));
  }
  function removeLeg(i: number) {
    setState((s) => {
      if (s.route.length <= 2) return s;
      const next = s.route.filter((_, idx) => idx !== i);
      return { ...s, route: next };
    });
  }

  function toggleLanguage(l: string) {
    setState((s) => ({
      ...s,
      languages: s.languages.includes(l) ? s.languages.filter((x) => x !== l) : [...s.languages, l],
    }));
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

  return (
    <form onSubmit={onSubmit} className="space-y-8">
      {error ? (
        <Alert variant="destructive">
          <AlertTitle>We couldn't post this trip</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-serif text-xl">Route</h2>
        <p className="text-sm text-muted-foreground">
          Two airports minimum. Add a layover if the connection is where help is needed.
        </p>
        <ol className="space-y-2">
          {state.route.map((code, i) => (
            <li key={i} className="flex items-center gap-2">
              <span className="w-6 text-xs text-muted-foreground">
                {i === 0 ? 'From' : i === state.route.length - 1 ? 'To' : 'Via'}
              </span>
              <Input
                value={code}
                onChange={(e) => setRouteAt(i, e.target.value)}
                className="w-28 font-mono uppercase tracking-wider"
                maxLength={3}
                placeholder="CCU"
                required
              />
              {state.route.length > 2 && i !== 0 && i !== state.route.length - 1 ? (
                <Button type="button" size="icon" variant="ghost" onClick={() => removeLeg(i)}>
                  <X className="size-4" />
                </Button>
              ) : null}
              {i < state.route.length - 1 ? (
                <ArrowRight className="size-4 text-muted-foreground" aria-hidden />
              ) : null}
            </li>
          ))}
        </ol>
        <Button type="button" variant="ghost" size="sm" onClick={addLayover}>
          <Plus className="mr-1 size-4" /> Add a layover
        </Button>
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="travel_date">Travel date</Label>
          <Input
            id="travel_date"
            type="date"
            value={state.travel_date}
            onChange={(e) => setState({ ...state, travel_date: e.target.value })}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="airline">Airline (optional)</Label>
          <Input
            id="airline"
            value={state.airline ?? ''}
            onChange={(e) => setState({ ...state, airline: e.target.value })}
            placeholder="KLM, Qatar, Emirates…"
          />
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl">
          {isRequest ? 'Languages the parent speaks' : 'Languages you speak'}
        </h2>
        <p className="text-sm text-muted-foreground">
          We rank matches by language first. Be honest — a mother tongue you can actually hold a
          conversation in.
        </p>
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-3">
          {LANGUAGES.map((l) => (
            <label key={l} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={state.languages.includes(l)}
                onCheckedChange={() => toggleLanguage(l)}
              />
              {l}
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="font-serif text-xl">Help</h2>
        <p className="text-sm text-muted-foreground">
          Categories are hints to companions — picking a few helps people self-select in or out.
        </p>
        <div className="grid gap-2 sm:grid-cols-2">
          {HELP_CATEGORIES.map((h) => (
            <label key={h.key} className="flex items-start gap-3 rounded-md border p-3 text-sm">
              <Checkbox
                checked={state.help_categories.includes(h.key)}
                onCheckedChange={() => toggleHelp(h.key)}
                className="mt-0.5"
              />
              <div>
                <div className="font-medium">{h.label}</div>
                <div className="text-xs text-muted-foreground">{h.description}</div>
              </div>
            </label>
          ))}
        </div>
      </section>

      {isRequest ? (
        <section className="space-y-4">
          <h2 className="font-serif text-xl">About the parent</h2>
          <p className="text-sm text-muted-foreground">
            Only the age band is public. The first name and any medical notes are hidden until a
            request is accepted.
          </p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="elderly_first_name">First name</Label>
              <Input
                id="elderly_first_name"
                value={state.elderly_first_name ?? ''}
                onChange={(e) => setState({ ...state, elderly_first_name: e.target.value })}
                placeholder="Shanta"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="elderly_age_band">Age band</Label>
              <select
                id="elderly_age_band"
                value={state.elderly_age_band ?? ''}
                onChange={(e) =>
                  setState({
                    ...state,
                    elderly_age_band: (e.target.value || null) as TripInput['elderly_age_band'],
                  })
                }
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="">Pick a band</option>
                <option value="60-70">60–70</option>
                <option value="70-80">70–80</option>
                <option value="80+">80+</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="elderly_medical_notes">Medical notes (private)</Label>
            <Textarea
              id="elderly_medical_notes"
              rows={3}
              value={state.elderly_medical_notes ?? ''}
              onChange={(e) => setState({ ...state, elderly_medical_notes: e.target.value })}
              placeholder="Diabetic; meds at mealtimes. Walks slowly but doesn't need a wheelchair."
            />
            <p className="text-xs text-muted-foreground">
              Shared only with the companion after the request is accepted.
            </p>
          </div>
        </section>
      ) : null}

      <section className="space-y-4">
        <h2 className="font-serif text-xl">Details</h2>
        {isRequest ? (
          <div className="space-y-1.5">
            <Label htmlFor="thank_you_eur">Thank-you amount (EUR, approximate)</Label>
            <Input
              id="thank_you_eur"
              type="number"
              min={0}
              max={500}
              value={state.thank_you_eur ?? ''}
              onChange={(e) =>
                setState({
                  ...state,
                  thank_you_eur: e.target.value === '' ? null : Number.parseInt(e.target.value, 10),
                })
              }
              placeholder="15"
            />
            <p className="text-xs text-muted-foreground">
              Sathi never touches money. This is just the suggested gratitude to settle between you.
            </p>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="notes">Notes</Label>
          <Textarea
            id="notes"
            rows={4}
            value={state.notes ?? ''}
            onChange={(e) => setState({ ...state, notes: e.target.value })}
            placeholder={
              isRequest
                ? 'Ma has done this flight once; the Doha transfer is where she gets confused. Vegetarian.'
                : 'I arrive at CCU three hours early and can wait with someone at check-in if needed.'
            }
          />
        </div>
      </section>

      <div className="flex justify-end">
        <Button size="lg" type="submit" disabled={pending}>
          {pending ? 'Posting…' : isRequest ? 'Post request' : 'Post offer'}
        </Button>
      </div>
    </form>
  );
}
