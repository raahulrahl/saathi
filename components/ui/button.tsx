import * as React from 'react';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

/**
 * Button — Clay-styled. The default variant is a solid black "primary" button
 * with the signature playful hover (rotateZ + hard offset shadow). Swatch
 * variants use the named colors: matcha (action/go), ube (secondary), lemon
 * (warning-free emphasis), pomegranate (destructive).
 *
 * The .clay-hover class carries the micro-animation (defined in globals.css).
 */
const buttonVariants = cva(
  [
    'clay-hover',
    'inline-flex items-center justify-center gap-2 whitespace-nowrap',
    'font-medium tracking-tight',
    'ring-offset-background transition-colors',
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
    'disabled:pointer-events-none disabled:opacity-50',
    'select-none',
  ].join(' '),
  {
    variants: {
      variant: {
        default: 'rounded-full bg-foreground text-background hover:bg-foreground/95',
        matcha: 'rounded-full bg-matcha-600 text-white hover:bg-matcha-800',
        ube: 'rounded-full bg-ube-800 text-white hover:bg-ube-900',
        lemon: 'rounded-full bg-lemon-500 text-foreground hover:bg-lemon-700 hover:text-white',
        pomegranate:
          'rounded-full bg-pomegranate-400 text-foreground hover:bg-pomegranate-600 hover:text-white',
        white: 'rounded-full bg-white text-foreground border border-oat hover:bg-oat-light',
        outline: 'rounded-full border border-oat bg-transparent text-foreground hover:bg-oat-light',
        ghost:
          'rounded-full bg-transparent text-foreground hover:bg-oat-light hover:text-foreground',
        link: 'rounded-none text-foreground underline-offset-4 hover:underline clay-hover:transform-none',
        destructive:
          'rounded-full bg-pomegranate-600 text-white hover:bg-pomegranate-400 hover:text-foreground',
      },
      size: {
        default: 'h-11 px-5 text-sm',
        sm: 'h-9 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        xl: 'h-14 px-8 text-base',
        icon: 'size-11',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
    );
  },
);
Button.displayName = 'Button';

export { Button, buttonVariants };
