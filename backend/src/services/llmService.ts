/**
 * Server-side-only call to the LLM provider (Google Gemini) for question
 * generation. The API key never leaves this process; the client never talks
 * to the LLM directly (see Security Addendum Section 7 / 8).
 *
 * Gemini's free tier (Google AI Studio) is generous enough to develop and
 * test this whole flow at no cost. Swap the model/endpoint here later if you
 * move to a paid provider - the rest of the app only depends on
 * GeneratedQuestion[], not on Gemini specifically.
 */
export interface GeneratedQuestion {
  text: string;
  options: string[];
  correctOptionIndex: number;
  topic: string;
}

// Tried in order - if one is overloaded, fall back to the next rather than
// retrying the same congested model repeatedly.
const GEMINI_MODELS = ["gemini-3.6-flash", "gemini-3.0-flash", "gemini-3.6-flash-lite"];

function geminiUrl(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

const RESPONSE_SCHEMA = {
  type: "ARRAY",
  items: {
    type: "OBJECT",
    properties: {
      text: { type: "STRING" },
      options: { type: "ARRAY", items: { type: "STRING" }, minItems: 4, maxItems: 4 },
      correctOptionIndex: { type: "INTEGER" },
      topic: { type: "STRING" },
    },
    required: ["text", "options", "correctOptionIndex", "topic"],
  },
};

/** Runtime shape/bounds check - never trust the model's output blindly. */
function validate(raw: unknown, allowedTopics: string[]): GeneratedQuestion[] {
  if (!Array.isArray(raw)) throw new Error("LLM response was not an array");

  const out: GeneratedQuestion[] = [];
  for (const item of raw) {
    if (
      typeof item !== "object" ||
      item === null ||
      typeof (item as any).text !== "string" ||
      !Array.isArray((item as any).options) ||
      (item as any).options.length < 2 ||
      (item as any).options.length > 6 ||
      !(item as any).options.every((o: unknown) => typeof o === "string" && o.trim().length > 0) ||
      typeof (item as any).correctOptionIndex !== "number" ||
      !Number.isInteger((item as any).correctOptionIndex) ||
      (item as any).correctOptionIndex < 0 ||
      (item as any).correctOptionIndex >= (item as any).options.length ||
      typeof (item as any).topic !== "string" ||
      !allowedTopics.includes((item as any).topic)
    ) {
      continue; // drop malformed/out-of-scope items rather than failing the whole batch
    }
    out.push(item as GeneratedQuestion);
  }

  if (out.length === 0) throw new Error("LLM returned no valid questions after validation");
  return out;
}

async function callGemini(apiKey: string, prompt: string): Promise<string> {
  const attemptsPerModel = 2;
  let lastError = "";

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      const res = await fetch(`${geminiUrl(model)}?key=${encodeURIComponent(apiKey)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: RESPONSE_SCHEMA,
            temperature: 0.7,
          },
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const textOut: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
        if (!textOut) throw new Error("Gemini returned no content");
        return textOut;
      }

      // 429 (rate limit) and 503 (overloaded) are transient - worth retrying, then
      // falling back to the next model. Anything else fails immediately.
      if (res.status !== 429 && res.status !== 503) {
        const errBody = await res.text().catch(() => "");
        throw new Error(`Gemini API error (${res.status}, ${model}): ${errBody.slice(0, 300)}`);
      }

      lastError = await res.text().catch(() => `HTTP ${res.status}`);
      if (attempt < attemptsPerModel) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1))); // 1s, then 2s
      }
    }
    // Exhausted retries for this model - try the next one in the list.
  }

  throw new Error(
    `All Gemini models are currently overloaded. Try again in a minute. (${lastError.slice(0, 200)})`
  );
}

export async function generateQuestionsForTopics(
  topics: string[],
  countPerTopic = 5
): Promise<GeneratedQuestion[]> {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    throw new Error("LLM_API_KEY is not configured (see .env.example - Gemini API key)");
  }
  if (!Array.isArray(topics) || topics.length === 0 || topics.length > 20) {
    throw new Error("Provide between 1 and 20 topics");
  }

  const prompt = [
    `Generate exactly ${countPerTopic} multiple-choice exam questions for EACH of these topics: ${topics.join(", ")}.`,
    "Each question must have exactly 4 options, plausible distractors, and exactly one correct answer.",
    "Set correctOptionIndex to the 0-based index of the correct option within that question's options array.",
    "Set topic to exactly one of the provided topic strings, unchanged.",
    "Do not include any explanation, markdown, or text outside the JSON array.",
  ].join(" ");

  const textOut = await callGemini(apiKey, prompt);

  let parsed: unknown;
  try {
    parsed = JSON.parse(textOut);
  } catch {
    throw new Error("Gemini response was not valid JSON");
  }

  return validate(parsed, topics);
}