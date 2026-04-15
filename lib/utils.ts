/**
 * Tailwind-friendly className concatenator. The two-step clsx-then-
 * tailwind-merge pattern is the shadcn/ui idiom:
 *
 *   - clsx accepts any mix of strings, conditionals, arrays, and
 *     objects and produces a single space-separated string.
 *   - twMerge dedupes Tailwind classes with the same key (so
 *     `cn('p-2', condition && 'p-4')` ends up as just `'p-4'` rather
 *     than both classes fighting).
 *
 * Used everywhere in the components/ tree; keep it trivial.
 */

import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge Tailwind class inputs into a deduped, space-separated string.
 * Accepts the full clsx input shape: strings, falsy values, arrays,
 * and conditional objects.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
