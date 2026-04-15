'use client';

import { useMemo, useState } from 'react';
import { Check, ChevronsUpDown, Search, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface LanguageMultiSelectProps {
  options: readonly string[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  className?: string;
  id?: string;
  /**
   * When true, the first selected language is visually marked as the
   * "Primary" one (matcha badge on its chip). This lets a single
   * multi-select capture both the primary and additional languages in
   * one UI, with the primary being whatever the user selected first.
   * Used on onboarding; off by default for the post wizard where the
   * trip's languages don't have a hierarchy.
   */
  markFirstAsPrimary?: boolean;
}

/**
 * Multi-select dropdown with inline search. Used everywhere the app asks
 * for a list of languages — onboarding profile, post wizard, etc. —
 * paired with the shared LANGUAGES list from `lib/languages.ts` so the
 * option set stays identical across screens.
 *
 * Design: trigger button shows either a placeholder or the count of
 * selected items, plus chips underneath for what's currently picked so
 * the user never has to open the popover to see their selection.
 */
export function LanguageMultiSelect({
  options,
  selected,
  onChange,
  placeholder = 'Select languages…',
  className,
  id,
  markFirstAsPrimary = false,
}: LanguageMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.toLowerCase().includes(q));
  }, [options, query]);

  function toggle(l: string) {
    if (selected.includes(l)) onChange(selected.filter((x) => x !== l));
    else onChange([...selected, l]);
  }

  function remove(l: string) {
    onChange(selected.filter((x) => x !== l));
  }

  return (
    <div className={cn('space-y-2', className)}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            id={id}
            type="button"
            variant="outline"
            role="combobox"
            aria-expanded={open}
            className="w-full justify-between font-normal"
          >
            {selected.length > 0
              ? `${selected.length} language${selected.length === 1 ? '' : 's'} selected`
              : placeholder}
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(340px,calc(100vw-2rem))] p-0">
          <div className="border-b p-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search languages…"
                className="h-8 pl-8"
              />
            </div>
          </div>
          <ul className="max-h-64 overflow-auto p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-2 text-sm text-muted-foreground">No match.</li>
            ) : (
              filtered.map((l) => {
                const isSelected = selected.includes(l);
                return (
                  <li key={l}>
                    <button
                      type="button"
                      onClick={() => toggle(l)}
                      className={cn(
                        'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent',
                        isSelected && 'bg-accent/50',
                      )}
                    >
                      <Checkbox
                        checked={isSelected}
                        onCheckedChange={() => toggle(l)}
                        className="pointer-events-none"
                      />
                      <span className="flex-1">{l}</span>
                      {isSelected ? <Check className="text-saffron-600 size-3.5" /> : null}
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </PopoverContent>
      </Popover>

      {selected.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selected.map((l, i) => {
            const isPrimary = markFirstAsPrimary && i === 0;
            return (
              <Badge
                key={l}
                variant={isPrimary ? 'matcha' : 'secondary'}
                className="gap-1 rounded-full py-1 pl-2.5 pr-1 font-normal"
              >
                {l}
                {isPrimary ? (
                  <span className="text-[10px] uppercase tracking-wider opacity-80">· Primary</span>
                ) : null}
                <button
                  type="button"
                  onClick={() => remove(l)}
                  aria-label={`Remove ${l}`}
                  className="rounded-full p-0.5 text-muted-foreground hover:bg-background hover:text-foreground"
                >
                  <X className="size-3" />
                </button>
              </Badge>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
