import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { cookies } from 'next/headers';

interface CookieChange {
  name: string;
  value: string;
  options: CookieOptions;
}

// Note: we intentionally do NOT pass a typed `Database` generic to
// `createServerClient`. The hand-authored `types/db.ts` stub exists to make
// application-level shapes explicit, but the Supabase SDK's generated-type
// format changes between minor versions and forces brittle `__InternalSupabase`
// shapes. Once `pnpm db:types` is wired up against a real project, flip
// these back to `createServerClient<Database>(...)`.

/** Server-side Supabase client bound to the current request's cookies. */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: CookieChange[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }: CookieChange) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Called from a Server Component — ignore; middleware refreshes.
          }
        },
      },
    },
  );
}

/** Elevated-privilege server client. NEVER import from code that runs in a browser. */
export function createSupabaseServiceClient() {
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  }
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '', serviceKey, {
    cookies: {
      getAll() {
        return [];
      },
      setAll() {
        // no-op — service role never writes cookies
      },
    },
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}
