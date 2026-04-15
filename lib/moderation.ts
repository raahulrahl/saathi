/**
 * OpenAI Moderation wrapper. Runs on every user-generated free-text
 * field (trip notes, match-request intros, profile bios) before it
 * lands in the database.
 *
 * Fails open on three conditions:
 *   1. OPENAI_API_KEY unset (local dev, preview without the secret)
 *   2. Non-2xx response from OpenAI (API outage, rate limit)
 *   3. Unexpected JSON shape
 *
 * Failing open is deliberate — we'd rather have a user's post go
 * through without moderation than have moderation-API hiccups block
 * everyone from posting. The admin queue (see Product Spec §6.1)
 * catches the false negatives.
 */

/**
 * Result of a moderation call. `flagged` is the only load-bearing field
 * for gate logic; `categories` and `scores` are forwarded to the admin
 * queue for context when reviewing borderline content.
 */
interface ModerationResult {
  flagged: boolean;
  categories?: Record<string, boolean>;
  scores?: Record<string, number>;
}

/**
 * Run OpenAI's omni-moderation model over `text` and return whether it
 * crossed any of the configured thresholds. Uses the stable
 * `omni-moderation-latest` model — don't pin to a dated snapshot, we
 * want OpenAI's latest policies automatically.
 */
export async function moderateText(text: string): Promise<ModerationResult> {
  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    // In local dev without a key, don't block writes.
    return { flagged: false };
  }
  const res = await fetch('https://api.openai.com/v1/moderations', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: 'omni-moderation-latest', input: text }),
  });
  if (!res.ok) {
    return { flagged: false }; // fail-open; admin queue catches false negatives
  }
  const json = (await res.json()) as {
    results?: Array<{
      flagged?: boolean;
      categories?: Record<string, boolean>;
      category_scores?: Record<string, number>;
    }>;
  };
  const first = json.results?.[0];
  return {
    flagged: !!first?.flagged,
    ...(first?.categories ? { categories: first.categories } : {}),
    ...(first?.category_scores ? { scores: first.category_scores } : {}),
  };
}
