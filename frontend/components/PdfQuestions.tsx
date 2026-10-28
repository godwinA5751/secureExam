import { useRef, useState } from "react";
import { api } from "../lib/api";
import {
  MAX_PDF_MB,
  MAX_PDF_PAGES,
  chunkPages,
  extractPdfPages,
  maxQuestionsFor,
  planBatches,
} from "../lib/pdfText";
import { topicFromFileName } from "../lib/topics";

type Mode = "generate" | "extract";
type Props = { testId: string; onChanged: () => Promise<void> };

export default function PdfQuestions({ testId, onChanged }: Props) {
  const [mode, setMode] = useState<Mode>("generate");
  const [topicLabel, setTopicLabel] = useState("");
  const [count, setCount] = useState(20);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const stopRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function run(file: File) {
    const label = topicLabel.trim() || topicFromFileName(file.name);
    stopRef.current = false;
    setError(null);
    setMessage(null);
    setBusy(true);

    const totals = { added: 0, duplicates: 0, withoutAnswer: 0 };
    let note = "";
    const summary = () =>
      `Added ${totals.added} question${totals.added === 1 ? "" : "s"} for review.` +
      (totals.duplicates ? ` ${totals.duplicates} duplicate${totals.duplicates === 1 ? "" : "s"} skipped.` : "") +
      (totals.withoutAnswer
        ? ` ${totals.withoutAnswer} skipped because no clear correct answer was marked.`
        : "") +
      note;

    try {
      if (file.size > MAX_PDF_MB * 1024 * 1024) throw new Error(`That PDF is larger than ${MAX_PDF_MB} MB.`);

      setProgress("Reading the PDF…");
      const pages = await extractPdfPages(file, (done, total) =>
        setProgress(`Reading the PDF… page ${done} of ${total}`)
      );

      if (mode === "generate") {
        const chunks = chunkPages(pages);
        const limit = maxQuestionsFor(chunks);
        if (limit < 1) throw new Error("There is not enough readable text in this PDF to write questions from.");
        const wanted = Math.min(count, limit);
        if (wanted < count) note = ` This PDF only has enough text for about ${limit} questions.`;

        const plan = planBatches(chunks.length, wanted);
        for (let i = 0; i < plan.length; i++) {
          if (stopRef.current) {
            note += " Stopped early.";
            break;
          }
          setProgress(`Writing questions… part ${i + 1} of ${plan.length}`);
          const r = await api.generateFromText(testId, {
            mode,
            text: chunks[plan[i].chunk],
            topic: label,
            count: plan[i].count,
          });
          totals.added += r.added;
          totals.duplicates += r.duplicatesSkipped;
        }
      } else {
        const chunks = chunkPages(pages, undefined, 1); // 1-page overlap, see chunkPages
        for (let i = 0; i < chunks.length; i++) {
          if (stopRef.current) {
            note += " Stopped early.";
            break;
          }
          setProgress(`Looking for questions… part ${i + 1} of ${chunks.length}`);
          const r = await api.generateFromText(testId, { mode, text: chunks[i], topic: label });
          totals.added += r.added;
          totals.duplicates += r.duplicatesSkipped;
          totals.withoutAnswer += r.withoutAnswer;
        }
      }
      setMessage(summary());
    } catch (err: any) {
      setError(totals.added > 0 ? `Stopped after adding ${totals.added} question(s): ${err.message}` : err.message);
    } finally {
      setBusy(false);
      setProgress("");
      if (fileRef.current) fileRef.current.value = "";
      if (totals.added > 0) await onChanged();
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 p-6">
      <h3 className="text-sm font-medium text-slate-800">Questions from a PDF</h3>
      <p className="mt-1 text-xs text-slate-500">
        The PDF is read in your browser and is not uploaded. Only its text is sent to Google&apos;s Gemini.
        Up to {MAX_PDF_PAGES} pages and {MAX_PDF_MB} MB. Scanned PDFs are not supported.
      </p>

      <div className="mt-3 space-y-1 text-xs text-slate-700">
        <label className="flex items-start gap-2">
          <input type="radio" name="pdf-mode" checked={mode === "generate"} disabled={busy} onChange={() => setMode("generate")} />
          <span>
            <b>Write new questions</b> from my course material
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="pdf-mode" checked={mode === "extract"} disabled={busy} onChange={() => setMode("extract")} />
          <span>
            <b>Copy questions already in the PDF.</b> Only questions with a clearly marked correct answer (tick,
            asterisk, answer key) are added. Always check the answers during review.
          </span>
        </label>
      </div>

      <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-1 lg:grid-cols-3">
        <input
          value={topicLabel}
          onChange={(e) => setTopicLabel(e.target.value)}
          disabled={busy}
          placeholder="Topic label (default: the file's name)"
          aria-label="Topic label for these questions"
          className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs"
        />
        {mode === "generate" && (
          <label className="flex items-center gap-2 text-xs text-slate-600">
            Questions to write
            <input
              type="number"
              min={1}
              max={150}
              value={count}
              disabled={busy}
              onChange={(e) => setCount(Math.min(150, Math.max(1, Number(e.target.value) || 1)))}
              className="w-20 rounded-lg border border-slate-300 px-2 py-1 text-sm"
            />
          </label>
        )}
        <input
          ref={fileRef}
          type="file"
          accept="application/pdf,.pdf"
          disabled={busy}
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) run(file);
          }}
          className="text-xs"
        />
      </div>

      {busy && (
        <div className="mt-2 flex items-center gap-3">
          <p role="status" className="text-xs text-slate-500">
            {progress}
          </p>
          <button type="button" onClick={() => (stopRef.current = true)} className="text-xs font-medium text-red-600 hover:underline">
            Stop after this part
          </button>
        </div>
      )}
      {message && <p className="mt-2 text-xs text-slate-700">{message}</p>}
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}