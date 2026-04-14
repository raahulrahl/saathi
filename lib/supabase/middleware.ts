import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

interface CookieChange {
  name: string;
  value: string;
  options: CookieOptions;
}

/**
 * Refreshes the Supabase session cookie on every request. Called from the
 * root middleware so Server Components see an up-to-date auth state.
 */
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: CookieChange[]) {
          cookiesToSet.forEach(({ name, value }: CookieChange) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }: CookieChange) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: do not put any logic between createServerClient and this call;
  // it's what refreshes the session.
  await supabase.auth.getUser();

  return response;
}
