import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadService() {
  vi.stubEnv("LLM_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODELS", "model-a,model-b");
  vi.stubEnv("LLM_REQUEST_TIMEOUT_MS", "50");
  vi.stubEnv("LLM_TOTAL_TIMEOUT_MS", "2000");
  vi.resetModules(); // the service reads its settings when it is first loaded
  return import("../src/services/llmService");
}

// A request that never answers, but still honors the abort signal like real fetch does.
const hangs = (_url: string, init: any) =>
  new Promise((_resolve, reject) => {
    init.signal.addEventListener("abort", () =>
      reject(Object.assign(new Error("timed out"), { name: "TimeoutError" }))
    );
  });

const okResponse = {
  ok: true,
  json: async () => ({
    candidates: [
      {
        content: {
          parts: [
            {
              text: JSON.stringify([
                { text: "Q?", options: ["a", "b", "c", "d"], correctOptionIndex: 1, topic: "Networking" },
              ]),
            },
          ],
        },
      },
    ],
  }),
};

describe("generateQuestionsForTopics timeouts", () => {
  it("abandons a hanging model and falls back to the next one", async () => {
    const fetchMock = vi.fn((url: string, init: any) =>
      String(url).includes("model-a") ? hangs(url, init) : Promise.resolve(okResponse)
    );
    vi.stubGlobal("fetch", fetchMock);
    const { generateQuestionsForTopics } = await loadService();

    const out = await generateQuestionsForTopics(["Networking"], 1);

    expect(out).toHaveLength(1);
    const urls = fetchMock.mock.calls.map((c) => String(c[0]));
    expect(urls.some((u) => u.includes("model-b"))).toBe(true);
  });

  it("fails cleanly instead of hanging when every model is unresponsive", async () => {
    vi.stubGlobal("fetch", vi.fn(hangs));
    const { generateQuestionsForTopics } = await loadService();

    await expect(generateQuestionsForTopics(["Networking"], 1)).rejects.toThrow(
      /All Gemini models failed/
    );
  });
});