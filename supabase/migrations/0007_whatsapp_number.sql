-- 0007_whatsapp_number.sql
-- Add whatsapp_number to public.profiles.
--
-- Context: the original onboarding flow used Twilio Verify to confirm
-- WhatsApp numbers via an OTP, storing them in the `verifications.handle`
-- column. That flow was too much friction for pre-launch — users dropped
-- off at the OTP step.
--
-- New flow: onboarding asks for the WhatsApp number as a plain field (no
-- OTP). Matching communications happen over WhatsApp later, so the number
-- needs a first-class home on the profile rather than living inside the
-- verifications table keyed on a channel.
--
-- Migration is non-destructive: adds a nullable column. Existing profiles
-- (there shouldn't be real ones yet pre-launch) keep working. When OTP
-- verification comes back later, we can add a companion `whatsapp_verified_at`
-- column — the plain-field number is still the source of truth.

alter table public.profiles
  add column if not exists whatsapp_number text;

-- Light sanity check: E.164 format (+[country][number], 8-15 digits).
-- Enforcing at the DB so malformed numbers can't land via the service
-- role client sneaking past server validation.
alter table public.profiles
  drop constraint if exists whatsapp_e164;

alter table public.profiles
  add constraint whatsapp_e164 check (
    whatsapp_number is null
    or whatsapp_number ~ '^\+[1-9][0-9]{7,14}$'
  );

-- No index for now — we look up profiles by Clerk id, not by WhatsApp
-- number. If we later need reverse lookup (e.g. inbound webhook from
-- Twilio matching to a user) we can add a partial unique index then.

-- Widen the verifications.channel enum to include 'facebook'.
-- The Clerk webhook + self-heal now mirror Facebook OAuth identities
-- alongside LinkedIn / X / Google / WhatsApp. The original 0005 enum
-- allowed linkedin, twitter, email, whatsapp, google, github — but not
-- facebook, so inserts would hard-fail the check constraint.
alter table public.verifications
  drop constraint if exists verifications_channel_check;

alter table public.verifications
  add constraint verifications_channel_check check (
    channel in ('linkedin', 'twitter', 'email', 'whatsapp', 'google', 'facebook', 'github')
  );
