'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LanguageMultiSelect } from '@/components/language-multi-select';
import { saveOnboardingProfile } from './actions';

/**
 * Onboarding form. Client-side state because the language multi-select is
 * interactive and we want "Save" to feel responsive. Submission goes to a
 * server action that updates the profiles row keyed on Clerk user ID.
 */

const ROLE_OPTIONS: Array<{
  value: 'family' | 'companion';
  label: string;
  description: string;
}> = [
  {
    value: 'family',
    label: "I'm sending a family member",
    description:
      "You're posting trips on behalf of an elderly parent or relative who's travelling.",
  },
  {
    value: 'companion',
    label: "I'm happy to help fellow travellers",
    description:
      "You're flying routes regularly and open to helping an elderly parent on the same plane.",
  },
];

const LANGUAGE_OPTIONS = [
  'English',
  'Hindi',
  'Bengali',
  'Tamil',
  'Telugu',
  'Urdu',
  'Punjabi',
  'Marathi',
  'Gujarati',
  'Malayalam',
  'Kannada',
  'Arabic',
  'Mandarin',
  'German',
  'French',
  'Dutch',
  'Spanish',
  'Italian',
  'Portuguese',
] as const;

interface OnboardingFormProps {
  initialValues: {
    displayName: string;
    role: 'family' | 'companion' | null;
    primaryLanguage: string;
    languages: string[];
    whatsappNumber: string;
    bio: string;
  };
}

export function OnboardingForm({ initialValues }: OnboardingFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [role, setRole] = useState<'family' | 'companion' | null>(initialValues.role);
  const [primaryLanguage, setPrimaryLanguage] = useState(initialValues.primaryLanguage);
  const [languages, setLanguages] = useState<string[]>(
    initialValues.languages.length > 0 ? initialValues.languages : ['English'],
  );
  const [whatsappNumber, setWhatsappNumber] = useState(initialValues.whatsappNumber);
  const [bio, setBio] = useState(initialValues.bio);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    // Client-side validation that matches the server action's rules, so
    // users don't wait for a round trip to learn a field is wrong.
    if (!displayName.trim()) return setError('Tell us what to call you.');
    if (!role) return setError('Pick one — are you sending someone or helping?');
    if (!primaryLanguage) return setError("Pick your parent's main language.");
    if (!/^\+[1-9][0-9]{7,14}$/.test(whatsappNumber.trim())) {
      return setError('WhatsApp number should be in full international form, like +919876543210.');
    }

    start(async () => {
      const effectiveLanguages = Array.from(new Set([primaryLanguage, ...languages]));
      const res = await saveOnboardingProfile({
        displayName: displayName.trim(),
        role,
        primaryLanguage,
        languages: effectiveLanguages,
        whatsappNumber: whatsappNumber.trim(),
        bio: bio.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push('/dashboard');
      router.refresh();
    });
  }

  return (
    <form onSubmit={submit} className="space-y-6 rounded-2xl border border-oat bg-white p-6 md:p-8">
      <div className="space-y-2">
        <Label htmlFor="displayName">Your name</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="First name + initial is fine — e.g. Priya R."
          autoComplete="name"
          maxLength={60}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Which side of the trip?</legend>
        <div className="grid gap-2">
          {ROLE_OPTIONS.map((opt) => {
            const active = role === opt.value;
            return (
              <label
                key={opt.value}
                className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors ${
                  active
                    ? 'border-marigold-600 bg-marigold-50'
                    : 'border-oat bg-white hover:bg-oat-light'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={opt.value}
                  checked={active}
                  onChange={() => setRole(opt.value)}
                  className="mt-1"
                />
                <div className="space-y-0.5">
                  <div className="text-sm font-medium text-foreground">{opt.label}</div>
                  <div className="text-xs leading-relaxed text-warm-charcoal">
                    {opt.description}
                  </div>
                </div>
              </label>
            );
          })}
        </div>
      </fieldset>

      <div className="space-y-2">
        <Label htmlFor="primaryLanguage">
          {role === 'family' ? "Your parent's main language" : 'Your strongest language'}
        </Label>
        <select
          id="primaryLanguage"
          value={primaryLanguage}
          onChange={(e) => setPrimaryLanguage(e.target.value)}
          className="flex h-10 w-full rounded-md border border-oat bg-white px-3 py-2 text-sm"
        >
          {LANGUAGE_OPTIONS.map((lang) => (
            <option key={lang} value={lang}>
              {lang}
            </option>
          ))}
        </select>
        <p className="text-xs text-warm-silver">
          This is the one we match on first. You can add more below.
        </p>
      </div>

      <div className="space-y-2">
        <Label>Other languages you can help in</Label>
        <LanguageMultiSelect
          options={LANGUAGE_OPTIONS}
          selected={languages.filter((l) => l !== primaryLanguage)}
          onChange={(next) => setLanguages(next)}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsappNumber">WhatsApp number</Label>
        <Input
          id="whatsappNumber"
          type="tel"
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          placeholder="+919876543210"
          autoComplete="tel"
        />
        <p className="text-xs text-warm-silver">
          International format, starting with +. Once a match happens we&rsquo;ll coordinate over
          WhatsApp — we never share this number publicly.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio">One line about yourself (optional)</Label>
        <Textarea
          id="bio"
          value={bio}
          onChange={(e) => setBio(e.target.value)}
          placeholder={
            role === 'family'
              ? 'Ma flies twice a year, speaks Bengali, happiest when someone chats with her at the gate.'
              : 'Student at Delft, fly CCU → AMS every winter, happy to walk someone through Doha.'
          }
          rows={3}
          maxLength={280}
        />
      </div>

      {error ? (
        <div className="rounded-md border border-pomegranate-400/40 bg-pomegranate-400/10 p-3 text-sm text-foreground">
          {error}
        </div>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-warm-silver">
          You can edit any of this later from your dashboard.
        </p>
        <Button type="submit" disabled={pending} className="rounded-full px-6">
          {pending ? 'Saving…' : 'Save and continue'}
        </Button>
      </div>
    </form>
  );
}
