import type { Config } from 'tailwindcss';
import animatePlugin from 'tailwindcss-animate';

/**
 * Clay-inspired design system. See the design brief for the full spec.
 * Identity: warm cream canvas + named swatch palette (Matcha, Slushie, Lemon,
 * Ube, Pomegranate, Blueberry, Dragonfruit) + playful hover (rotateZ -8deg +
 * hard offset shadow) + three-layer clay shadow + generous radii.
 */
const config: Config = {
  darkMode: ['class'],
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
  theme: {
    container: {
      center: true,
      padding: '1rem',
      screens: {
        '2xl': '1200px',
      },
    },
    extend: {
      colors: {
        // --- Clay-style semantic tokens ---
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
        popover: {
          DEFAULT: 'hsl(var(--popover))',
          foreground: 'hsl(var(--popover-foreground))',
        },
        card: {
          DEFAULT: 'hsl(var(--card))',
          foreground: 'hsl(var(--card-foreground))',
        },

        // --- Clay swatch palette ---
        cream: '#faf9f7', // page canvas
        oat: {
          DEFAULT: '#dad4c8', // primary warm border
          light: '#eee9df', // softer border
          dark: '#c4bca9',
        },
        matcha: {
          300: '#84e7a5',
          600: '#078a52',
          800: '#02492a',
        },
        slushie: {
          500: '#3bd3fd',
          800: '#0089ad',
        },
        lemon: {
          400: '#f8cc65',
          500: '#fbbd41',
          700: '#d08a11',
          800: '#9d6a09',
        },
        ube: {
          300: '#c1b0ff',
          800: '#43089f',
          900: '#32037d',
        },
        pomegranate: {
          400: '#fc7981',
          600: '#e5343e',
        },
        blueberry: {
          800: '#01418d',
        },
        dragonfruit: {
          500: '#e84aa4',
        },

        // --- Warm neutrals ---
        'warm-silver': '#9f9b93',
        'warm-charcoal': '#55534e',
      },
      borderRadius: {
        none: '0',
        sm: '4px',
        DEFAULT: '8px',
        md: '8px',
        lg: '12px',
        xl: '12px',
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
        '5xl': '40px',
        pill: '1584px',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'Geist', 'system-ui', 'sans-serif'],
        mono: ['var(--font-mono)', 'Space Mono', 'ui-monospace', 'monospace'],
        display: ['var(--font-sans)', 'Geist', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Clay type scale overrides — see design system §3.
        'display-hero': ['5rem', { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '600' }],
        'display-secondary': [
          '3.75rem',
          { lineHeight: '1', letterSpacing: '-0.04em', fontWeight: '600' },
        ],
        'section-heading': [
          '2.75rem',
          { lineHeight: '1.1', letterSpacing: '-0.03em', fontWeight: '600' },
        ],
        'card-heading': [
          '2rem',
          { lineHeight: '1.1', letterSpacing: '-0.02em', fontWeight: '600' },
        ],
        'feature-title': [
          '1.25rem',
          { lineHeight: '1.4', letterSpacing: '-0.02em', fontWeight: '600' },
        ],
        label: ['0.75rem', { lineHeight: '1.2', letterSpacing: '0.09em', fontWeight: '600' }],
      },
      boxShadow: {
        // Clay's signature three-layer shadow: downward cast + inset highlight + edge.
        clay: 'rgba(0,0,0,0.1) 0px 1px 1px, rgba(0,0,0,0.04) 0px -1px 1px inset, rgba(0,0,0,0.05) 0px -0.5px 1px',
        // Playful retro-graphic hover shadow — hard offset, no blur.
        'hard-offset': 'rgb(0,0,0) -7px 7px 0 0',
        'hard-offset-sm': 'rgb(0,0,0) -4px 4px 0 0',
      },
      transitionTimingFunction: {
        playful: 'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
      keyframes: {
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [animatePlugin],
};

export default config;
