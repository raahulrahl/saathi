import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Alert — Clay swatch surfaces for different messages. Default is the
 * oat-bordered neutral card; `warm` uses Matcha 300 for positive
 * confirmation; `destructive` uses Pomegranate 400.
 */
const alertVariants = cva(
  'relative w-full rounded-2xl border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7',
  {
    variants: {
      variant: {
        default: 'border-oat bg-card text-foreground',
        destructive:
          'border-transparent bg-pomegranate-400/30 text-foreground [&>svg]:text-pomegranate-600',
        warm: 'border-transparent bg-matcha-300/60 text-matcha-800 [&>svg]:text-matcha-800',
        lemon: 'border-transparent bg-lemon-400/50 text-lemon-800 [&>svg]:text-lemon-800',
        slushie: 'border-transparent bg-slushie-500/30 text-slushie-800 [&>svg]:text-slushie-800',
      },
    },
    defaultVariants: { variant: 'default' },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div ref={ref} role="alert" className={cn(alertVariants({ variant }), className)} {...props} />
));
Alert.displayName = 'Alert';

const AlertTitle = React.forwardRef<HTMLParagraphElement, React.HTMLAttributes<HTMLHeadingElement>>(
  ({ className, ...props }, ref) => (
    <h5
      ref={ref}
      className={cn('mb-1 font-semibold leading-none tracking-tight', className)}
      {...props}
    />
  ),
);
AlertTitle.displayName = 'AlertTitle';

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn('text-sm [&_p]:leading-relaxed', className)} {...props} />
));
AlertDescription.displayName = 'AlertDescription';

export { Alert, AlertTitle, AlertDescription };
