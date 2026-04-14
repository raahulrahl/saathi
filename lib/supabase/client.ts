'use client';

import { createBrowserClient } from '@supabase/ssr';

/** Browser-side Supabase client — lazy-initialized singleton per tab. */
let browserClient: ReturnType<typeof createBrowserClient> | undefined;

export function createSupabaseBrowserClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '',
  );
  return browserClient;
}
