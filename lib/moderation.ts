/**
 * OpenAI Moderation wrapper. Runs on every user-generated text before write.
 * See Product Spec §6.1 — moderation failures land in the admin queue; we
 * still accept the content in v1 but flag it.
 */

interface ModerationResult {
  flagged: boolean;
  categories?: Record<string, boolean>;
  scores?: Record<string, number>;
}

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
