import * as React from 'react';
import { cn } from '@/lib/utils';

const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, type, ...props }, ref) => (
    <input
      type={type}
      ref={ref}
      className={cn(
        // Clay inputs — warm oat border, generous height, black text.
        'flex h-11 w-full rounded-lg border border-oat bg-white px-3 py-2 text-sm text-foreground ring-offset-background',
        'placeholder:text-warm-silver',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2',
        'disabled:cursor-not-allowed disabled:opacity-50',
        'file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground',
        className,
      )}
      {...props}
    />
  ),
);
Input.displayName = 'Input';

export { Input };
