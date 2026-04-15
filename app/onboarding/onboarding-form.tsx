'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useUser } from '@clerk/nextjs';
import { parsePhoneNumberFromString } from 'libphonenumber-js';
import { Check, CheckCircle2, Facebook, Instagram, Linkedin, Lock, Twitter } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { LanguageMultiSelect } from '@/components/language-multi-select';
import { LANGUAGES } from '@/lib/languages';
import { cn } from '@/lib/utils';
import { saveOnboardingProfile } from './actions';

/**
 * Onboarding form — 3-step wizard.
 *
 *   Step 1: About you  → name + role
 *   Step 2: Languages + WhatsApp
 *   Step 3: Social profiles + (optional) bio
 *
 * Why steps: the single-page version was ~1100px tall and asked for eight
 * fields at once. Real users bounced. Each step now has ≤3 inputs and a
 * clear next action — the whole thing is still one form (one save), we
 * just pace the reveal.
 *
 * Design choices:
 *   * Validation messages are suppressed until the user has actually
 *     interacted with a field or attempted to move forward. No accusatory
 *     red text on first render.
 *   * Role selector is a compact two-option pill pair, not giant cards.
 *   * Social URL inputs have the platform prefix baked in as a
 *     non-editable pill; the user types only their handle. Accepts pasted
 *     full URLs too — handle-only or URL-only, we normalise.
 *   * Phone validation: libphonenumber-js client-side for format, server
 *     action runs Twilio Lookup for a real assigned-carrier check.
 *   * Save is one action at the end of step 3; the wizard never persists
 *     partials. Intentional — we don't want half-filled profiles showing
 *     up on the public feed.
 */

const SOCIAL_PLATFORMS = {
  linkedinUrl: {
    label: 'LinkedIn',
    icon: Linkedin,
    prefix: 'linkedin.com/in/',
    urlPatterns: [/^https?:\/\/(www\.)?linkedin\.com\/in\//i, /^https?:\/\/lnkd\.in\//i],
  },
  facebookUrl: {
    label: 'Facebook',
    icon: Facebook,
    prefix: 'facebook.com/',
    urlPatterns: [/^https?:\/\/(www\.)?facebook\.com\//i, /^https?:\/\/fb\.com\//i],
  },
  twitterUrl: {
    label: 'X / Twitter',
    icon: Twitter,
    prefix: 'x.com/',
    urlPatterns: [/^https?:\/\/(www\.)?x\.com\//i, /^https?:\/\/(www\.)?twitter\.com\//i],
  },
  instagramUrl: {
    label: 'Instagram',
    icon: Instagram,
    prefix: 'instagram.com/',
    urlPatterns: [/^https?:\/\/(www\.)?instagram\.com\//i],
  },
} as const;

type SocialKey = keyof typeof SOCIAL_PLATFORMS;

/**
 * Normalise a user-entered social value into a full https:// URL ready to
 * persist. Accepts:
 *   - bare handle:        "priya-r"           → "https://linkedin.com/in/priya-r"
 *   - handle with @:      "@priya-r"          → strip @, then as above
 *   - prefixed handle:    "in/priya-r"        → strip platform prefix, then as above
 *   - full URL:           "https://linkedin.com/in/priya-r" → passes through
 *   - URL without scheme: "linkedin.com/in/priya-r"         → prepend https://
 *   - empty:              ""                  → null
 */
function normaliseSocial(key: SocialKey, raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const platform = SOCIAL_PLATFORMS[key];

  // Already a full URL from a recognised domain — accept verbatim.
  if (platform.urlPatterns.some((r) => r.test(value))) {
    return value;
  }
  // URL-shaped but no scheme: https://example.com/foo
  if (/^[a-z0-9.-]+\.[a-z]{2,}\//i.test(value)) {
    return `https://${value}`;
  }
  // Otherwise treat it as a handle. Strip @ and any leading slash.
  const handle = value.replace(/^@/, '').replace(/^\/+/, '');
  return `https://${platform.prefix}${handle}`;
}

interface OnboardingFormProps {
  initialValues: {
    displayName: string;
    role: 'family' | 'companion' | null;
    languages: string[];
    whatsappNumber: string;
    whatsappValidatedAt: string | null;
    bio: string;
    linkedinUrl: string;
    facebookUrl: string;
    twitterUrl: string;
    instagramUrl: string;
  };
}

export function OnboardingForm({ initialValues }: OnboardingFormProps) {
  const router = useRouter();
  const { user } = useUser();
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [saved, setSaved] = useState(false);

  const [displayName, setDisplayName] = useState(initialValues.displayName);
  const [role, setRole] = useState<'family' | 'companion' | null>(initialValues.role);
  const [languages, setLanguages] = useState<string[]>(initialValues.languages);
  const [whatsappNumber, setWhatsappNumber] = useState(initialValues.whatsappNumber);
  // Track whether the current value of whatsappNumber has been OTP-verified
  // via Twilio. Initialised from the DB-stored validated-at timestamp — if
  // it's set AND the input still matches what was validated, we trust it.
  // Once the user edits the number we flip verifiedPhone back to null so
  // they're prompted to re-run the OTP.
  const [validatedPhone, setValidatedPhone] = useState<string | null>(
    initialValues.whatsappValidatedAt && initialValues.whatsappNumber
      ? initialValues.whatsappNumber
      : null,
  );
  const whatsappVerified = validatedPhone !== null && validatedPhone === whatsappNumber.trim();
  const [bio, setBio] = useState(initialValues.bio);
  const [socials, setSocials] = useState<Record<SocialKey, string>>({
    linkedinUrl: initialValues.linkedinUrl,
    facebookUrl: initialValues.facebookUrl,
    twitterUrl: initialValues.twitterUrl,
    instagramUrl: initialValues.instagramUrl,
  });
  const [error, setError] = useState<string | null>(null);
  const [phoneTouched, setPhoneTouched] = useState(!!initialValues.whatsappNumber);
  const [pending, start] = useTransition();

  const phoneState = useMemo(() => {
    const trimmed = whatsappNumber.trim();
    if (!trimmed) return { valid: false, message: null as string | null };
    const parsed = parsePhoneNumberFromString(trimmed);
    if (!parsed) {
      return { valid: false, message: 'Include the country code, starting with +.' };
    }
    if (!parsed.isValid()) {
      return { valid: false, message: "That doesn't look like a real phone number." };
    }
    return { valid: true, message: parsed.formatInternational() };
  }, [whatsappNumber]);

  const filledSocialCount = useMemo(
    () => Object.values(socials).filter((v) => v.trim().length > 0).length,
    [socials],
  );

  // Per-step validation. Called on Next click, never on render.
  // WhatsApp verification is a hard stop: the user must successfully
  // run the OTP flow before proceeding to step 3. Matching happens over
  // WhatsApp, so a number we can't prove reaches the user is useless.
  function validateStep(s: 1 | 2 | 3): string | null {
    if (s === 1) {
      if (!displayName.trim()) return 'Tell us what to call you.';
      if (!role) return 'Pick one — are you sending someone or helping?';
    } else if (s === 2) {
      if (languages.length < 1) return 'Pick at least one language.';
      if (!phoneState.valid) return phoneState.message ?? 'Enter a valid WhatsApp number.';
      if (!whatsappVerified) {
        return 'Please verify your phone number before continuing.';
      }
    } else if (s === 3) {
      if (filledSocialCount < 2) return 'Share at least two social profile links.';
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setError(err);
      return;
    }
    setError(null);
    setStep((step + 1) as 1 | 2 | 3);
  }

  function goBack() {
    setError(null);
    setStep((step - 1) as 1 | 2 | 3);
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const err = validateStep(3) ?? validateStep(2) ?? validateStep(1);
    if (err) {
      setError(err);
      return;
    }
    setError(null);

    start(async () => {
      const res = await saveOnboardingProfile({
        displayName: displayName.trim(),
        role: role!,
        primaryLanguage: languages[0]!,
        languages,
        whatsappNumber: whatsappNumber.trim(),
        bio: bio.trim() || null,
        linkedinUrl: normaliseSocial('linkedinUrl', socials.linkedinUrl),
        facebookUrl: normaliseSocial('facebookUrl', socials.facebookUrl),
        twitterUrl: normaliseSocial('twitterUrl', socials.twitterUrl),
        instagramUrl: normaliseSocial('instagramUrl', socials.instagramUrl),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(true);
      // Small pause so the success state registers, then hand off to the
      // dashboard (which shows its own welcome banner on first arrival).
      setTimeout(() => {
        router.push('/dashboard?welcome=1');
        router.refresh();
      }, 1100);
    });
  }

  // Success state — swap the whole form for a confirmation card before the
  // redirect fires. Otherwise the user's click on "Save" appears to do
  // nothing until the dashboard loads.
  if (saved) {
    return (
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-matcha-300/60 bg-matcha-300/20 p-10 text-center">
        <div className="flex size-14 items-center justify-center rounded-full bg-matcha-600 text-background">
          <CheckCircle2 className="size-8" aria-hidden />
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-2xl font-semibold">Profile saved.</h2>
          <p className="text-sm text-warm-charcoal">Taking you to your dashboard…</p>
        </div>
      </div>
    );
  }

  const emailAddress =
    user?.primaryEmailAddress?.emailAddress ?? user?.emailAddresses[0]?.emailAddress ?? '';
  const avatarUrl = user?.imageUrl;
  const firstName = user?.firstName;

  return (
    <form
      onSubmit={submit}
      className="space-y-0 overflow-hidden rounded-2xl border border-oat bg-white"
    >
      {/* Signed-in-as strip */}
      <div className="flex items-center gap-3 border-b border-oat bg-oat-light/40 px-5 py-3 md:px-6">
        <Avatar className="size-8">
          {avatarUrl ? <AvatarImage src={avatarUrl} alt="" /> : null}
          <AvatarFallback className="text-xs">{(firstName ?? 'U').slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1 text-sm">
          <div className="truncate font-medium text-foreground">
            {firstName ? `Signed in as ${firstName}` : 'Signed in'}
          </div>
          {emailAddress ? (
            <div className="truncate text-xs text-warm-silver">{emailAddress}</div>
          ) : null}
        </div>
      </div>

      {/* Step indicator */}
      <div className="flex items-center justify-between border-b border-oat px-6 py-4">
        <div className="flex items-center gap-2">
          {[1, 2, 3].map((n) => {
            const s = n as 1 | 2 | 3;
            const done = s < step;
            const current = s === step;
            return (
              <div key={n} className="flex items-center gap-2">
                <div
                  className={cn(
                    'flex size-6 items-center justify-center rounded-full text-[11px] font-semibold',
                    done
                      ? 'bg-matcha-600 text-background'
                      : current
                        ? 'bg-foreground text-background'
                        : 'bg-oat text-warm-charcoal',
                  )}
                >
                  {done ? <Check className="size-3" /> : n}
                </div>
                {n < 3 ? (
                  <div className={cn('h-px w-6 md:w-10', s < step ? 'bg-matcha-600' : 'bg-oat')} />
                ) : null}
              </div>
            );
          })}
        </div>
        <span className="text-xs font-medium text-warm-silver">Step {step} of 3</span>
      </div>

      {/* Step content */}
      <div className="space-y-5 p-6 md:p-8">
        {step === 1 ? (
          <Step1
            displayName={displayName}
            setDisplayName={setDisplayName}
            role={role}
            setRole={setRole}
          />
        ) : step === 2 ? (
          <Step2
            role={role}
            languages={languages}
            setLanguages={setLanguages}
            whatsappNumber={whatsappNumber}
            setWhatsappNumber={(v) => {
              setWhatsappNumber(v);
              // Editing the number invalidates any previous OTP — the
              // validatedPhone state handles this via equality check, but
              // we surface it to the user by forcing them to re-run the
              // flow if they want the "verified" badge back.
            }}
            phoneState={phoneState}
            phoneTouched={phoneTouched}
            setPhoneTouched={setPhoneTouched}
            whatsappVerified={whatsappVerified}
            onVerified={() => setValidatedPhone(whatsappNumber.trim())}
          />
        ) : (
          <Step3
            socials={socials}
            setSocials={setSocials}
            bio={bio}
            setBio={setBio}
            role={role}
            filledSocialCount={filledSocialCount}
          />
        )}

        {error ? (
          <div className="rounded-md border border-pomegranate-400/40 bg-pomegranate-400/10 p-3 text-sm text-foreground">
            {error}
          </div>
        ) : null}
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between gap-3 border-t border-oat bg-oat-light/40 px-5 py-4 md:px-6">
        {step > 1 ? (
          <Button type="button" variant="ghost" onClick={goBack} disabled={pending}>
            ← Back
          </Button>
        ) : (
          <span className="text-xs text-warm-silver">
            You can edit everything later from your dashboard.
          </span>
        )}
        {step < 3 ? (
          <Button type="button" onClick={goNext} className="rounded-full px-6">
            Next →
          </Button>
        ) : (
          <Button type="submit" disabled={pending} className="rounded-full px-6">
            {pending ? 'Saving…' : 'Save and continue'}
          </Button>
        )}
      </div>
    </form>
  );
}

// -----------------------------------------------------------------------------
// Step 1 — name + role
// -----------------------------------------------------------------------------
function Step1({
  displayName,
  setDisplayName,
  role,
  setRole,
}: {
  displayName: string;
  setDisplayName: (v: string) => void;
  role: 'family' | 'companion' | null;
  setRole: (r: 'family' | 'companion') => void;
}) {
  return (
    <>
      <div className="space-y-2">
        <Label htmlFor="displayName">What should we call you?</Label>
        <Input
          id="displayName"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          placeholder="First name + initial — Priya R."
          autoComplete="name"
          maxLength={60}
        />
      </div>

      <fieldset className="space-y-2">
        <legend className="text-sm font-medium text-foreground">Which side of the trip?</legend>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setRole('family')}
            className={cn(
              'flex flex-col items-start rounded-lg border p-3 text-left text-sm transition-colors',
              role === 'family'
                ? 'border-marigold-600 bg-marigold-50 ring-1 ring-marigold-600'
                : 'border-oat bg-white hover:bg-oat-light',
            )}
          >
            <span className="font-medium">Sending a loved one</span>
            <span className="text-xs text-warm-charcoal">
              On behalf of a parent, spouse, sibling, or friend
            </span>
          </button>
          <button
            type="button"
            onClick={() => setRole('companion')}
            className={cn(
              'flex flex-col items-start rounded-lg border p-3 text-left text-sm transition-colors',
              role === 'companion'
                ? 'border-marigold-600 bg-marigold-50 ring-1 ring-marigold-600'
                : 'border-oat bg-white hover:bg-oat-light',
            )}
          >
            <span className="font-medium">Happy to help</span>
            <span className="text-xs text-warm-charcoal">
              Flying routes regularly, open to pairing
            </span>
          </button>
        </div>
      </fieldset>
    </>
  );
}

// -----------------------------------------------------------------------------
// Step 2 — languages + WhatsApp
// -----------------------------------------------------------------------------
function Step2({
  role,
  languages,
  setLanguages,
  whatsappNumber,
  setWhatsappNumber,
  phoneState,
  phoneTouched,
  setPhoneTouched,
  whatsappVerified,
  onVerified,
}: {
  role: 'family' | 'companion' | null;
  languages: string[];
  setLanguages: (next: string[]) => void;
  whatsappNumber: string;
  setWhatsappNumber: (v: string) => void;
  phoneState: { valid: boolean; message: string | null };
  phoneTouched: boolean;
  setPhoneTouched: (b: boolean) => void;
  whatsappVerified: boolean;
  onVerified: () => void;
}) {
  const langLabel = role === 'family' ? "Your loved one's languages" : 'Languages you can help in';

  return (
    <>
      <div className="space-y-2">
        <Label>{langLabel}</Label>
        <LanguageMultiSelect
          options={LANGUAGES}
          selected={languages}
          onChange={setLanguages}
          markFirstAsPrimary
          placeholder="Pick one or more…"
        />
        <p className="text-xs text-warm-silver">
          Pick the strongest first — that&rsquo;s what we match on.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="whatsappNumber">WhatsApp number</Label>
        <Input
          id="whatsappNumber"
          type="tel"
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          onBlur={() => setPhoneTouched(true)}
          placeholder="+919876543210"
          autoComplete="tel"
          aria-invalid={phoneTouched && whatsappNumber.length > 0 && !phoneState.valid}
        />
        {whatsappNumber.length > 0 && phoneState.valid ? (
          <p className="text-xs text-matcha-800">
            ✓ Reads as <b>{phoneState.message}</b>
          </p>
        ) : phoneTouched && whatsappNumber.length > 0 && phoneState.message ? (
          <p className="text-xs text-pomegranate-600">{phoneState.message}</p>
        ) : (
          <p className="text-xs text-warm-silver">Include the country code, starting with +.</p>
        )}

        {/* OTP verification — live Twilio Verify round-trip. Shown only
            when the phone format is valid. Ownership-proof signal on top
            of the Lookup API's "is a real number" check. */}
        {phoneState.valid ? (
          <WhatsAppOtpVerify
            phone={whatsappNumber.trim()}
            verified={whatsappVerified}
            onVerified={onVerified}
          />
        ) : null}

        <p className="flex items-start gap-1.5 text-xs text-warm-silver">
          <Lock className="mt-0.5 size-3 shrink-0" aria-hidden />
          Private. Only shared with your match after they accept.
        </p>
      </div>
    </>
  );
}

// -----------------------------------------------------------------------------
// Step 3 — social URLs + bio
// -----------------------------------------------------------------------------
function Step3({
  socials,
  setSocials,
  bio,
  setBio,
  role,
  filledSocialCount,
}: {
  socials: Record<SocialKey, string>;
  setSocials: React.Dispatch<React.SetStateAction<Record<SocialKey, string>>>;
  bio: string;
  setBio: (v: string) => void;
  role: 'family' | 'companion' | null;
  filledSocialCount: number;
}) {
  return (
    <>
      <div className="space-y-3">
        <div>
          <Label className="text-sm">Where else can we find you?</Label>
          <p className="mt-1 text-xs text-warm-charcoal">
            At least two — these show up on your public Saathi profile so people feel they&rsquo;re
            meeting a real person. Paste a handle or a full URL.
          </p>
        </div>

        <div className="grid gap-2 md:grid-cols-2">
          {(Object.keys(SOCIAL_PLATFORMS) as SocialKey[]).map((key) => {
            const { label, icon: Icon, prefix } = SOCIAL_PLATFORMS[key];
            return (
              <div key={key} className="space-y-1">
                <Label
                  htmlFor={key}
                  className="flex items-center gap-1.5 text-xs text-warm-charcoal"
                >
                  <Icon className="size-3.5" aria-hidden />
                  {label}
                </Label>
                <div className="flex items-stretch overflow-hidden rounded-md border border-oat bg-white focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
                  <span className="flex items-center bg-oat-light px-2.5 text-xs text-warm-charcoal">
                    {prefix}
                  </span>
                  <input
                    id={key}
                    type="text"
                    value={socials[key]}
                    onChange={(e) => setSocials((s) => ({ ...s, [key]: e.target.value }))}
                    placeholder="your-handle"
                    autoComplete="off"
                    className="min-w-0 flex-1 bg-transparent px-2 py-2 text-sm outline-none placeholder:text-warm-silver"
                  />
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-xs text-warm-silver">
          {filledSocialCount >= 2 ? (
            <span className="text-matcha-800">
              ✓ {filledSocialCount} of 4 filled in — you&rsquo;re good.
            </span>
          ) : (
            <span>{filledSocialCount} of 2 required so far.</span>
          )}
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bio" className="text-sm">
          A line about yourself <span className="text-warm-silver">(optional)</span>
        </Label>
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
    </>
  );
}

// -----------------------------------------------------------------------------
// Phone OTP verification — WhatsApp primary, SMS fallback
// -----------------------------------------------------------------------------
/**
 * Inline widget supporting two delivery channels:
 *   idle     → "Verify via WhatsApp" + "Verify via SMS" options
 *   sent     → code input, channel label, resend + switch-channel links
 *   verified → green badge, "Re-verify" option
 *
 * Both channels share the same OTP hash columns on the profile row, so only
 * one pending code exists at a time. On success the server stamps
 * whatsapp_validated_at regardless of which channel delivered the code.
 */
function WhatsAppOtpVerify({
  phone,
  verified,
  onVerified,
}: {
  phone: string;
  verified: boolean;
  onVerified: () => void;
}) {
  const [channel, setChannel] = useState<'whatsapp' | 'sms'>('whatsapp');
  const [phase, setPhase] = useState<'idle' | 'sent' | 'checking'>('idle');
  const [code, setCode] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();

  if (verified) {
    return (
      <div className="flex items-center justify-between rounded-md border border-matcha-300/60 bg-matcha-300/20 px-3 py-2 text-xs text-matcha-800">
        <span className="flex items-center gap-1.5">
          <CheckCircle2 className="size-3.5" aria-hidden />
          Phone verified.
        </span>
        <button
          type="button"
          onClick={() => setPhase('idle')}
          className="underline-offset-4 hover:underline"
        >
          Re-verify
        </button>
      </div>
    );
  }

  async function sendCode(ch: 'whatsapp' | 'sms') {
    setMessage(null);
    setChannel(ch);
    const url = ch === 'whatsapp' ? '/api/verify/whatsapp/start' : '/api/verify/sms/start';
    start(async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phone }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (!res.ok || !json.ok) {
          setMessage(json.error ?? `Couldn't send (${res.status}).`);
          return;
        }
        setPhase('sent');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Couldn't send.");
      }
    });
  }

  async function checkCode() {
    setMessage(null);
    setPhase('checking');
    const url = channel === 'whatsapp' ? '/api/verify/whatsapp/check' : '/api/verify/sms/check';
    start(async () => {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ phone, code }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
        if (res.ok && json.ok) {
          onVerified();
          setPhase('idle');
          setCode('');
          return;
        }
        setMessage(json.error ?? 'That code didn\u2019t match.');
        setPhase('sent');
      } catch (err) {
        setMessage(err instanceof Error ? err.message : 'Check failed.');
        setPhase('sent');
      }
    });
  }

  if (phase === 'idle') {
    return (
      <div className="space-y-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => sendCode('whatsapp')}
          disabled={pending || !phone}
          className="w-full"
        >
          {pending && channel === 'whatsapp' ? 'Sending…' : 'Verify via WhatsApp'}
        </Button>
        <div className="flex items-center gap-2">
          <div className="h-px flex-1 bg-oat" />
          <span className="text-xs text-warm-silver">or</span>
          <div className="h-px flex-1 bg-oat" />
        </div>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => sendCode('sms')}
          disabled={pending || !phone}
          className="w-full text-warm-charcoal"
        >
          {pending && channel === 'sms' ? 'Sending…' : 'Verify via SMS'}
        </Button>
        {message ? <p className="text-xs text-pomegranate-600">{message}</p> : null}
        <p className="text-xs text-warm-silver">
          We&rsquo;ll send a 6-digit code. Takes a few seconds.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 rounded-md border border-oat bg-oat-light/40 p-3">
      <p className="text-xs text-warm-charcoal">
        Code sent to <b>{phone}</b> via {channel === 'whatsapp' ? 'WhatsApp' : 'SMS'}.{' '}
        {channel === 'whatsapp'
          ? 'Open WhatsApp and paste the 6-digit code here.'
          : 'Check your messages for the code.'}
      </p>
      <div className="flex gap-2">
        <Input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={10}
          placeholder="123456"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          autoFocus
          className="font-mono tracking-widest"
        />
        <Button type="button" size="sm" onClick={checkCode} disabled={pending || code.length < 4}>
          {pending && phase === 'checking' ? 'Checking…' : 'Check'}
        </Button>
      </div>
      {message ? <p className="text-xs text-pomegranate-600">{message}</p> : null}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <button
          type="button"
          onClick={() => sendCode(channel)}
          disabled={pending}
          className="text-xs text-marigold-700 underline-offset-4 hover:underline disabled:opacity-50"
        >
          Resend code
        </button>
        {channel === 'whatsapp' && (
          <button
            type="button"
            onClick={() => {
              setCode('');
              setMessage(null);
              sendCode('sms');
            }}
            disabled={pending}
            className="text-xs text-warm-charcoal underline-offset-4 hover:underline disabled:opacity-50"
          >
            Try SMS instead
          </button>
        )}
        <button
          type="button"
          onClick={() => {
            setPhase('idle');
            setCode('');
            setMessage(null);
          }}
          className="ml-auto text-xs text-warm-silver underline-offset-4 hover:underline"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
