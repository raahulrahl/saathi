import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

interface LanguageChipProps {
  language: string;
  matched?: boolean;
  primary?: boolean;
  className?: string;
}

/**
 * Language pill. Matched languages render in the Matcha swatch (strong
 * cultural choice — "match on language" becomes visually the same motion
 * as "go"). Primary language gets a Lemon ring to indicate mother tongue.
 */
export function LanguageChip({
  language,
  matched = false,
  primary = false,
  className,
}: LanguageChipProps) {
  return (
    <Badge
      variant={matched ? 'matcha' : 'outline'}
      className={cn(
        'font-normal',
        matched && 'font-semibold',
        primary && matched && 'ring-2 ring-lemon-500 ring-offset-1 ring-offset-background',
        className,
      )}
    >
      {language}
      {primary && (
        <span className="ml-1 text-[10px] uppercase tracking-wide opacity-70">primary</span>
      )}
    </Badge>
  );
}

export function LanguageChipRow({
  languages,
  primary,
  viewerLanguages = [],
}: {
  languages: string[];
  primary?: string | null;
  viewerLanguages?: string[];
}) {
  const vset = new Set(viewerLanguages.map((l) => l.toLowerCase()));
  return (
    <div className="flex flex-wrap gap-1.5">
      {languages.map((l) => (
        <LanguageChip
          key={l}
          language={l}
          matched={vset.has(l.toLowerCase())}
          primary={!!primary && primary.toLowerCase() === l.toLowerCase()}
        />
      ))}
    </div>
  );
}
