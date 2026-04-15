/**
 * Shared language and help-category vocabulary.
 *
 * LANGUAGES is the single source of truth for "languages you speak"
 * anywhere in the app — onboarding form, post wizard, search filters.
 * Curated, not exhaustive: we list the ~35 languages most likely to
 * matter for the families and companions we're matching. When in doubt,
 * add a language here rather than in the consumer.
 *
 * HELP_CATEGORIES drives the checkbox grid on the post wizard's
 * "what help does Ma need" step. Each entry carries a stable `key` for
 * storage (never change these — they're in the `trips.help_categories`
 * array in the DB) plus human-readable label + description.
 */

/** Languages offered in onboarding + post wizard. Curated, not exhaustive. */
export const LANGUAGES: readonly string[] = [
  'English',
  'Bengali',
  'Hindi',
  'Urdu',
  'Punjabi',
  'Tamil',
  'Telugu',
  'Marathi',
  'Gujarati',
  'Malayalam',
  'Kannada',
  'Mandarin',
  'Cantonese',
  'Tagalog',
  'Vietnamese',
  'Indonesian',
  'Japanese',
  'Korean',
  'Arabic',
  'Turkish',
  'Persian',
  'Swahili',
  'Yoruba',
  'Igbo',
  'French',
  'German',
  'Dutch',
  'Spanish',
  'Portuguese',
  'Italian',
  'Polish',
  'Russian',
  'Ukrainian',
  'Romanian',
  'Greek',
];

export const HELP_CATEGORIES: readonly { key: string; label: string; description: string }[] = [
  {
    key: 'wheelchair',
    label: 'Wheelchair assistance',
    description: 'Pushing, transfers, gate-to-gate',
  },
  { key: 'bags', label: 'Carrying bags', description: 'Lifting, trolley handling' },
  { key: 'immigration', label: 'Immigration forms', description: 'Reading, filling, explaining' },
  { key: 'food', label: 'Meals and dietary', description: 'Vegetarian, Jain, diabetic, halal' },
  { key: 'prayer', label: 'Prayer time & facilities', description: 'Finding a quiet space' },
  { key: 'medication', label: 'Medication reminders', description: 'Timing, dosage' },
  { key: 'language', label: 'Language translation', description: 'At counters and security' },
  { key: 'wayfinding', label: 'Wayfinding', description: 'Gates, transfers, signage' },
];
