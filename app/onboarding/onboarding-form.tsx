'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Facebook, Instagram, Linkedin, Lock, Twitter } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LanguageMultiSelect } from '@/components/language-multi-select';
import { LANGUAGES } from '@/lib/languages';
import { saveOnboardingProfile } from './actions';

/**
 * Onboarding form (client). See app/onboarding/page.tsx for the flow.
 *
 * Fields:
 *   1. Display name
 *   2. Role — family or companion
 *   3. Languages — single multi-select; first selected = primary (badge)
 *   4. WhatsApp number — libphonenumber-js validation + private-by-default note
 *   5. Social profiles — LinkedIn / Facebook / Twitter / Instagram URLs;
 *      at least two required, not verified (just URL-pasted).
 *   6. Bio — optional, one line about you.
 *
 * Validation:
 *   Mirrors the zod schema in actions.ts so the user sees feedback
 *   without a round trip. The server runs it again before writing.
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

const SOCIAL_FIELDS: Array<{
  key: 'linkedinUrl' | 'facebookUrl' | 'twitterUrl' | 'instagramUrl';
  label: string;
  placeholder: string;
  icon: React.ComponentType<{ className?: string }>;
}> = [
  {
    key: 'linkedinUrl',
    label: 'LinkedIn',
    placeholder: 'https://linkedin.com/in/your-handle',
    icon: Linkedin,
  },
  {
    key: 'facebookUrl',
    label: 'Facebook',
    placeholder: 'https://facebook.com/your.profile',
    icon: Facebook,
  },
  {
    key: 'twitterUrl',
    label: 'X (Twitter)',
    placeholder: 'https://x.com/your-handle',
    icon: Twitter,
  },
  {
    key: 'instagramUrl',
    label: 'Instagram',
    placeholder: 'https://instagram.com/your.handle',
    icon: Instagram,
  },
];

interface OnboardingFormProps {
  initialValues: {
    displayName: string;
    role: 'family' | 'companion' | null;
    languages: string[];
    whatsappNumber: string;
    bio: string;
    linkedinUrl: string;
    facebookUrl: string;
    twitterUrl: string;
    instagramUrl: string;
  };
}

export function OnboardingForm({ initialValues }: OnboardingFormProps) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [role, setRole] = useState<'family' | 'companion' | null>(initialValues.role);
  const [languages, setLanguages] = useState<string[]>(
    initialValues.languages.length > 0 ? initialValues.languages : [],
  );
  const [whatsappNumber, setWhatsappNumber] = useState(initialValues.whatsappNumber);
  const [bio, setBio] = useState(initialValues.bio);
  const [socials, setSocials] = useState({
    linkedinUrl: initialValues.linkedinUrl,
    facebookUrl: initialValues.facebookUrl,
    twitterUrl: initialValues.twitterUrl,
    instagramUrl: initialValues.instagramUrl,
  });
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // Live phone validation so users see green/red feedback as they type.
  const phoneState = useMemo(() => {
    const trimmed = whatsappNumber.trim();
    if (!trimmed) return { valid: false, message: null };
    const parsed = parsePhoneNumberFromString(trimmed);
    if (!parsed) {
      return { valid: false, message: 'Needs to start with + and the country code.' };
    }
    if (!parsed.isValid()) {
      return { valid: false, message: "That doesn't look like a real phone number." };
    }
    return { valid: true, message: parsed.formatInternational(), country: parsed.country };
  }, [whatsappNumber]);

  const filledSocialCount = Object.values(socials).filter((v) => v.trim().length > 0).length;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!displayName.trim()) return setError('Tell us what to call you.');
    if (!role) return setError('Pick one — are you sending someone or helping?');
    if (languages.length < 1) return setError('Pick at least one language.');
    if (!phoneState.valid) {
      return setError(phoneState.message ?? 'Enter a valid WhatsApp number.');
    }
    if (filledSocialCount < 2) {
      return setError('Please share links to at least two of your social profiles.');
    }

    start(async () => {
      const res = await saveOnboardingProfile({
        displayName: displayName.trim(),
        role,
        primaryLanguage: languages[0]!,
        languages,
        whatsappNumber: whatsappNumber.trim(),
        bio: bio.trim() || null,
        linkedinUrl: socials.linkedinUrl.trim() || null,
        facebookUrl: socials.facebookUrl.trim() || null,
        twitterUrl: socials.twitterUrl.trim() || null,
        instagramUrl: socials.instagramUrl.trim() || null,
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
        <Label>Languages you can help in</Label>
        <LanguageMultiSelect
          options={LANGUAGES}
          selected={languages}
          onChange={setLanguages}
          markFirstAsPrimary
          placeholder="Pick one or more…"
        />
        <p className="text-xs text-warm-silver">
          The first language you pick is your <b>primary</b> — that&rsquo;s what we match on first.
          Pick the parent&rsquo;s strongest language first if you&rsquo;re posting for a family
          member.
        </p>
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
          aria-invalid={whatsappNumber.length > 0 && !phoneState.valid}
        />
        {whatsappNumber.length > 0 && phoneState.valid ? (
          <p className="text-xs text-matcha-800">
            ✓ Looks good — reads as <b>{phoneState.message}</b>
            {phoneState.country ? ` (${phoneState.country})` : ''}
          </p>
        ) : whatsappNumber.length > 0 && phoneState.message ? (
          <p className="text-xs text-pomegranate-600">{phoneState.message}</p>
        ) : (
          <p className="text-xs text-warm-silver">
            International format, starting with <b>+</b> and the country code (e.g. +91 for India,
            +31 for Netherlands, +1 for US/Canada).
          </p>
        )}
        <div className="mt-2 flex items-start gap-2 rounded-lg border border-dashed border-oat bg-oat-light/50 p-3 text-xs leading-relaxed text-warm-charcoal">
          <Lock className="mt-0.5 size-3.5 shrink-0 text-warm-charcoal" aria-hidden />
          <p>
            <b>We keep this private.</b> It&rsquo;s never listed publicly, never sold, never shown
            in search. We only share it with the other party <b>after a match is accepted</b>, so
            the two of you can coordinate directly over WhatsApp before the flight.
          </p>
        </div>
      </div>

      <fieldset className="space-y-3 rounded-lg border border-oat p-4">
        <legend className="px-1 text-sm font-medium text-foreground">
          Where else can we find you? <span className="text-warm-silver">(at least two)</span>
        </legend>
        <p className="text-xs leading-relaxed text-warm-charcoal">
          Paste links to profiles you&rsquo;re happy for other travellers to see. These show up on
          your Saathi profile — we don&rsquo;t verify them, we just help people feel they&rsquo;re
          meeting a real person.{' '}
          {filledSocialCount >= 2 ? (
            <span className="font-medium text-matcha-800">✓ {filledSocialCount} filled in.</span>
          ) : (
            <span className="text-pomegranate-600">
              {filledSocialCount === 0
                ? 'None filled in yet.'
                : `${2 - filledSocialCount} more to go.`}
            </span>
          )}
        </p>
        <div className="grid gap-3 md:grid-cols-2">
          {SOCIAL_FIELDS.map(({ key, label, placeholder, icon: Icon }) => (
            <div key={key} className="space-y-1.5">
              <Label htmlFor={key} className="flex items-center gap-1.5 text-xs">
                <Icon className="size-3.5 text-warm-charcoal" aria-hidden />
                {label}
              </Label>
              <Input
                id={key}
                type="url"
                value={socials[key]}
                onChange={(e) => setSocials((s) => ({ ...s, [key]: e.target.value }))}
                placeholder={placeholder}
                autoComplete="url"
                inputMode="url"
              />
            </div>
          ))}
        </div>
      </fieldset>

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
