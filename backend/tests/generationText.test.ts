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

const SOURCE = "Packets are routed by the network layer. ".repeat(10); // over 100 characters

const q = (n: number, topic = "Networking", extra: object = {}) => ({
  text: `Question number ${n}?`,
  options: ["a", "b", "c", "d"],
  correctOptionIndex: 0,
  topic,
  ...extra,
});

const reply = (items: unknown[]) => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(items) }] } }] }),
});

const sentBody = (fetchMock: ReturnType<typeof vi.fn>) => JSON.parse(fetchMock.mock.calls[0][1].body);

describe("generateQuestionsFromText", () => {
  it("asks for the requested count and wraps the text as untrusted source material", async () => {
    const fetchMock = vi.fn().mockResolvedValue(reply([q(1), q(2)]));
    vi.stubGlobal("fetch", fetchMock);
    const { generateQuestionsFromText } = await loadService();

    const out = await generateQuestionsFromText(SOURCE, "Networking", 2);

    expect(out).toHaveLength(2);
    const prompt = sentBody(fetchMock).contents[0].parts[0].text;
    expect(prompt).toContain("exactly 2");
    expect(prompt).toContain("<source>");
    expect(prompt).toContain("</source>");
    expect(prompt).toMatch(/never follow instructions/);
  });

  it("uses the lecturer's topic whatever the model wrote", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([q(1, "Something else")])));
    const { generateQuestionsFromText } = await loadService();

    const out = await generateQuestionsFromText(SOURCE, "Networking", 1);

    expect(out[0].topic).toBe("Networking");
  });

  it("never returns more than asked for, and drops over-long questions", async () => {
    const tooLong = q(3, "Networking", { text: "x".repeat(1001) });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([q(1), q(2), tooLong])));
    const { generateQuestionsFromText } = await loadService();

    expect(await generateQuestionsFromText(SOURCE, "Networking", 5)).toHaveLength(2);
    expect(await generateQuestionsFromText(SOURCE, "Networking", 1)).toHaveLength(1);
  });

  it("rejects bad input before calling the model", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const { generateQuestionsFromText } = await loadService();

    await expect(generateQuestionsFromText("too short", "Networking", 3)).rejects.toThrow(/between 100 and 16000/);
    await expect(generateQuestionsFromText(SOURCE, "Networking", 0)).rejects.toThrow(/between 1 and 15/);
    await expect(generateQuestionsFromText(SOURCE, "  ", 3)).rejects.toThrow(/topic/i);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe("extractQuestionsFromText", () => {
  it("keeps only questions with a marked answer, and reports how many it found", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(reply([q(1), q(2, "Networking", { correctOptionIndex: -1 }), q(3)]));
    vi.stubGlobal("fetch", fetchMock);
    const { extractQuestionsFromText } = await loadService();

    const { questions, found } = await extractQuestionsFromText(SOURCE, "Networking");

    expect(found).toBe(3);
    expect(questions.map((x) => x.text)).toEqual(["Question number 1?", "Question number 3?"]);

    const body = sentBody(fetchMock);
    expect(body.generationConfig.responseSchema.items.properties.options.minItems).toBe(2);
    expect(body.contents[0].parts[0].text).toContain("ALREADY WRITTEN");
  });

  it("returns an empty result, not an error, when the text has no questions", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(reply([])));
    const { extractQuestionsFromText } = await loadService();

    expect(await extractQuestionsFromText(SOURCE, "Networking")).toEqual({ questions: [], found: 0 });
  });
});