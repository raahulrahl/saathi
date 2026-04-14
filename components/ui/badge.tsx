import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Badge — Clay-style pill with swatch-color variants. Use the named swatch
 * variants (matcha/slushie/ube/lemon/pomegranate) for domain-specific
 * status, not just Tailwind colors, so the design system stays consistent.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-tight transition-colors',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-foreground text-background',
        secondary: 'border-transparent bg-oat-light text-foreground',
        outline: 'border-oat bg-transparent text-foreground',
        muted: 'border-transparent bg-oat-light text-warm-charcoal',
        matcha: 'border-transparent bg-matcha-300 text-matcha-800',
        slushie: 'border-transparent bg-slushie-500/40 text-slushie-800',
        lemon: 'border-transparent bg-lemon-400 text-lemon-800',
        ube: 'border-transparent bg-ube-300 text-ube-900',
        pomegranate: 'border-transparent bg-pomegranate-400/80 text-foreground',
        success: 'border-transparent bg-matcha-300 text-matcha-800',
        destructive: 'border-transparent bg-pomegranate-400 text-foreground',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>, VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
