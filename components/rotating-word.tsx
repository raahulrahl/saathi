'use client';

import { useEffect, useState } from 'react';
import { cn } from '@/lib/utils';

/**
 * Animated word rotator — cycles through a list of words with a
 * fade-up / fade-down transition. Used on the landing hero to
 * rotate "Ma's" → "father's" → "wife's" → "loved one's".
 */

interface RotatingWordProps {
  words: readonly string[];
  /** Milliseconds between transitions. Default 2500. */
  interval?: number | undefined;
  className?: string | undefined;
}

export function RotatingWord({ words, interval = 2500, className }: RotatingWordProps) {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      // Fade out → swap word → fade in
      setVisible(false);
      setTimeout(() => {
        setIndex((prev) => (prev + 1) % words.length);
        setVisible(true);
      }, 300); // matches the CSS transition duration
    }, interval);

    return () => clearInterval(id);
  }, [words.length, interval]);

  return (
    <span
      className={cn(
        'inline-block transition-all duration-300',
        visible ? 'translate-y-0 opacity-100' : 'translate-y-2 opacity-0',
        className,
      )}
    >
      {words[index]}
    </span>
  );
}
