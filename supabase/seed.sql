-- Seed data — skip in production. Run with `supabase db reset` locally.
-- These users exist only in the public.profiles table; auth.users inserts
-- require Supabase Auth which is not exercised by seed.sql. Treat these rows
-- as demo shells for local screenshots only.

insert into public.profiles (id, role, display_name, full_name, photo_url, languages, primary_language, bio)
values
  ('00000000-0000-0000-0000-000000000001', 'family', 'Priya R.', 'Priya Roy',
    'https://images.unsplash.com/photo-1544005313-94ddf0286df2?w=400',
    array['Bengali','Hindi','English'], 'Bengali',
    'Based in Amsterdam. Bringing Ma over for three months in December.'),
  ('00000000-0000-0000-0000-000000000002', 'companion', 'Arjun S.', 'Arjun Sen',
    'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=400',
    array['Bengali','Hindi','English'], 'Bengali',
    'Second-year at TU Delft. Fly CCU → AMS via DOH every winter break.'),
  ('00000000-0000-0000-0000-000000000003', 'companion', 'Mei L.', 'Mei Lin',
    'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=400',
    array['Mandarin','English','Cantonese'], 'Mandarin',
    'Product designer in Berlin. Fly PVG → FRA every spring.')
on conflict (id) do nothing;
