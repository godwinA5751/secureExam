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
// Tried in order. Override without a code change: GEMINI_MODELS=model-a,model-b in .env
const GEMINI_MODELS = (process.env.GEMINI_MODELS ?? "gemini-3.5-flash,gemini-3.5-flash-lite,gemini-3.1-flash-lite")
  .split(",")
  .map((m) => m.trim())
  .filter(Boolean);

const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS ?? 30_000); // one HTTP call
const TOTAL_TIMEOUT_MS = Number(process.env.LLM_TOTAL_TIMEOUT_MS ?? 60_000); // whole generation

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
  const failures: string[] = [];
  const giveUpAt = Date.now() + TOTAL_TIMEOUT_MS;

  for (const model of GEMINI_MODELS) {
    for (let attempt = 1; attempt <= attemptsPerModel; attempt++) {
      const remainingMs = giveUpAt - Date.now();
      if (remainingMs <= 0) {
        throw new Error(`Gemini generation timed out after ${TOTAL_TIMEOUT_MS}ms. ${failures.join("; ")}`);
      }

      let res: Awaited<ReturnType<typeof fetch>>;
      try {
        res = await fetch(`${geminiUrl(model)}?key=${encodeURIComponent(apiKey)}`, {
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
          // Covers connecting AND reading the body, so a stalled response can't hang the request.
          signal: AbortSignal.timeout(Math.min(REQUEST_TIMEOUT_MS, remainingMs)),
        });
      } catch (e: any) {
        // Timeout or network failure: this model is slow or unreachable, so try the next one.
        failures.push(`${model}: ${e?.name === "TimeoutError" ? "timeout" : "network error"}`);
        break;
      }

      if (res.ok) {
        try {
          const data: any = await res.json();
          const textOut: string | undefined = data?.candidates?.[0]?.content?.parts?.[0]?.text;
          if (!textOut) throw new Error("no content");
          return textOut;
        } catch (e: any) {
          failures.push(`${model}: ${e?.name === "TimeoutError" ? "timeout" : "bad response"}`);
          break;
        }
      }

      const errBody = await res.text().catch(() => "");

      // 404: this model name is retired or invalid. Retrying is pointless, so go to the next model.
      if (res.status === 404) {
        failures.push(`${model}: not found`);
        break;
      }

      // 429 / 503: transient. Retry this model, then fall back to the next.
      if (res.status === 429 || res.status === 503) {
        failures.push(`${model}: ${res.status}`);
        if (attempt < attemptsPerModel) {
          await new Promise((r) => setTimeout(r, 1000 * 2 ** (attempt - 1)));
        }
        continue;
      }

      // 400 / 401 / 403 etc. are real problems (bad key, bad request). Fail immediately.
      throw new Error(`Gemini API error (${res.status}, ${model}): ${errBody.slice(0, 300)}`);
    }
  }

  throw new Error(`All Gemini models failed. ${failures.join("; ")}`);
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