import { describe, it, expect, vi, afterEach } from "vitest";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetModules();
});

async function loadService() {
  vi.stubEnv("LLM_API_KEY", "test-key");
  vi.stubEnv("GEMINI_MODELS", "model-a");
  vi.resetModules();
  return import("../src/services/llmService");
}

const q = (topic: string, n: number) => ({
  text: `Question ${n}?`,
  options: ["a", "b", "c", "d"],
  correctOptionIndex: 0,
  topic,
});

const reply = (items: unknown[]) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] }),
});

describe("splitCount", () => {
  it("splits as evenly as possible and always adds up", async () => {
    const { splitCount } = await loadService();
    expect(splitCount(7, 3)).toEqual([3, 2, 2]);
    expect(splitCount(6, 3)).toEqual([2, 2, 2]);
    expect(splitCount(3, 5)).toEqual([1, 1, 1, 0, 0]);
    expect(splitCount(40, 7).reduce((a, b) => a + b, 0)).toBe(40);
  });
});

describe("generateQuestionsForTopics with a chosen count", () => {
  it("asks the model for the requested total, split across topics", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply([q("A", 1)]));
    vi.stubGlobal("fetch", fetchMock);
    const { generateQuestionsForTopics } = await loadService();

    await generateQuestionsForTopics(["A", "B", "C"], 7);

    const prompt = JSON.parse(fetchMock.mock.calls[0][1].body).contents[0].parts[0].text;
    expect(prompt).toContain("exactly 7");
    expect(prompt).toContain('3 for "A"');
    expect(prompt).toContain('2 for "B"');
    expect(prompt).toContain('2 for "C"');
  });

  it("never returns more questions than were asked for", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([q("A", 1), q("A", 2), q("A", 3)])));
    const { generateQuestionsForTopics } = await loadService();

    const out = await generateQuestionsForTopics(["A"], 2);

    expect(out).toHaveLength(2);
  });

  it("rejects a nonsense count before calling the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generateQuestionsForTopics } = await loadService();

    await expect(generateQuestionsForTopics(["A"], 0)).rejects.toThrow(/between 1 and 100/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});